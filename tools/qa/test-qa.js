#!/usr/bin/env node
/* Tests for the QA tools themselves, so a gate can't quietly stop gating:
 * the Sheet write gate, the by-id write planner, and the privacy scan. Each
 * case is a mistake that really happened. Runs on invented data in a temp
 * copy of the state directory; touches no Sheet. */
const { execFileSync, spawnSync } = require('child_process');
const fs = require('fs'), path = require('path'), os = require('os');
const ROOT = path.resolve(__dirname, '..', '..');
const STATE = path.join(ROOT, '.qa', 'state');
let fails = 0, n = 0;
const ok = (c, m) => { n++; if (!c) { fails++; console.log('  FAIL ' + m); } };
const run = (script, args, input) => spawnSync(process.execPath, [path.join(__dirname, script)].concat(args || []), { input: input || '', encoding: 'utf8', cwd: ROOT });

// Work on a scratch copy of the state, and put the real one back afterwards.
const saved = path.join(os.tmpdir(), 'qa-state-' + process.pid);
if (fs.existsSync(STATE)) fs.renameSync(STATE, saved);
try {
  const ID = 'TEST-SHEET', ev = (tool, input) => JSON.stringify({ tool_name: 'mcp__Google_Sheets__' + tool, tool_input: Object.assign({ spreadsheetId: ID }, input) });
  const write = ev('update_values', { range: 'Days!A2:D2', values: [['a', 'b', 'c', 'd']] });

  // Sheet gate
  ok(run('sheet-gate.js', ['pre'], write).status === 2, 'a write with no backup today is blocked');
  const bk = ev('update_spreadsheet', { requests: [{ duplicateSheet: { sourceSheetId: 1, newSheetName: 'zz backup Days 2000-01-01' } }] });
  ok(run('sheet-gate.js', ['pre'], bk).status === 0, 'making a backup tab is allowed');
  run('sheet-gate.js', ['post'], bk);
  ok(run('sheet-gate.js', ['pre'], write).status === 2, 'a write to a tab not read in the last 20 minutes is blocked (wrong-row risk)');
  run('sheet-gate.js', ['read'], ev('get_values', { range: 'Days!A1:D40' }));
  ok(run('sheet-gate.js', ['pre'], write).status === 0, 'after a fresh read of that tab, the write goes through');
  ok(run('sheet-gate.js', ['pre'], ev('append_values', { range: 'Bookings!A1', values: [['x']] })).status === 2, 'reading one tab does not clear writes to another');
  ok(run('sheet-gate.js', ['pre'], ev('update_values', { range: 'Days!A2', values: [['9876543210123456']] })).status === 2, 'an unprotected long number is blocked (would become 1.2E+15)');   // qa-allow: invented test data
  ok(run('sheet-gate.js', ['pre'], ev('update_values', { range: 'Days!A2', values: [["'9876543210123456"]] })).status === 0, 'the same number as text is fine');   // qa-allow: invented test data
  const post = run('sheet-gate.js', ['post'], write);
  ok(/read back Days!A2:D2/.test(post.stdout) && /additionalContext/.test(post.stdout), 'after a write it asks for a read-back');

  // By-id planner
  const D = path.join(STATE, 'reads', ID); fs.mkdirSync(D, { recursive: true });
  const put = (t, range, values) => fs.writeFileSync(path.join(D, 'Bookings.json'), JSON.stringify({ t, range, values }));
  const H = ['id', 'type', 'confirmation_no', 'details'];
  put('2000-01-01T00:00:00.000Z', 'Bookings!A1:D9', [H, ['bk-a', 'flight', 'X1', 'one'], ['bk-b', 'train', '', 'two']]);
  const ch = path.join(os.tmpdir(), 'qa-ch-' + process.pid + '.json');
  fs.writeFileSync(ch, JSON.stringify({ set: [{ id: 'bk-b', confirmation_no: '9876543210123456' }], append: [{ id: 'bk-c', type: 'ferry' }] }));   // qa-allow: invented test data
  const plan = run('sheet-plan.js', ['plan', ID, 'Bookings', ch]);
  const calls = plan.status === 0 ? JSON.parse(plan.stdout) : [];
  ok(calls.length === 2 && calls[0].range === 'Bookings!C3:C3' && calls[0].values[0][0] === "'9876543210123456", 'plan finds the row by id and protects the long number');   // qa-allow: invented test data
  ok(calls[1] && calls[1].range === 'Bookings!A4:D4', 'append goes after the last row of the fresh read');
  put('2099-01-01T00:00:00.000Z', 'Bookings!A1:D9', [H, ['bk-a', 'flight', 'X1', 'one'], ['bk-b', 'train', '9876543210123456', 'two'], ['bk-c', 'ferry', '', '']]);   // qa-allow: invented test data
  ok(run('sheet-plan.js', ['verify', ID, 'Bookings']).status === 0, 'verify passes when only the planned cells changed');
  put('2099-01-01T00:00:00.000Z', 'Bookings!A1:D9', [H, ['bk-a', 'flight', '9.87654E+15', 'one'], ['bk-b', 'train', '', 'two'], ['bk-c', 'ferry', '', '']]);
  const bad = run('sheet-plan.js', ['verify', ID, 'Bookings']);
  ok(bad.status === 1 && /bk-a .*expected "X1"/.test(bad.stdout) && /bk-b .*expected "9876543210123456"/.test(bad.stdout), 'verify catches the value written to the wrong row');   // qa-allow: invented test data
  fs.unlinkSync(ch);
} finally {
  fs.rmSync(STATE, { recursive: true, force: true });
  if (fs.existsSync(saved)) fs.renameSync(saved, STATE);
}

