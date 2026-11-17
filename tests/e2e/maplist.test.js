/* A map with its list underneath: the day map and the Places map each take
   the top of the screen, with the stops or places listed below. Tapping a row
   centres the map on its pin and opens it; tapping a pin marks its row and
   brings it into view. A stop with no pin is listed, marked, and moves nothing. */
const { suite, trip } = require('./lib');

suite({}, async (env) => {
  const { ok, wait } = env;
  const T = trip(), day = '2026-10-18';
  const loc = id => T.locations.find(l => l.id === id);
  const stops = T.schedule.filter(s => s.date === day).sort((a, b) => a.order_index - b.order_index);
  // one extra stop on the day, at a place with no pin
  env.box.post('saveLocation', { id: 'fx-nopin', name_en: 'Test Place With No Pin', name_zh: '测试无坐标', city: 'Hong Kong', type: 'restaurant', nav_app: 'google' });
  env.box.post('saveScheduleEntry', { id: 'sc-nopin', date: day, order_index: 99, location_id: 'fx-nopin', planned_time: '21:00' });
  const page = await env.phone({ clock: day + 'T09:00:00+08:00', clockMode: 'install' });
  const centre = which => page.evaluate(w => { const c = maps[w].getCenter(); return [c.lat, c.lng]; }, which);
  const near = (c, l) => Math.abs(c[0] - +l.lat) < 0.0015 && Math.abs(c[1] - +l.lng) < 0.0015;

  console.log('\n1. the day map, with the day\'s stops under it');
  await page.evaluate(d => dayMap(d), day); await wait(1200);
  const rows = await page.$$eval('#maplist-sheet .mlrow', e => e.map(x => x.querySelector('.mn').textContent + ' ' + x.querySelector('.me').textContent));
  ok(rows.length === stops.length + 1 && rows.slice(0, stops.length).join('|') === stops.map((s, i) => (i + 1) + ' ' + loc(s.location_id).name_en).join('|'), 'every stop, numbered in the day\'s order: ' + rows.slice(0, 3).join(', ') + ' …');
  const box = await page.evaluate(() => { const m = document.querySelector('#dayMap').getBoundingClientRect(), l = document.querySelector('#maplist-sheet').getBoundingClientRect(); return { h: m.height, vh: innerHeight, below: l.top >= m.bottom - 1 }; });
  ok(box.h > box.vh * 0.3 && box.h < box.vh * 0.55 && box.below, 'the map takes the top ' + Math.round(box.h / box.vh * 100) + '% of the screen, the list is below it');
  await page.click('#maplist-sheet .mlrow >> nth=2'); await wait(700);
  const third = loc(stops[2].location_id);
  ok(near(await centre('sheet'), third), 'tapping the third row centres the map on that stop');
  ok((await page.textContent('.leaflet-popup-content')).includes(third.name_en), 'and opens its pin: "' + third.name_en + '"');
  ok(await page.$eval('#maplist-sheet .mlrow >> nth=2', e => e.classList.contains('on')) && await page.$$eval('#maplist-sheet .mlrow.on', e => e.length) === 1, 'the row is marked, and only that one');
  await page.evaluate(() => maps.sheet.closePopup());
  await page.$eval('.leaflet-marker-icon.stop >> nth=0', e => e.dispatchEvent(new MouseEvent('click', { bubbles: true }))); await wait(500);
  const onNow = await page.$$eval('#maplist-sheet .mlrow', e => e.map((x, i) => x.classList.contains('on') ? i : -1).filter(i => i >= 0));
  ok(onNow.join() === '0', 'tapping the first pin marks the first row instead');
  const c0 = await centre('sheet');
  await page.click('#maplist-sheet .mlrow.nopin'); await wait(500);
  ok(/No pin for this one/.test(await page.textContent('#toast')) && JSON.stringify(await centre('sheet')) === JSON.stringify(c0), 'the stop with no pin is listed, says so, and moves nothing');
  await page.screenshot({ path: env.out('maplist-day.png') });
  // scrolled to the end of the list, the map is still on screen
  await page.$eval('#maplist-sheet .mlrow:last-child', e => e.scrollIntoView()); await wait(300);
  const still = await page.evaluate(() => { const r = document.querySelector('#dayMap').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight && r.height > 200; });
  ok(still, 'with the list scrolled to its end, the map stays on screen');
  await page.evaluate(() => closeSheet());

  console.log('\n2. the Places map, with the places under it');
  await page.evaluate(() => { ui.placesMode = 'map'; setView('places'); }); await wait(1200);
  const n = await page.$$eval('#maplist-places .mlrow', e => e.length);
  ok(n === T.locations.length + 1, 'all ' + n + ' places listed under the map');
  const target = T.locations.find(l => l.city === 'Chengdu' && l.type === 'restaurant');
  await page.$eval(`#maplist-places .mlrow[data-pid="${target.id}"]`, e => e.scrollIntoView({ block: 'nearest' })); await wait(300);
  const seen = await page.evaluate(id => { const r = document.querySelector(`#maplist-places .mlrow[data-pid="${id}"]`).getBoundingClientRect(), m = document.querySelector('#placesMap').getBoundingClientRect(), n = document.querySelector('nav.tabs').getBoundingClientRect(); return r.top >= m.bottom && r.bottom <= n.top; }, target.id);
  ok(seen, 'a row brought into view sits between the map and the tab bar, under neither');
  await page.$eval(`#maplist-places .mlrow[data-pid="${target.id}"]`, e => { const r = e.getBoundingClientRect(); const hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); if (!e.contains(hit)) throw new Error('row is covered by ' + (hit && (hit.id || hit.className))); e.click(); }); await wait(800);
  ok(near(await centre('places'), target) && (await page.textContent('.leaflet-popup-content')).includes(target.name_en), 'tapping a place far down the list centres the map on it and opens it');
  ok(await page.evaluate(() => { const r = document.querySelector('#placesMap').getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight; }), 'the map is on screen to show it, though the list was scrolled');
  // the other way: with the list scrolled to its end, a tap on the first place's pin brings its row up into view
  const firstId = T.locations.find(l => isFinite(+l.lat) && +l.lat).id;
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await wait(200);
  await page.evaluate(id => maps.places._pins[id].fire('click'), firstId); await wait(900);
  const up = await page.evaluate(id => { const e = document.querySelector(`#maplist-places .mlrow[data-pid="${id}"]`), r = e.getBoundingClientRect(), m = document.querySelector('#placesMap').getBoundingClientRect(), n = document.querySelector('nav.tabs').getBoundingClientRect();
    return { on: e.classList.contains('on'), clear: r.top >= m.bottom - 1 && r.bottom <= n.top + 1 }; }, firstId);
  ok(up.on && up.clear, 'a pin tapped while the list is scrolled away marks its row and brings it into view below the map, not under it');
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.click('[data-act="city"][data-v="Macau"]'); await wait(1000);
  const macau = T.locations.filter(l => l.city === 'Macau').length;
  ok(await page.$$eval('#maplist-places .mlrow', e => e.length) === macau, 'a city chip narrows the map and the list together (' + macau + ' in Macau)');
  await page.screenshot({ path: env.out('maplist-places.png') });
  for (const w of [320, 390]) {
    await page.setViewportSize({ width: w, height: 700 }); await wait(400);
    ok(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth) <= 1, 'nothing past the right edge at ' + w + 'px');
  }
  ok(!page.errs.length, 'no JS errors ' + page.errs.join('; '));
});
