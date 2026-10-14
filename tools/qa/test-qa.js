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

console.log(fails ? 'QA tool tests: ' + fails + ' of ' + n + ' FAILED' : 'QA tool tests: all ' + n + ' passed');
process.exit(fails ? 1 : 0);
