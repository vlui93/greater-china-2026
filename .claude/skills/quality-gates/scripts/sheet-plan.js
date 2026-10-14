#!/usr/bin/env node
/* Write to a Sheet tab by id, not by row number, and prove afterwards that
 * only what was meant to change changed.
 *
 * Works from the reads the sheet gate saves (.qa/state/reads/<sheet>/<Tab>.json,
 * written each time the tab is read with get_values — read the whole tab, from
 * A1, with a few empty rows below the data).
 *
 *   node <path-to>/sheet-plan.js plan <spreadsheetId> <Tab> <changes.json>
 *       changes.json: { "set":    [ { "id": "ck-01", "section": "Documents" }, … ],
 *                       "append": [ { "id": "ck-99", "kind": "task", … }, … ] }
 *       Prints the exact update_values calls (range + values) to make, with long
 *       numbers protected as text, and saves the plan with a copy of the rows
 *       as they were.
 *   node <path-to>/sheet-plan.js verify <spreadsheetId> <Tab>
 *       After writing, read the tab again (get_values), then run this: every
 *       row must equal before + the plan, appended rows must be there, and
 *       nothing else may differ. Exit 1 on any difference. */
const fs = require('fs'), path = require('path');
const ROOT = process.env.CLAUDE_PROJECT_DIR || process.cwd();   // the project, wherever this script is kept
const STATE = path.join(ROOT, '.qa', 'state');
const [, , cmd, sid, tab, changesFile] = process.argv;
if (!cmd || !sid || !tab) { console.error('usage: sheet-plan.js plan|verify <spreadsheetId> <Tab> [changes.json]'); process.exit(2); }
const safe = tab.replace(/[^\w.-]+/g, '_');
const readFile = path.join(STATE, 'reads', sid, safe + '.json');
const planFile = path.join(STATE, 'plans', sid, safe + '.json');
function latestRead() {
  if (!fs.existsSync(readFile)) { console.error('No saved read of ' + tab + '. Read it with get_values (from A1) first.'); process.exit(2); }
  const r = JSON.parse(fs.readFileSync(readFile, 'utf8'));
  if (!/!A1(:|$)/.test(r.range)) { console.error('The saved read is ' + r.range + ' — read the tab from A1 so row numbers are right.'); process.exit(2); }
  return r;
}
const col = n => { let s = ''; n++; while (n) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); } return s; };
const protect = v => (typeof v === 'string' && /^\+?\d{11,}$/.test(v.trim())) ? "'" + v : (typeof v === 'number' && Math.abs(v) >= 1e11 ? "'" + String(v) : v);
const shown = v => String(v == null ? '' : v).replace(/^'/, '');

if (cmd === 'plan') {
  const r = latestRead(), head = r.values[0], ix = {};
  head.forEach((h, i) => ix[h] = i);
  if (ix.id !== 0) { console.error('The first column of ' + tab + ' is not "id".'); process.exit(2); }
  const rows = r.values.slice(1), byId = {};
  rows.forEach((row, i) => { if (row[0]) { if (byId[row[0]] != null) { console.error('Duplicate id ' + row[0] + ' at rows ' + (byId[row[0]] + 2) + ' and ' + (i + 2) + ' — fix that first.'); process.exit(2); } byId[row[0]] = i; } });
  const ch = JSON.parse(fs.readFileSync(changesFile, 'utf8')), calls = [], problems = [];
  (ch.set || []).forEach(c => {
    const i = byId[c.id]; if (i == null) { problems.push('no row with id ' + c.id); return; }
    const keys = Object.keys(c).filter(k => k !== 'id');
    const bad = keys.filter(k => ix[k] == null); if (bad.length) { problems.push(c.id + ': no column ' + bad.join(', ')); return; }
    const cols = keys.map(k => ix[k]), lo = Math.min(...cols), hi = Math.max(...cols);
    const vals = []; for (let j = lo; j <= hi; j++) { const k = head[j]; vals.push(k in c ? protect(c[k]) : (rows[i][j] == null ? '' : rows[i][j])); }
    calls.push({ range: tab + '!' + col(lo) + (i + 2) + ':' + col(hi) + (i + 2), values: [vals], id: c.id });
  });
  let next = rows.reduce((n, row, i) => row.some(v => v !== '' && v != null) ? i + 2 : n, 1) + 1;
  const endRow = +((String(r.range).match(/:[A-Z]+(\d+)$/) || [])[1] || 0);   // the reply leaves out empty rows; the range says how far the read went
  if (endRow < next && (ch.append || []).length) problems.push('the saved read ends at the last data row — read a few empty rows below it too, so appending cannot overwrite data the read missed');
  const app = (ch.append || []).map(a => {
    if (a.id && byId[a.id] != null) problems.push('append: id ' + a.id + ' already exists at row ' + (byId[a.id] + 2));
    const bad = Object.keys(a).filter(k => ix[k] == null); if (bad.length) problems.push('append ' + a.id + ': no column ' + bad.join(', '));
    return head.map(h => h in a ? protect(a[h]) : '');
  });
  if (app.length) calls.push({ range: tab + '!A' + next + ':' + col(head.length - 1) + (next + app.length - 1), values: app, append: true });
  if (problems.length) { console.error('Not planned:\n  ' + problems.join('\n  ')); process.exit(1); }
  fs.mkdirSync(path.dirname(planFile), { recursive: true });
  fs.writeFileSync(planFile, JSON.stringify({ t: new Date().toISOString(), head, before: r.values, set: ch.set || [], append: ch.append || [] }));
  console.log(JSON.stringify(calls.map(c => ({ range: c.range, values: c.values })), null, 1));
  console.error('\nPlanned ' + calls.length + ' write(s) to ' + tab + ' from the read at ' + r.t + '. After writing, read ' + tab + '!A1 again and run: node <path-to>/sheet-plan.js verify ' + sid + ' ' + JSON.stringify(tab));
  process.exit(0);
}

if (cmd === 'verify') {
  if (!fs.existsSync(planFile)) { console.error('No plan for ' + tab + '.'); process.exit(2); }
  const p = JSON.parse(fs.readFileSync(planFile, 'utf8')), after = latestRead();
  if (after.t <= p.t) { console.error('The saved read is older than the plan — read ' + tab + ' again after writing.'); process.exit(2); }
  const head = p.head, want = {};
  p.before.slice(1).forEach(row => { if (row[0]) want[row[0]] = head.map((h, j) => shown(row[j])); });
  p.set.forEach(c => Object.keys(c).forEach(k => { if (k !== 'id') want[c.id][head.indexOf(k)] = shown(c[k]); }));
  p.append.forEach(a => { want[a.id] = head.map(h => shown(a[h])); });
  const got = {}, diffs = [];
  after.values.slice(1).forEach((row, i) => { if (!row[0]) return; if (got[row[0]]) diffs.push('duplicate id ' + row[0]); got[row[0]] = { row: i + 2, v: head.map((h, j) => shown(row[j])) }; });
  Object.keys(want).forEach(id => {
    const g = got[id]; if (!g) { diffs.push(id + ': missing'); return; }
    head.forEach((h, j) => { if (want[id][j] !== g.v[j]) diffs.push(id + ' (row ' + g.row + ') ' + h + ': expected ' + JSON.stringify(want[id][j]) + ', found ' + JSON.stringify(g.v[j])); });
  });
  Object.keys(got).forEach(id => { if (!want[id]) diffs.push(id + ' (row ' + got[id].row + '): not in the plan or the rows before'); });
  if (diffs.length) { console.log('verify ' + tab + ': ' + diffs.length + ' difference(s):\n  ' + diffs.slice(0, 40).join('\n  ')); process.exit(1); }
  console.log('verify ' + tab + ': all ' + Object.keys(want).length + ' rows match the plan; nothing else changed.');
  process.exit(0);
}
console.error('unknown command ' + cmd); process.exit(2);
