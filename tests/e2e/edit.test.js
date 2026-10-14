/* Editing a place and a stop's note: the change shows, reaches the Sheet, and
   isn't undone by a sync that was already under way. */
const { suite } = require('./lib');

suite({}, async (env) => {
  const { ok, wait, rows, tab, phone } = env;
  const page = await phone({ clock: '2026-10-18T09:00:00+08:00', clockMode: 'install' });
  const lid = await page.$eval('#stopList .stop', e => e.dataset.lid);

  console.log('\n1. edit a place');
  await page.evaluate(id => { const l = store.loc(id); l.visited = '2026-10-18'; store.persist(); }, lid);
  await page.evaluate(id => locationDetail(id), lid); await wait(300);
  await page.click('#sheetBody [data-act="edit-location"]'); await wait(300);
  await page.fill('#f_notes', 'NEW PRACTICAL NOTE'); await page.fill('#f_dishes_to_order', '新菜 New dish');
  await page.click('#sheetBody [data-act="save-location"]'); await wait(600);
  ok((rows('Locations').find(l => l.id === lid) || {}).notes === 'NEW PRACTICAL NOTE', 'Sheet has the note');
  ok(await page.$eval('#sheet', e => e.classList.contains('open')) && /NEW PRACTICAL NOTE/.test(await page.textContent('#sheetBody')) &&
     /New dish/.test(await page.textContent('#sheetBody')), 'back on the place page, showing the change');
  ok(await page.evaluate(id => store.loc(id).visited, lid) === '2026-10-18', 'tick kept through the edit');
  await page.evaluate(() => closeSheet());

  console.log('\n2. a save made while a sync is under way');
  // Hold the reply to "all" until the save has gone through, so it arrives stale.
  let release; const gate = new Promise(r => release = r); let held = 0;
  await page.ctx.unroute('**/macros/s/**');
  await page.ctx.route('**/macros/s/**', async route => {
    const body = route.request().postData() || '{}';
    const out = env.box.doPost({ postData: { contents: body }, parameter: {} })._t;   // read now: the stale copy
    if (JSON.parse(body).action === 'all' && !held++) await gate;
    route.fulfill({ status: 200, contentType: 'application/json', body: out });
  });
  const syncP = page.evaluate(() => store.sync({ quiet: true }).then(() => 1, () => 0));
  await wait(200);
  await page.evaluate(id => saveLocation(Object.assign({}, store.loc(id), { notes: 'SAVED MID-SYNC' })), lid);
  release(); await syncP; await wait(500);
  ok(await page.evaluate(id => store.loc(id).notes, lid) === 'SAVED MID-SYNC', 'edit survives the older copy arriving');
  ok((rows('Locations').find(l => l.id === lid) || {}).notes === 'SAVED MID-SYNC', 'and is in the Sheet');

  console.log('\n3. changes in the Sheet show on return to the app');
  const sh = tab('Locations'); const ri = sh.d.findIndex(r => r && r[0] === lid);
  sh.d[ri][sh.d[0].indexOf('notes')] = 'EDITED IN THE SHEET';
  await page.evaluate(() => { store.syncedAt = Date.now() - 10 * 60 * 1000;
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
    document.dispatchEvent(new Event('visibilitychange')); });
  await wait(800);
  ok(await page.evaluate(id => store.loc(id).notes, lid) === 'EDITED IN THE SHEET', 'fetched on return');

  console.log('\n4. a long stop note is shown whole');
  const long = '+call to book 00 000 0000 0000\nLunch — an invented congee shop. ' + 'Words to fill the card past two lines. '.repeat(6) + 'END-OF-NOTE';
  await page.click('#stopList .stop [data-act="note"]'); await wait(300);
  ok(await page.$('#f_stopnote') !== null, 'NOTE opens a text box');
  await page.fill('#f_stopnote', long); await page.click('[data-act="save-stop-note"]'); await wait(500);
  const card = await page.$eval('#stopList .stop .stop-sum', e => ({ own: e.classList.contains('own'), full: e.scrollHeight <= e.clientHeight + 1, h: e.clientHeight, txt: e.textContent }));
  ok(card.own && card.full && card.h > 60 && /END-OF-NOTE/.test(card.txt), 'card shows it all: ' + card.h + 'px');
  const sid = await page.$eval('#stopList .stop', e => e.dataset.sid);
  ok((rows('Schedule').find(r => r.id === sid) || {}).notes === long, 'note in the Sheet with its line break');
  const other = await page.$$eval('#stopList .stop .stop-sum:not(.own)', es => es.map(e => getComputedStyle(e).webkitLineClamp));
  ok(other.length > 0 && other.every(v => v === '2'), 'stand-ins from the background are still two lines');
});
