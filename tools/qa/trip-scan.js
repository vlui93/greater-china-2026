#!/usr/bin/env node
/* Privacy scan for everything git would commit. This repo is public and GitHub
 * Pages serves it, so no trip content and nothing personal may be in it.
 *
 * It flags, in every tracked or new (not ignored) text file:
 *   1. anything from the real trip, when src/seed.json is on this machine: ids,
 *      Chinese and English place names, booking descriptions and references;
 *   1b. the same from the Sheet itself, whenever this machine has read it: the
 *      Sheet gate keeps each tab read in .qa/state/reads/, and every scan folds
 *      the ids, place names, booking descriptions and references, and people's
 *      names from those into .qa/scan-names.local.json (gitignored), where they
 *      stay after the reads are replaced. So a session that has looked at the
 *      Sheet scans against the real trip without src/seed.json. Keys and
 *      notes are never copied into that file;
 *   2. words in .qa/private-words.local.txt (gitignored; one per line: names,
 *      email addresses, anything else that must never be committed);
 *   3. shapes that are trip content whatever the words: a run of dates mapped
 *      to day titles (an itinerary), personal email addresses, and reference-
 *      like numbers of 10+ digits.
 * A line can opt out of 3 with the marker  qa-allow  (say why next to it).
 *
 *   node tools/qa/trip-scan.js          scan, exit 1 on any finding
 *   node tools/qa/trip-scan.js --staged  only what is staged for commit
 */
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const ROOT = path.resolve(__dirname, '..', '..');
const sh = c => execSync(c, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
const staged = process.argv.includes('--staged');
const files = (staged ? sh('git diff --cached --name-only --diff-filter=ACMR') : sh('git ls-files -co --exclude-standard'))
  .split('\n').filter(Boolean)
  .filter(f => !/^(vendor|icons)\//.test(f) && !/\.(png|jpe?g|gif|ico|webp|woff2?|ttf|pdf|zip|gz)$/i.test(f))
  .filter(f => f !== 't2s.js' && f !== 'tools/qa/trip-scan.js' && fs.existsSync(path.join(ROOT, f)));

/* ---- what to look for ---- */
const needles = new Map();            // text -> where it comes from
const GENERIC = /^(bk|sc|ck|pk|loc|day)-\d{1,3}$/i;   // numbering any trip has
function add(v, why) {
  v = String(v == null ? '' : v).trim();
  if (v.length < 4 || GENERIC.test(v) || /^(hotel|train|flight|ferry|ticket|google|amap)$/i.test(v)) return;
  needles.set(v, why);
}
const seedPath = path.join(ROOT, 'src', 'seed.json');
if (fs.existsSync(seedPath)) {
  const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
  for (const g of ['bookings', 'locations', 'schedule']) for (const r of seed[g] || []) {
    ['id', 'name_zh', 'confirmation_no'].forEach(k => add(r[k], 'seed ' + g + '.' + k));
    if (r.name_en && String(r.name_en).length >= 8) add(r.name_en, 'seed ' + g + '.name_en');
    if (r.description) add(r.description, 'seed ' + g + '.description');
  }
}
/* 1b. Names from the Sheet's own tabs, as last read on this machine. */
const readsDir = process.env.QA_SCAN_READS || path.join(ROOT, '.qa', 'state', 'reads');
const namesPath = process.env.QA_SCAN_NAMES || path.join(ROOT, '.qa', 'scan-names.local.json');
const TAKE = {   // tab -> columns worth knowing; `person` columns are people's names
  Locations: { id: 1, name_zh: 1, name_en: 1 }, Bookings: { id: 1, description: 1, confirmation_no: 1 }, Schedule: { id: 1 },
  Bin: { name: 1, deleted_by: 'person' }, Checklist: { done_by: 'person', assignee: 'person' }, Members: { name: 'person' }
};
function sheetNames() {
  let known = {}; try { known = JSON.parse(fs.readFileSync(namesPath, 'utf8')); } catch (e) { /* none yet */ }
  const before = Object.keys(known).length;
  let dirs = []; try { dirs = fs.readdirSync(readsDir); } catch (e) { /* this machine hasn't read the Sheet */ }
  for (const d of dirs) {
    let fl = []; try { fl = fs.readdirSync(path.join(readsDir, d)); } catch (e) { continue; }
    for (const f of fl) {
      const tab = f.replace(/(\.prev)?\.json$/, ''), cols = TAKE[tab]; if (!cols) continue;
      let v; try { v = JSON.parse(fs.readFileSync(path.join(readsDir, d, f), 'utf8')).values; } catch (e) { continue; }
      if (!Array.isArray(v) || !v.length) continue;
      const h = v[0].map(String);
      for (const row of v.slice(1)) for (const c of Object.keys(cols)) {
        const i = h.indexOf(c); if (i < 0) continue;
        String(row[i] == null ? '' : row[i]).split(cols[c] === 'person' ? /\s*[,;\/&]\s*/ : /\u0000/).forEach(x => {
          x = x.trim(); if (x) known[x] = (cols[c] === 'person' ? 'person: ' : '') + 'Sheet ' + tab + '.' + c; });
      }
    }
  }
  if (Object.keys(known).length !== before) { try { fs.mkdirSync(path.dirname(namesPath), { recursive: true }); fs.writeFileSync(namesPath, JSON.stringify(known)); } catch (e) { /* read-only checkout */ } }
  return known;
}
const fromSheet = sheetNames();
let sheetCount = 0;
for (const [v, why] of Object.entries(fromSheet)) {
  const n0 = needles.size;
  if (/^person: /.test(why)) { if (v.length >= 3) needles.set(v, why.slice(8) + " (a person's name)"); }
  else if (/\.name_en$/.test(why)) { if (v.length >= 8) add(v, why); }
  else add(v, why);
  if (needles.size > n0) sheetCount++;
}
const privPath = path.join(ROOT, '.qa', 'private-words.local.txt');
if (fs.existsSync(privPath)) fs.readFileSync(privPath, 'utf8').split('\n').map(s => s.trim())
  .filter(s => s && !s.startsWith('#')).forEach(w => needles.set(w, 'private word'));

const SHAPES = [
  // three or more "YYYY-MM-DD": "a title" pairs close together: a day-by-day itinerary
  { why: 'dates mapped to day titles (an itinerary)', re: /(["']\d{4}-\d\d-\d\d["']\s*:\s*["'][^"'\n]{3,}["'][\s\S]{0,80}?){3,}/g },
  { why: 'personal email address', re: /\b[\w.+-]+@(?!example\.(?:com|org)\b|anthropic\.com\b|users\.noreply)[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/gi },
  { why: 'reference-like number (10+ digits)', re: /(?<![\w.#-])\d{10,}(?![\w.])/g }
];

/* ---- scan ---- */
const findings = [];
for (const f of files) {
  let text; try { text = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { continue; }
  if (text.includes('\u0000')) continue;   // binary
  const lines = text.split('\n');
  for (const [n, why] of needles) {
    let i = text.indexOf(n);
    if (i < 0) continue;
    // ids only count as whole tokens, so "bk-03" inside "fx-bk-03" isn't a hit
    const whole = /^[\w-]+$/.test(n);
    while (i >= 0) {
      const before = text[i - 1] || ' ', after = text[i + n.length] || ' ';
      if (!whole || (!/[\w-]/.test(before) && !/[\w-]/.test(after))) {
        findings.push({ f, line: text.slice(0, i).split('\n').length, what: n, why }); break;
      }
      i = text.indexOf(n, i + 1);
    }
  }
  for (const s of SHAPES) {
    s.re.lastIndex = 0; let m;
    while ((m = s.re.exec(text))) {
      const line = text.slice(0, m.index).split('\n').length;
      if (/qa-allow/.test(lines[line - 1] || '')) continue;
      findings.push({ f, line, what: m[0].replace(/\s+/g, ' ').slice(0, 70), why: s.why });
    }
  }
}
const src = (fs.existsSync(seedPath) ? 'real trip data' : sheetCount ? sheetCount + ' names from the Sheet as read on this machine' : 'no seed.json or Sheet reads here — words and shapes only') +
  (fs.existsSync(seedPath) && sheetCount ? ' + ' + sheetCount + ' names from Sheet reads' : '') +
  (fs.existsSync(privPath) ? ' + private words' : '');
if (!findings.length) { console.log('trip-scan: ' + files.length + ' files clean (' + src + ')'); process.exit(0); }
console.log('trip-scan: ' + findings.length + ' finding(s) in files that would be committed (' + src + '):');
// What matched is shown only for shapes (it is in the file anyway); for a name from the trip, just where and why
for (const x of findings) console.log('  ' + x.f + ':' + x.line + '  ' + (/^(Sheet|seed|private)/.test(x.why) ? '(a ' + String(x.what).length + '-character name or id)' : JSON.stringify(x.what)) + '  — ' + x.why);
console.log('\nThis repo is public. Move trip content to the Sheet, use invented test data, or mark a false\n' +
  'positive on its line with  qa-allow  and the reason.');
process.exit(1);
