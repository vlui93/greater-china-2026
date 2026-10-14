/* Shared harness for the browser suites.
 *
 * Every suite runs the real index.html in headless Chromium against the real
 * Code.gs, which runs in Node inside a mock of the Apps Script runtime and a
 * mock spreadsheet. The trip is the invented one in fixtures/trip.js: this repo
 * is public, so nothing from a real itinerary goes into a test.
 *
 * Nothing here is tied to one machine: Playwright and Chromium are found where
 * they are installed, the server takes a free port, and the app's cache version
 * is read from sw.js rather than written into the tests. */
const fs = require('fs'), path = require('path'), http = require('http'), vm = require('vm');
const ROOT = path.resolve(__dirname, '..', '..');
const FIX = path.join(__dirname, 'fixtures');
const OUT = path.join(__dirname, 'out');
const { injectSeed } = require(path.join(ROOT, 'src', 'seed-inject'));

/* ---------- Playwright and a browser ---------- */
function playwright() {
  const tries = [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node22/lib/node_modules/playwright',
    '/usr/local/lib/node_modules/playwright', '/usr/lib/node_modules/playwright'].filter(Boolean);
  for (const t of tries) { try { return require(t); } catch (e) { /* next */ } }
  throw new Error('Playwright not found. Install it (npm i -g playwright) or set PLAYWRIGHT_MODULE.');
}
function chromiumPath() {
  if (process.env.CHROMIUM_PATH) return process.env.CHROMIUM_PATH;
  const base = process.env.PLAYWRIGHT_BROWSERS_PATH || '/opt/pw-browsers';
  try {
    const dirs = fs.readdirSync(base).filter(d => /^chromium-\d+$/.test(d)).sort().reverse();
    for (const d of dirs) {
      const p = path.join(base, d, 'chrome-linux', 'chrome');
      if (fs.existsSync(p)) return p;
    }
  } catch (e) { /* fall through to Playwright's own */ }
  return undefined;
}
async function launch() {
  const exe = chromiumPath();
  return playwright().chromium.launch(exe ? { executablePath: exe } : {});
}

/* ---------- the app, served ---------- */
const TYPES = { '.html':'text/html', '.js':'application/javascript', '.json':'application/json',
  '.png':'image/png', '.css':'text/css', '.webmanifest':'application/manifest+json', '.svg':'image/svg+xml' };
