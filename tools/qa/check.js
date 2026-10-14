#!/usr/bin/env node
/* Everything that must pass before a change leaves this machine, in one go.
 *
 *   node tools/qa/check.js           full: builds, backend tests, QA tool tests,
 *                                    privacy scan, cache version, browser suites
 *   node tools/qa/check.js --fast    the same without the browser suites
 *                                    (what the pre-commit hook runs)
 *   --staged                         privacy-scan only what is staged
 *
 * Exit code 0 only if every step passed. */
const { spawnSync, execSync } = require('child_process');
const fs = require('fs'), path = require('path');
const ROOT = path.resolve(__dirname, '..', '..');
const fast = process.argv.includes('--fast'), staged = process.argv.includes('--staged');
const sh = c => { try { return execSync(c, { cwd: ROOT, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }); } catch (e) { return ''; } };
const results = [];
function step(name, fn) {
  const t0 = Date.now(); let ok = false, note = '';
  try { const r = fn(); ok = r === true || (r && r.ok); note = (r && r.note) || ''; } catch (e) { note = e.message; }
  results.push({ name, ok, note, s: ((Date.now() - t0) / 1000).toFixed(1) });
  console.log((ok ? '  ok   ' : '  FAIL ') + name + (note ? ' — ' + note : '') + '  (' + results[results.length - 1].s + 's)');
  return ok;
}
const node = (args, quiet) => { const r = spawnSync(process.execPath, args, { cwd: ROOT, encoding: 'utf8' });
  if (r.status !== 0 && !quiet) process.stdout.write((r.stdout || '') + (r.stderr || ''));
  return { ok: r.status === 0, out: (r.stdout || '') + (r.stderr || '') }; };

console.log('QA check' + (fast ? ' (fast)' : '') + '\n');

// 1. The two published artifacts are built from src/, and the build refuses trip content.
step('build index.html and Code.gs (with the trip-content tripwire)', () => {
  const before = ['index.html', 'Code.gs'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8'));
  const a = node(['src/build-html.js']), b = node(['src/build-code.js']);
  if (!a.ok || !b.ok) return { ok: false, note: 'build failed' };
  const after = ['index.html', 'Code.gs'].map(f => fs.readFileSync(path.join(ROOT, f), 'utf8'));
  const stale = ['index.html', 'Code.gs'].filter((f, i) => before[i] !== after[i]);
  return stale.length ? { ok: false, note: stale.join(', ') + ' were out of date with src/ — rebuilt now; review and stage them' } : true;
});
// 2. The backend, against a mock Apps Script runtime.
step('backend tests (src/test-code.js)', () => { const r = node(['src/test-code.js'], true);
  return { ok: r.ok, note: (r.out.match(/PASSED all \d+ checks|FAIL[^\n]*/) || [''])[0] }; });
// 3. The gates themselves still gate.
step('QA tool tests (tools/qa/test-qa.js)', () => { const r = node(['tools/qa/test-qa.js'], true);
  return { ok: r.ok, note: r.out.trim().split('\n').pop() }; });
// 4. Nothing trip-specific or personal in what would be committed.
step('privacy scan (tools/qa/trip-scan.js)', () => { const r = node(['tools/qa/trip-scan.js'].concat(staged ? ['--staged'] : []));
  return { ok: r.ok, note: r.ok ? r.out.trim() : 'see above' }; });
// 5. Phones only pick up a new app when the service worker's cache name changes.
step('service-worker cache bumped when the app changed', () => {
  const shell = /^(index\.html|map\.js|t2s\.js|manifest\.json|sw\.js|vendor\/|icons\/)/;
  const changed = (sh('git diff --name-only HEAD') + sh('git diff --name-only --cached')).split('\n').filter(f => shell.test(f) && f !== 'sw.js');
  if (!changed.length) return { ok: true, note: 'no app files changed' };
  const cur = (fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').match(/CACHE\s*=\s*"([^"]+)"/) || [])[1];
  const old = (sh('git show HEAD:sw.js').match(/CACHE\s*=\s*"([^"]+)"/) || [])[1];
  return cur !== old ? { ok: true, note: old + ' → ' + cur } : { ok: false, note: [...new Set(changed)].join(', ') + ' changed but sw.js CACHE is still ' + cur + ' — phones would keep the old app' };
});
// 6. The whole app in a browser, on the invented trip.
if (!fast) step('browser suites (tests/e2e)', () => { const r = node(['tests/e2e/run.js']);
  return { ok: r.ok, note: r.out.trim().split('\n').pop() }; });

const bad = results.filter(r => !r.ok);
console.log('\n' + (bad.length ? bad.length + ' step(s) failed. Fix the cause — don\'t loosen the check, skip it, or edit a test to match — unless the person agrees.' : 'All checks passed.'));
process.exit(bad.length ? 1 : 0);
