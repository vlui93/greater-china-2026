/* Many trips in one Sheet. A phone syncs and keeps only the open trip, so the
   download and the offline copy stay one trip's size however many trips pile
   up; opening another trip fetches it (and with no connection, the open trip
   stays open); "Other trips" fetches places when asked; old trips can be
   archived out of the list; and a phone that can't save its copy says so. */
const { suite, trip } = require('./lib');

suite({}, async (env) => {
  const { ok, wait, rows } = env;
  const T = trip(), box = env.box;
  // Eleven more invented trips, each a copy of the fixture under its own ids.
  // As the app does when a Sheet gets its second trip, the first trip's row goes in first.
  box.post('saveTrip', { id: 'gc2026', name: 'Greater China', start: '2026-10-16', end: '2026-11-01', tz: 'Asia/Shanghai', is_default: '1' });
  for (let n = 1; n <= 11; n++) {
    const id = 'tx-' + n, m = String(n).padStart(2, '0');
    box.post('saveTrip', { id, name: 'Test Trip ' + n, start: '2027-' + m + '-01', end: '2027-' + m + '-10', tz: 'Asia/Tokyo' });
    T.locations.forEach(l => box.post('saveLocation', Object.assign({}, l, { id: id + '-' + l.id, trip_id: id })));
    T.schedule.slice(0, 10).forEach(s => box.post('saveScheduleEntry', Object.assign({}, s, { id: id + '-' + s.id, location_id: id + '-' + s.location_id, date: '2027-' + m + '-0' + (1 + (s.order_index % 9)), trip_id: id })));
  }
  const sizes = [];
  let offline = false;
  const page = await env.phone({ filter: (out, body) => { if (body.action === 'all') sizes.push({ len: JSON.stringify(out).length, n: (out.data.locations || []).length }); return out; } });
  await page.ctx.route('**/macros/s/**', route => offline ? route.abort('internetdisconnected') : route.fallback());
  const cache = () => page.evaluate(() => { const c = JSON.parse(localStorage.getItem('gct.cache')); return { len: localStorage.getItem('gct.cache').length, ids: c.locations.map(l => l.id) }; });
  const full = box.post('all').data, allLen = JSON.stringify(full).length;

  console.log('\n1. one trip per sync, one trip on the phone');
  const s0 = sizes[sizes.length - 1];
  ok(rows('Locations').length === T.locations.length * 12, 'the Sheet holds 12 trips (' + rows('Locations').length + ' places)');
  ok(s0.n === T.locations.length && s0.len < allLen / 5, 'a sync brings only the open trip: ' + s0.n + ' places, ' + Math.round(s0.len / 1024) + 'KB of the ' + Math.round(allLen / 1024) + 'KB the Sheet holds');
  let c = await cache();
  ok(c.ids.length === T.locations.length && !c.ids.some(id => /^tx-/.test(id)), 'the offline copy holds the open trip only (' + Math.round(c.len / 1024) + 'KB)');

  console.log('\n2. opening another trip fetches it');
  await page.click('#btnSettings'); await wait(300);
  ok(/Test Trip 5[\s\S]*?10 places|Test Trip 5[\s\S]*?\d+ places/.test(await page.textContent('#sheetBody')), 'the trip list counts each trip\'s places');
  await page.click('[data-act="trip-open"][data-tid="tx-5"]'); await wait(1200);
  ok(await page.evaluate(() => TRIP.id === 'tx-5' && store.data.locations.length) === T.locations.length, 'Test Trip 5 open, with its ' + T.locations.length + ' places');
  c = await cache();
  ok(c.ids.every(id => id.startsWith('tx-5-')), 'and the phone now holds that trip only');
  ok(sizes[sizes.length - 1].n === T.locations.length, 'fetched as one trip');

  console.log('\n3. with no connection, the open trip stays open');
  offline = true;
  await page.click('#btnSettings'); await wait(300);
  await page.click('[data-act="trip-open"][data-tid="tx-7"]'); await wait(1200);
  ok(/No connection/.test(await page.textContent('#toast')) && await page.evaluate(() => TRIP.id) === 'tx-5', 'toast says so; Test Trip 5 is still open');
  ok(await page.evaluate(() => store.data.locations.length) === T.locations.length, 'with its places intact');
  await page.evaluate(() => setView('places')); await wait(300);
  await page.click('[data-act="library"]'); await wait(800);
  ok(/need a connection/.test(await page.textContent('#sheetBody')), 'Other trips says it needs a connection');
  await page.evaluate(() => closeSheet());
  offline = false;

  console.log('\n4. Other trips, fetched when asked');
  await page.click('[data-act="library"]'); await wait(1000);
  const nLib = await page.$$eval('#libResults .locrow', e => e.length);
  ok(nLib === T.locations.length * 11, 'lists the other 11 trips\' places (' + nLib + ')');
  await page.evaluate(() => closeSheet());

  console.log('\n5. archive');
  await page.click('#btnSettings'); await wait(300);
  await page.click('[data-act="trip-archive"][data-tid="tx-3"]'); await wait(800);
  ok(/Archived trips \(1\)/.test(await page.textContent('#sheetBody')) && !await page.isVisible('[data-act="trip-open"][data-tid="tx-3"]'), 'moves under Archived trips (1), out of the list');
  ok((rows('Trips').find(t => t.id === 'tx-3') || {}).archived === '1', 'archived in the Sheet');
  await page.click('details.archived summary'); await wait(200);
  await page.click('[data-act="trip-unarchive"][data-tid="tx-3"]'); await wait(800);
  ok(!/Archived trips/.test(await page.textContent('#sheetBody')) && (rows('Trips').find(t => t.id === 'tx-3') || {}).archived === '', 'unarchive puts it back');
  await page.evaluate(() => closeSheet());

  console.log('\n6. a phone on an older backend keeps one trip too');
  const old = await env.phone({ filter: (out, body) => (body.action === 'all' ? box.post('all') : out) });
  const oc = await old.evaluate(() => JSON.parse(localStorage.getItem('gct.cache')).locations.map(l => l.trip_id || ''));
  ok(oc.length === T.locations.length && oc.every(t => t === ''), 'it gets every trip, keeps only the open one (' + oc.length + ' places)');

  console.log('\n7. a copy that can\'t be saved is reported');
  await page.evaluate(() => { window.__set = Storage.prototype.setItem; Storage.prototype.setItem = function (k, v) { if (k === 'gct.cache') { const e = new Error('full'); e.name = 'QuotaExceededError'; throw e; } return window.__set.call(this, k, v); }; });
  await page.evaluate(() => { const l = store.data.locations[0]; return saveLocation(Object.assign({}, l, { notes: 'edited while storage is full' })); }); await wait(500);
  await page.evaluate(() => setView('today')); await wait(300);
  const bar = await page.evaluate(() => { const b = document.querySelector('#view-today .stalebar'); return b && !b.hidden ? b.innerText : ''; });
  ok(/couldn't save its copy of the trip/.test(bar), 'banner: "' + bar.split('.')[0] + '"');
  await page.evaluate(() => { Storage.prototype.setItem = window.__set; const l = store.data.locations[0]; return saveLocation(Object.assign({}, l, { notes: 'saved again' })); }); await wait(500);
  ok(await page.evaluate(() => { const b = document.querySelector('#view-today .stalebar'); return !b || b.hidden; }), 'goes once the copy saves again');
  ok(!page.errs.length && !old.errs.length, 'no JS errors ' + page.errs.concat(old.errs).join('; '));
});