function serve() {
  const server = http.createServer((rq, rs) => {
    let f = decodeURIComponent(rq.url.split('?')[0]); if (f === '/') f = '/index.html';
    const p = path.join(ROOT, f);
    if (!p.startsWith(ROOT) || /\/(tests|src|\.git)\//.test(p) || !fs.existsSync(p) || fs.statSync(p).isDirectory()) { rs.writeHead(404); return rs.end(); }
    rs.writeHead(200, { 'Content-Type': TYPES[path.extname(p)] || 'text/plain' }); rs.end(fs.readFileSync(p));
  });
  return new Promise(r => server.listen(0, '127.0.0.1', () => r({ server, url: 'http://127.0.0.1:' + server.address().port + '/index.html' })));
}
/** The service worker's cache name, as sw.js has it now. */
function swCache() { return (fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8').match(/CACHE\s*=\s*"([^"]+)"/) || [])[1]; }

/* ---------- a mock spreadsheet ---------- */
function MockSheet(name) { this.name = name; this.d = []; }
MockSheet.prototype = {
  getName() { return this.name; },
  getLastRow() { let l = 0; this.d.forEach((r, i) => { if (r && r.some(c => c !== '' && c != null)) l = i + 1; }); return l; },
  getLastColumn() { return this.d.reduce((m, r) => Math.max(m, r ? r.length : 0), 0); },
  setFrozenRows() {},
  _cell(r, c) { if (!this.d[r - 1]) this.d[r - 1] = []; if (this.d[r - 1][c - 1] === undefined) this.d[r - 1][c - 1] = ''; return this.d[r - 1][c - 1]; },
  getRange(row, col, nr, nc) {
    nr = nr == null ? 1 : nr; nc = nc == null ? 1 : nc; const sh = this;
    return {
      getValues() { const o = []; for (let r = row; r < row + nr; r++) { const l = []; for (let c = col; c < col + nc; c++) l.push(sh._cell(r, c)); o.push(l); } return o; },
      setValues(v) { v.forEach((l, i) => l.forEach((val, j) => { if (!sh.d[row + i - 1]) sh.d[row + i - 1] = []; sh.d[row + i - 1][col + j - 1] = val; })); return this; },
      setValue(v) { if (!sh.d[row - 1]) sh.d[row - 1] = []; sh.d[row - 1][col - 1] = v; return this; },
      setNumberFormat() { return this; }, setFontWeight() { return this; }
    };
  },
  appendRow(r) { this.d[this.getLastRow()] = r.slice(); },
  deleteRow(r) { this.d.splice(r - 1, 1); },
  deleteRows(r, n) { this.d.splice(r - 1, n); }
};
function mockSpreadsheet() {
  const SS = { sheets: [],
    getSheetByName(n) { return this.sheets.find(s => s.name === n) || null; },
    insertSheet(n) { const s = new MockSheet(n); this.sheets.push(s); return s; },
    getSheets() { return this.sheets; },
    deleteSheet(s) { this.sheets = this.sheets.filter(x => x !== s); },
    getSpreadsheetTimeZone() { return 'Asia/Shanghai'; } };
  SS.insertSheet('Sheet1');
  return SS;
}

/* ---------- the backend ---------- */
/* An Amap short link and the page it redirects to, for the "resolve a share
   link" paths. Invented: the place, its id and its name are made up. */
const NET = {
  'https://surl.amap.com/T3st': [302, { Location: 'https://wb.amap.com/?p=B0TEST0001,23.105432,113.248765,%E6%B5%8B%E8%AF%95%E9%9D%A2%E9%A6%86,%E5%B9%BF%E5%B7%9E&src=share' }, ''],
  'https://wb.amap.com/?p=B0TEST0001,23.105432,113.248765,%E6%B5%8B%E8%AF%95%E9%9D%A2%E9%A6%86,%E5%B9%BF%E5%B7%9E&src=share': [200, {}, '<title>测试面馆-高德地图</title>']
};
const CODE = { current: path.join(ROOT, 'Code.gs'), v1: path.join(FIX, 'Code.v1.gs') };
/** Code.gs (or the first release, `v1`) running against `SS`, seeded with `seed`. */
function backend(SS, which, seed) {
  const box = { SpreadsheetApp: { getActive: () => SS },
    ContentService: { MimeType: { JSON: 'j' }, createTextOutput: t => ({ _t: t, setMimeType() { return this; } }) },
    LockService: { getScriptLock: () => ({ waitLock() {}, releaseLock() {} }) },
    Utilities: { formatDate: d => d.toISOString().slice(0, 10) }, Logger: { log() {} }, console,
    UrlFetchApp: { fetch(u) { const r = NET[u] || [404, {}, '']; return { getResponseCode: () => r[0], getHeaders: () => r[1], getContentText: () => r[2] }; } } };
  vm.createContext(box);
  vm.runInContext(injectSeed(fs.readFileSync(CODE[which || 'current'], 'utf8'), seed || trip()), box);
  box.API_KEY = 'k';
  box.post = (action, payload) => JSON.parse(box.doPost({ postData: { contents: JSON.stringify({ key: 'k', action, payload }) }, parameter: {} })._t);
  return box;
}

/* ---------- the invented trip ---------- */
function trip() { delete require.cache[require.resolve('./fixtures/trip.js')]; return require('./fixtures/trip.js')(); }
function fixturePath(name) { return path.join(FIX, name); }
function fixture(name) { return JSON.parse(fs.readFileSync(fixturePath(name), 'utf8')); }

/* ---------- one suite ---------- */
/** Everything a suite needs, set up the common way: a spreadsheet seeded with
 *  the trip, the backend over it, the app served, a browser. Each page made
 *  with `phone()` talks to `env.box` (swap it with `env.deploy()`). */
async function setup(opts) {
  opts = opts || {};
  const env = { opts, fails: 0, checks: 0, errs: [] };
  env.SS = mockSpreadsheet();
  env.seed = opts.seed || trip();
  env.deploy = which => { env.box = backend(env.SS, which, env.seed); return env.box; };
  env.deploy(opts.backend);
  if (opts.setup !== false) env.box.setup();
  const s = await serve(); env.server = s.server; env.url = s.url;
  env.browser = await launch();
  env.ok = (c, m) => { env.checks++; console.log((c ? '  ok   ' : '  FAIL ') + m); if (!c) env.fails++; };
  env.wait = ms => new Promise(r => setTimeout(r, ms));
  env.tab = n => env.SS.getSheetByName(n);
  env.rows = n => { const sh = env.tab(n); if (!sh) return []; const h = sh.d[0];
    return sh.d.slice(1).filter(r => r && String(r[0] || '').trim()).map(r => { const o = {}; h.forEach((k, i) => o[k] = r[i]); return o; }); };
  env.out = name => { fs.mkdirSync(OUT, { recursive: true }); return path.join(OUT, name); };
  env.contexts = [];
  /** A phone: its own browser context, connected through the gate unless told not to. */
  env.phone = async function (o) {
    o = o || {};
    const ctx = await env.browser.newContext(Object.assign({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1,
      timezoneId: o.tz || 'Asia/Shanghai' }, o.context || {}));
    env.contexts.push(ctx);
    // Never reach the real internet: photo lookups and map tiles are answered here or refused.
    if (!o.keepNet) await ctx.route(/wikipedia\.org|wikimedia\.org|openstreetmap\.org/, r => r.fulfill({ status: 404, body: '' }));
    const posted = [];
    await ctx.route('**/macros/s/**', async route => {
      const body = route.request().postData() || '{}';
      try { posted.push(JSON.parse(body)); } catch (e) { /* not JSON */ }
      if (o.static) return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: o.static(JSON.parse(body)) }) });
      let out = env.box.doPost({ postData: { contents: body }, parameter: {} })._t;
      if (o.filter) out = JSON.stringify(o.filter(JSON.parse(out), JSON.parse(body)));
      route.fulfill({ status: 200, contentType: 'application/json', body: out });
    });
    if (o.init) await ctx.addInitScript(o.init.fn, o.init.arg);
    if (o.before) await o.before(ctx);   // extra routes, before the page loads
    const page = await ctx.newPage();
    page.ctx = ctx; page.posted = posted; page.errs = [];
    page.on('pageerror', e => { page.errs.push(e.message); env.errs.push(e.message); });
    page.answers = []; page.dialogs = [];
    // Answers dialogs from page.answers (default OK) — unless the suite has its own handler for this one.
    if (o.dialogs !== false) page.on('dialog', d => { if (page.listenerCount('dialog') > 1) return;
      page.dialogs.push(d.message()); const a = page.answers.length ? page.answers.shift() : true;
      if (a === false || a === null) d.dismiss(); else d.accept(typeof a === 'string' ? a : undefined); });
    if (o.clock) await page.clock[o.clockMode === 'install' ? 'install' : 'setFixedTime'](o.clockMode === 'install' ? { time: new Date(o.clock) } : new Date(o.clock));
    await page.goto(env.url); await env.wait(300);
    if (o.connect !== false) {
      await page.fill('#g_url', 'https://script.google.com/macros/s/X/exec'); await page.fill('#g_key', 'k');
      await page.click('#gateBtn'); await env.wait(o.connectWait || 800);
    }
    return page;
  };
  env.importFile = async (page, file, ms) => {
    await page.click('#btnSettings'); await env.wait(200);
    await page.setInputFiles('#importFile', file); await env.wait(ms || 600);
    return (await page.textContent('#toast')).trim();
  };
  env.done = async function () {
    env.ok(env.errs.length === 0, 'no JS errors' + (env.errs.length ? ': ' + env.errs.join(' | ') : ''));
    for (const c of env.contexts) await c.close().catch(() => {});
    await env.browser.close(); env.server.close();
    console.log('\n' + (env.fails ? 'FAILED ' + env.fails + ' of ' + env.checks : 'ALL ' + env.checks + ' CHECKS PASSED'));
    process.exit(env.fails ? 1 : 0);
  };
  return env;
}
/** Run a suite body, failing loudly on an exception instead of hanging. */
function suite(opts, body) {
  setup(opts).then(env => body(env).then(() => env.done(), e => { console.error(e); env.fails++; return env.done(); }))
    .catch(e => { console.error(e); process.exit(1); });
}

module.exports = { ROOT, FIX, OUT, suite, setup, launch, serve, swCache, mockSpreadsheet, backend, trip, fixture, fixturePath, playwright };