// Privacy scan: the shapes it must catch, on a throwaway file it is told to scan
const tmp = path.join(ROOT, 'tools', 'qa', '.scan-probe.tmp.js');
const probe = (text) => { fs.writeFileSync(tmp, text); try { return spawnSync('git', ['add', '-N', tmp], { cwd: ROOT }) && run('trip-scan.js'); } finally { spawnSync('git', ['rm', '--cached', '-q', '-f', tmp], { cwd: ROOT }); fs.unlinkSync(tmp); } };
const itin = probe('var D = {\n "2030-01-01":"Somewhere → Elsewhere",\n "2030-01-02":"Elsewhere",\n "2030-01-03":"Day trip"\n};\n');   // qa-allow: invented test data
ok(itin.status === 1 && /dates mapped to day titles/.test(itin.stdout), 'scan catches a day-by-day itinerary in code');
const mail = probe('// contact: someone.real@gmail.com\n');   // qa-allow: invented test data
ok(mail.status === 1 && /personal email/.test(mail.stdout), 'scan catches a personal email address');
const allowed = probe('const order = "12345678901"; // qa-allow: invented\n// npm: opencc-js@1.4.2, noreply@anthropic.com\n');
ok(!/probe/.test(allowed.stdout.split('\n').filter(l => /scan-probe/.test(l)).join('')), 'qa-allow, package@version and noreply addresses are not flagged');

// Privacy scan: names from the Sheet as read on this machine (invented reads, in a temp folder)
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'qa-scan-')), reads = path.join(dir, 'reads', 'TEST-SHEET'), names = path.join(dir, 'names.json');
  fs.mkdirSync(reads, { recursive: true });
  const put = (tab, values) => fs.writeFileSync(path.join(reads, tab + '.json'), JSON.stringify({ t: '2030-01-01T00:00:00Z', range: tab + '!A1:Z9', values }));
  put('Locations', [['id', 'name_en', 'name_zh', 'notes'], ['zq-invented-lookout', 'Invented Lookout Point', '虚构观景台', 'a private note that must not be copied']]);
  put('Bookings', [['id', 'type', 'description', 'confirmation_no'], ['bk-01', 'flight', 'Nowhere to Elsewhere, invented airline', 'ZQ7Q7Z']]);
  put('Members', [['id', 'name', 'key'], ['mem-1', 'Zedd', 'm-' + 'f'.repeat(64)]]);
  put('Checklist', [['id', 'text', 'done_by', 'assignee'], ['ck-1', 'Buy travel insurance', 'Quillon', 'Zedd, Quillon']]);
  const scan = text => { fs.writeFileSync(tmp, text); try { spawnSync('git', ['add', '-N', tmp], { cwd: ROOT });
      return spawnSync(process.execPath, [path.join(__dirname, 'trip-scan.js')], { encoding: 'utf8', cwd: ROOT, env: Object.assign({}, process.env, { QA_SCAN_READS: path.join(dir, 'reads'), QA_SCAN_NAMES: names }) }); }
    finally { spawnSync('git', ['rm', '--cached', '-q', '-f', tmp], { cwd: ROOT }); fs.unlinkSync(tmp); } };
  const hit = (r, why) => r.stdout.split('\n').filter(l => /scan-probe/.test(l) && l.includes(why)).length;
  let r = scan('const a = "zq-invented-lookout";\nconst b = "虚构观景台";\nconst c = "ref ZQ7Q7Z";\n// thanks Quillon\n');
  ok(r.status === 1 && hit(r, 'Sheet Locations.id') === 1 && hit(r, 'Sheet Locations.name_zh') === 1 && hit(r, 'Sheet Bookings.confirmation_no') === 1 && hit(r, "a person's name") === 1,
     'scan catches a place id, a Chinese place name, a booking reference and a person\'s name taken from Sheet reads');
  ok(!/zq-invented-lookout|虚构观景台|ZQ7Q7Z|Quillon/.test(r.stdout), 'and reports where, without printing the name itself');
  ok(/names from the Sheet as read on this machine/.test(r.stdout), 'the summary says the Sheet reads were used');
  const kept = fs.readFileSync(names, 'utf8');
  ok(!kept.includes('f'.repeat(64)) && !kept.includes('private note') && !kept.includes('Buy travel insurance'), 'keys, notes and checklist text are never copied into the kept list');
  r = scan('const who = "Zeddington"; const n = "Buy travel insurance"; const x = "bk-01";\n');
  ok(!hit(r, 'Sheet'), 'a name inside a longer word, checklist text and plain numbering are not flagged');
  fs.rmSync(path.join(dir, 'reads'), { recursive: true, force: true });
  r = scan('const a = "zq-invented-lookout";\n');
  ok(r.status === 1 && hit(r, 'Sheet Locations.id') === 1, 'names stay known after the reads themselves are gone');
  fs.rmSync(dir, { recursive: true, force: true });
}

