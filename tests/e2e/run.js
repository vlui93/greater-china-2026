#!/usr/bin/env node
/* Runs every browser suite (tests/e2e/*.test.js), a few at a time, and says
 * which passed. Each suite's full output goes to tests/e2e/out/<name>.log.
 *
 *   node tests/e2e/run.js            all suites
 *   node tests/e2e/run.js pack visit only these
 *   E2E_JOBS=1 node tests/e2e/run.js  one at a time (slow machines)
 *
 * Exit code 0 only when every suite passed. */
const { spawn } = require('child_process');
const fs = require('fs'), path = require('path');
const DIR = __dirname, OUT = path.join(DIR, 'out');
fs.mkdirSync(OUT, { recursive: true });

const want = process.argv.slice(2);
const all = fs.readdirSync(DIR).filter(f => f.endsWith('.test.js')).map(f => f.replace(/\.test\.js$/, '')).sort();
const unknown = want.filter(w => !all.includes(w));
if (unknown.length) { console.error('No such suite: ' + unknown.join(', ') + '\nSuites: ' + all.join(' ')); process.exit(2); }
const queue = want.length ? want : all;
const JOBS = Math.max(1, +process.env.E2E_JOBS || 4);
const TIMEOUT = +process.env.E2E_TIMEOUT_MS || 240000;

const results = [];
function runOne(name) {
  return new Promise(resolve => {
    const t0 = Date.now(), log = fs.createWriteStream(path.join(OUT, name + '.log'));
    const env = Object.assign({}, process.env, { PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS: '1' });
    const p = spawn(process.execPath, [path.join(DIR, name + '.test.js')], { env });
    let text = '';
    const take = d => { text += d; log.write(d); };
    p.stdout.on('data', take); p.stderr.on('data', take);
    const kill = setTimeout(() => { take('\nTIMED OUT after ' + TIMEOUT / 1000 + 's\n'); p.kill('SIGKILL'); }, TIMEOUT);
    p.on('close', code => {
      clearTimeout(kill); log.end();
      const fails = (text.match(/^\s*FAIL .*$/gm) || []).map(s => s.trim());
      const summary = (text.match(/(ALL \d+ CHECKS PASSED|FAILED \d+ of \d+)/) || [])[1] || (code ? 'crashed (see log)' : 'no summary');
      results.push({ name, ok: code === 0 && !fails.length, summary, fails, secs: Math.round((Date.now() - t0) / 1000) });
      resolve();
    });
  });
}
(async () => {
  const pending = queue.slice(), running = [];
  while (pending.length || running.length) {
    while (running.length < JOBS && pending.length) {
      const p = runOne(pending.shift()); running.push(p);
      p.then(() => running.splice(running.indexOf(p), 1));
    }
    await Promise.race(running);
  }
  results.sort((a, b) => a.name.localeCompare(b.name));
  for (const r of results) {
    console.log((r.ok ? '  ok   ' : '  FAIL ') + r.name.padEnd(10) + ' ' + r.summary + '  (' + r.secs + 's)');
    r.fails.forEach(f => console.log('         ' + f));
  }
  const bad = results.filter(r => !r.ok);
  console.log(bad.length ? '\n' + bad.length + ' of ' + results.length + ' suites failed — logs in tests/e2e/out/'
                         : '\nAll ' + results.length + ' browser suites passed.');
  process.exit(bad.length ? 1 : 0);
})();
