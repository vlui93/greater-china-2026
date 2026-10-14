#!/usr/bin/env node
/* Gate for writes to a Google Sheet through the Sheets connector. Wired as
 * Claude Code hooks in .claude/settings.json; each rule is a past mistake:
 *
 *   - No write without a backup tab ("zz backup <Tab> <date>") made today in
 *     that spreadsheet. Bulk edits once needed one to undo.
 *   - No write to a tab that wasn't read in the last 20 minutes. A row number
 *     taken from an older read once overwrote the wrong place (rows move).
 *   - No long number written as a number: Sheets turned a booking reference
 *     into 9.87654E+15. Write it as text, with a leading apostrophe.
 *   - After a write: read the range back and compare (a reminder is injected).
 *
 * Modes (the hook passes the tool call as JSON on stdin):
 *   pre    PreToolUse on write tools: exit 2 blocks the call, stderr says why
 *   post   PostToolUse on write tools: records backups, reminds to read back
 *   read   PostToolUse on reads: records what was read, and when
 *   allow <spreadsheetId> <reason…>   a 30-minute exception, written to the log
 *   status                            what is recorded
 * State lives in .qa/state/ (gitignored: reads can hold booking details). */
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const DIR = path.join(ROOT, '.qa', 'state');
const FILE = path.join(DIR, 'sheet-gate.json');
const FRESH_MIN = 20, ALLOW_MIN = 30;

function load() { try { return JSON.parse(fs.readFileSync(FILE, 'utf8')); } catch (e) { return { sheets: {}, log: [] }; } }
function save(s) { fs.mkdirSync(DIR, { recursive: true }); s.log = (s.log || []).slice(-200); fs.writeFileSync(FILE, JSON.stringify(s, null, 1)); }
const today = () => new Date().toISOString().slice(0, 10);
const now = () => Date.now();
function sheet(s, id) { return s.sheets[id] || (s.sheets[id] = { backups: {}, reads: {}, readAny: 0, allowUntil: 0 }); }
function tabOf(range) { return String(range || '').split('!')[0].replace(/^'|'$/g, '').trim(); }
function block(msg) { process.stderr.write('Sheet gate: ' + msg + '\n'); process.exit(2); }
function stdinJson() { try { return JSON.parse(fs.readFileSync(0, 'utf8') || '{}'); } catch (e) { return {}; } }

const SAFE = r => (r.duplicateSheet && /^zz backup/i.test(r.duplicateSheet.newSheetName || '')) ||
  (r.updateSheetProperties && /^(index|hidden|index,hidden|hidden,index)$/.test(String(r.updateSheetProperties.fields || '').replace(/\s/g, '')));
const tool = n => String(n || '').replace(/^mcp__.*?__/, '');

function rangesOf(name, input) {
  if (input.range) return [input.range];
  if (Array.isArray(input.ranges)) return input.ranges;
  if (Array.isArray(input.data)) return input.data.map(d => d.range).filter(Boolean);
  return [];
}
/** Cells Sheets would turn into a mangled number: 11+ digits, unprotected. */
function longNumbers(values) {
  const bad = [];
  (values || []).forEach((row, i) => (row || []).forEach((v, j) => {
    if (typeof v === 'number' && Math.abs(v) >= 1e11) bad.push('row ' + (i + 1) + ' col ' + (j + 1) + ': ' + v);
    if (typeof v === 'string' && /^\+?\d{11,}$/.test(v.trim())) bad.push('row ' + (i + 1) + ' col ' + (j + 1) + ': "' + v + '"');
  }));
  return bad;
}

const mode = process.argv[2];
const s = load();

if (mode === 'allow') {
  const id = process.argv[3], why = process.argv.slice(4).join(' ').trim();
  if (!id || !why) { console.error('usage: sheet-gate.js allow <spreadsheetId> <reason>'); process.exit(1); }
  sheet(s, id).allowUntil = now() + ALLOW_MIN * 60000;
  s.log.push({ t: new Date().toISOString(), id, allow: why }); save(s);
  console.log('Writes to ' + id + ' allowed without the checks for ' + ALLOW_MIN + ' minutes. Reason logged: ' + why);
  process.exit(0);
}
if (mode === 'status') { console.log(JSON.stringify(s.sheets, null, 1)); process.exit(0); }

