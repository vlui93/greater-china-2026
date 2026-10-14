#!/usr/bin/env node
/* Privacy scan for everything git would commit (part of the quality-gates
 * skill). Run it from the project root, before every commit — a git hook is
 * the reliable way (references/setup.md).
 *
 * Flags, in every tracked or new, not-ignored text file:
 *   1. words in .qa/private-words.local.txt — one per line: people's names,
 *      email addresses, ids or anything else that must never be committed.
 *      Keep this file gitignored (`.qa/*.local.*`).
 *   2. every string value (5+ characters) in the JSON files listed, one path per
 *      line, in .qa/private-sources.local.txt — e.g. a real dataset kept out of
 *      git, so nothing from it can leak into tests or docs.
 *   3. shapes that are private whatever the words: a run of dates mapped to
 *      titles (an itinerary or schedule), personal email addresses, and
 *      reference-like numbers of 10+ digits.
 * A line can opt out of 3 with the marker  qa-allow  (say why next to it).
 *
 *   node privacy-scan.js            scan, exit 1 on any finding
 *   node privacy-scan.js --staged   only what is staged for commit
 */
const fs = require('fs'), path = require('path'), { execSync } = require('child_process');
const ROOT = (() => { try { return execSync('git rev-parse --show-toplevel', { encoding: 'utf8' }).trim(); } catch (e) { return process.cwd(); } })();
const sh = c => execSync(c, { cwd: ROOT, encoding: 'utf8', maxBuffer: 64 << 20 });
const staged = process.argv.includes('--staged');
const SELF = path.relative(ROOT, __filename);
const files = (staged ? sh('git diff --cached --name-only --diff-filter=ACMR') : sh('git ls-files -co --exclude-standard'))
  .split('\n').filter(Boolean)
  .filter(f => f !== SELF && !/(^|\/)(node_modules|vendor|dist|build)\//.test(f))
  .filter(f => !/\.(png|jpe?g|gif|ico|webp|svg|woff2?|ttf|otf|pdf|zip|gz|lock)$/i.test(f) && !/(^|\/)package-lock\.json$/.test(f))
  .filter(f => fs.existsSync(path.join(ROOT, f)));

const needles = new Map();
const GENERIC = /^(true|false|null|hotel|train|flight|ferry|ticket|google|amap|https?:.*)$/i;
const add = (v, why) => { v = String(v == null ? '' : v).trim(); if (v.length >= 5 && !GENERIC.test(v)) needles.set(v, why); };
const local = name => path.join(ROOT, '.qa', name);
if (fs.existsSync(local('private-words.local.txt')))
  fs.readFileSync(local('private-words.local.txt'), 'utf8').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#'))
    .forEach(w => needles.set(w, 'private word'));
if (fs.existsSync(local('private-sources.local.txt')))
  fs.readFileSync(local('private-sources.local.txt'), 'utf8').split('\n').map(s => s.trim()).filter(s => s && !s.startsWith('#')).forEach(p => {
    const full = path.resolve(ROOT, p); if (!fs.existsSync(full)) return;
    const walk = (v, k) => { if (typeof v === 'string') add(v, path.basename(p) + (k ? ' ' + k : '')); else if (v && typeof v === 'object') Object.keys(v).forEach(kk => walk(v[kk], isNaN(kk) ? kk : k)); };
    try { walk(JSON.parse(fs.readFileSync(full, 'utf8'))); } catch (e) { console.error('privacy-scan: could not read ' + p + ': ' + e.message); }
  });
const SHAPES = [
  { why: 'dates mapped to titles (an itinerary or schedule)', re: /(["']\d{4}-\d\d-\d\d["']\s*:\s*["'][^"'\n]{3,}["'][\s\S]{0,80}?){3,}/g },
  { why: 'personal email address', re: /\b[\w.+-]+@(?!example\.(?:com|org|net)\b|users\.noreply|noreply\b)[a-z0-9-]+(?:\.[a-z0-9-]+)*\.[a-z]{2,}\b/gi },
  { why: 'reference-like number (10+ digits)', re: /(?<![\w.#-])\d{10,}(?![\w.])/g }
];
const findings = [];
for (const f of files) {
  let text; try { text = fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch (e) { continue; }
  if (text.includes('\u0000')) continue;
  const lines = text.split('\n');
  for (const [n, why] of needles) {
    let i = text.indexOf(n); const whole = /^[\w-]+$/.test(n);
    while (i >= 0) {
      if (!whole || (!/[\w-]/.test(text[i - 1] || ' ') && !/[\w-]/.test(text[i + n.length] || ' '))) {
        findings.push({ f, line: text.slice(0, i).split('\n').length, what: n, why }); break; }
      i = text.indexOf(n, i + 1);
    }
  }
  for (const s of SHAPES) { s.re.lastIndex = 0; let m;
    while ((m = s.re.exec(text))) { const line = text.slice(0, m.index).split('\n').length;
      if (!/qa-allow/.test(lines[line - 1] || '')) findings.push({ f, line, what: m[0].replace(/\s+/g, ' ').slice(0, 70), why: s.why }); } }
}
if (!findings.length) { console.log('privacy-scan: ' + files.length + ' files clean (' + needles.size + ' private terms checked)'); process.exit(0); }
console.log('privacy-scan: ' + findings.length + ' finding(s) in files that would be committed:');
findings.forEach(x => console.log('  ' + x.f + ':' + x.line + '  ' + JSON.stringify(x.what) + '  — ' + x.why));
console.log('\nUse invented data instead, move it somewhere private, or mark a genuine false positive with  qa-allow  and the reason.');
process.exit(1);