// Plan check: the scheduling rules from the first trip, on an invented plan
{
  const P = (id, type, notes) => ({ id, name_en: 'Place ' + id, name_zh: '地' + id, city: 'Testville', type, lat: '1', lng: '2', nav_app: 'amap', notes: notes || '' });
  const S = (id, date, lid, t, notes) => ({ id, date, location_id: lid, planned_time: t || '', notes: notes || '' });
  const plan = {
    locations: [P('a', 'attraction'), P('park', 'attraction', 'An all-day park at altitude.'), P('mus', 'attraction', 'Closed Mondays.'),
                P('r1', 'restaurant', 'Spice: mild options — the clear broth'), P('r2', 'restaurant'), P('r3', 'restaurant', 'Spice: none')],
    schedule: [
      // 2030-03-04 is a Monday
      S('1', '2030-03-04', 'mus', '10:00'), S('2', '2030-03-04', 'r1', '12:00'), S('3', '2030-03-04', 'r3', '19:00'), S('4', '2030-03-04', 'a', '', 'OPTIONAL — or this'),
      S('5', '2030-03-05', 'park', '08:00'), S('6', '2030-03-05', 'r1', '12:00'), S('7', '2030-03-05', 'r3', '18:00'), S('8', '2030-03-05', 'a', '', 'OPTIONAL — x'),
      S('9', '2030-03-06', 'a', '08:00', 'Day trip out of town'), S('10', '2030-03-06', 'r2', '12:00'), S('11', '2030-03-06', 'r3', '18:00'), S('12', '2030-03-06', 'a', '', 'OPTIONAL — y'),
      S('13', '2030-03-07', 'nowhere', '10:00')],
    bookings: [], days: [] };
  const f = path.join(os.tmpdir(), 'qa-plan-' + process.pid + '.json');
  fs.writeFileSync(f, JSON.stringify(plan));
  const pc = run('plan-check.js', [f]);
  ok(pc.status === 1 && /ERROR 2030-03-06: heavy day 2 in a row/.test(pc.stdout), 'plan check: two heavy days in a row (all-day park, then a day trip) is an error');
  ok(!/ERROR 2030-03-05/.test(pc.stdout), 'plan check: one heavy day on its own is fine');
  ok(/warn  2030-03-04: Place mus: its notes say "closed mondays"/.test(pc.stdout) && !/ERROR 2030-03-04/.test(pc.stdout), 'plan check: a closed-day hint is a warning to check, never an error');
  ok(/warn  Place r2: no "Spice:" line/.test(pc.stdout) && !/Place r1: no "Spice:"/.test(pc.stdout), 'plan check: a restaurant without a Spice line is flagged, one with it is not');
  ok(/ERROR 2030-03-07: stop 13 points at a missing place/.test(pc.stdout), 'plan check: a stop pointing at a missing place is an error');
  plan.days = [{ date: '2030-03-06', label: 'Easy day out — light' }];
  fs.writeFileSync(f, JSON.stringify(plan));
  ok(!/heavy day 2 in a row/.test(run('plan-check.js', [f]).stdout), 'plan check: a day labelled "light" in Days is not counted as heavy');
  fs.unlinkSync(f);
}

console.log(fails ? 'QA tool tests: ' + fails + ' of ' + n + ' FAILED' : 'QA tool tests: all ' + n + ' passed');
process.exit(fails ? 1 : 0);