const ev = stdinJson(), name = tool(ev.tool_name), input = ev.tool_input || {};
const id = input.spreadsheetId || input.spreadsheet_id || '';
if (!id) process.exit(0);
const sh = sheet(s, id);

if (mode === 'read') {
  sh.readAny = now();
  const rs = name === 'get_values' ? [input.range] : (input.ranges || []);
  rs.forEach(r => { const t = tabOf(r); if (t) sh.reads[t] = now(); });
  // Keep the last two reads of each tab, for tools/qa/sheet-plan.js (by-id rows, before/after diff).
  if (name === 'get_values') {
    let res = ev.tool_response;
    try { if (Array.isArray(res)) res = res.map(x => x && x.text || '').join(''); if (typeof res === 'string') res = JSON.parse(res);
          if (res && res.content && Array.isArray(res.content)) res = JSON.parse(res.content.map(x => x.text || '').join('')); } catch (e) { res = null; }
    if (res && Array.isArray(res.values)) {
      const d = path.join(DIR, 'reads', id); fs.mkdirSync(d, { recursive: true });
      const f = path.join(d, tabOf(input.range).replace(/[^\w.-]+/g, '_') + '.json');
      if (fs.existsSync(f)) fs.renameSync(f, f.replace(/\.json$/, '.prev.json'));
      fs.writeFileSync(f, JSON.stringify({ t: new Date().toISOString(), range: res.range || input.range, values: res.values }));
    }
  }
  // A read of the whole spreadsheet's structure doesn't count as reading a tab's rows.
  save(s); process.exit(0);
}

if (mode === 'pre') {
  if (now() < (sh.allowUntil || 0)) process.exit(0);
  const reqs = name === 'update_spreadsheet' ? (input.requests || []) : null;
  if (reqs && reqs.length && reqs.every(SAFE)) process.exit(0);   // making or tidying a backup
  if (sh.backups[today()] == null) {
    block('no backup of this spreadsheet today. First copy the tab(s) you are about to change with update_spreadsheet ' +
      'duplicateSheet, newSheetName "zz backup <Tab> ' + today() + '" — then write. (If a backup truly is not needed, ' +
      'ask the person, then run: node tools/qa/sheet-gate.js allow ' + id + ' "<reason>")');
  }
  if (reqs) {
    if (now() - (sh.readAny || 0) > FRESH_MIN * 60000)
      block('read the spreadsheet (get_values on the rows involved) within ' + FRESH_MIN + ' minutes before a structural change — rows and sheet ids move.');
  } else {
    const stale = rangesOf(name, input).map(tabOf).filter(t => t && now() - (sh.reads[t] || 0) > FRESH_MIN * 60000);
    if (stale.length) block('read ' + [...new Set(stale)].join(', ') + ' with get_values in the last ' + FRESH_MIN + ' minutes before writing to it, ' +
      'and work out the row from that read by its id — a row number from an older read can point at a different row now.');
    const bad = longNumbers(input.values);
    if (bad.length) block('these would be turned into a rounded number like 1.2E+15 by the Sheet: ' + bad.slice(0, 5).join('; ') +
      '. Write them as text with a leading apostrophe, e.g. "\'1234567890123".');   // qa-allow: example
  }
  process.exit(0);
}

if (mode === 'post') {
  const reqs = name === 'update_spreadsheet' ? (input.requests || []) : [];
  const backups = reqs.filter(r => r.duplicateSheet && /^zz backup/i.test(r.duplicateSheet.newSheetName || ''));
  if (backups.length) {
    sh.backups[today()] = (sh.backups[today()] || []).concat(backups.map(r => r.duplicateSheet.newSheetName));
    s.log.push({ t: new Date().toISOString(), id, backup: backups.map(r => r.duplicateSheet.newSheetName) }); save(s);
    process.exit(0);
  }
  if (reqs.length && reqs.every(SAFE)) process.exit(0);
  s.log.push({ t: new Date().toISOString(), id, wrote: name, ranges: rangesOf(name, input) }); save(s);
  const where = rangesOf(name, input).join(', ') || 'the rows you changed';
  process.stdout.write(JSON.stringify({ hookSpecificOutput: { hookEventName: 'PostToolUse', additionalContext:
    'Sheet gate: now read back ' + where + ' (and the rows either side) with get_values, and compare with what you meant to write: ' +
    'right row (by id), right columns, dates and long numbers kept as text, and nothing else changed. Say what you checked.' } }));
  process.exit(0);
}
process.exit(0);
