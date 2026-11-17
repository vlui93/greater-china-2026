/* Near me: Places sorted by distance from where the phone is, the distance on
   each row, places with no pin last, working with the other filters and the
   search box — and a plain message, list untouched, when location is refused. */
const { suite, trip } = require('./lib');

// Straight-line distance, worked out here independently of the app
const km = (a, b) => { const R = 6371, t = x => x * Math.PI / 180, dLa = t(b.lat - a.lat), dLo = t(b.lng - a.lng);
  return 2 * R * Math.asin(Math.sqrt(Math.sin(dLa / 2) ** 2 + Math.cos(t(a.lat)) * Math.cos(t(b.lat)) * Math.sin(dLo / 2) ** 2)); };

suite({}, async (env) => {
  const { ok, wait } = env;
  const T = trip();
  // Standing 300 m or so north-east of the invented peak
  const here = { lat: 22.2732, lng: 114.1520 };
  env.box.post('saveLocation', { id: 'fx-nopin', name_en: 'Test Place With No Pin', name_zh: '测试无坐标', city: 'Hong Kong', type: 'restaurant', nav_app: 'google' });
  const want = T.locations.filter(l => isFinite(+l.lat) && isFinite(+l.lng) && (+l.lat || +l.lng)).map(l => ({ id: l.id, k: km(here, { lat: +l.lat, lng: +l.lng }) })).sort((a, b) => a.k - b.k);
  const page = await env.phone({ clock: '2026-10-18T09:00:00+08:00', clockMode: 'install',
    context: { geolocation: { latitude: here.lat, longitude: here.lng }, permissions: ['geolocation'] } });
  const ids = () => page.$$eval('#placeResults .locrow .lb', e => e.map(x => x.dataset.lid));
  const meta = id => page.$eval(`#placeResults .locrow .lb[data-lid="${id}"] .mt`, e => e.textContent);
  await page.evaluate(() => setView('places')); await wait(300);
  const before = await ids();

  console.log('\n1. nearest first');
  ok(await page.getAttribute('[data-act="near"]', 'aria-pressed') === 'false' && !/km|\d m\b/.test(await meta(want[0].id)), 'off to begin with: no distances shown');
  await page.click('[data-act="near"]'); await wait(700);
  const order = await ids();
  ok(await page.getAttribute('[data-act="near"]', 'aria-pressed') === 'true' && /Nearest first/.test(await page.textContent('#toast')), 'tapping Near me turns it on');
  ok(order.slice(0, want.length).join() === want.map(x => x.id).join(), 'the list runs nearest to farthest, by a distance worked out separately (' + order.slice(0, 3).join(', ') + ' …)');
  ok(order[0] === 'fx-hk-peak', 'the place 300 m away is first');
  const m0 = await meta(want[0].id), mFar = await meta(want[want.length - 1].id);
  ok(new RegExp('^' + Math.round(want[0].k * 100) * 10 + ' m ·').test(m0.trim()), 'its row says how far: "' + m0.trim().slice(0, 40) + '…" (' + Math.round(want[0].k * 1000) + ' m)');
  ok(new RegExp('^' + Math.round(want[want.length - 1].k) + ' km ·').test(mFar.trim()), 'and the farthest: "' + mFar.trim().slice(0, 40) + '…"');
  ok(order[order.length - 1] === 'fx-nopin' && /^no pin ·/.test((await meta('fx-nopin')).trim()), 'a place with no pin goes last, marked "no pin"');
  ok(/nearest first/.test(await page.textContent('#placeResults')) && /straight line/.test(await page.textContent('#toast')), 'the count line says how it is sorted, and the message that it is a straight line');
  const chip = await page.$eval('[data-act="near"]', e => { const r = e.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth; });
  ok(chip, 'the Near me chip is on screen without scrolling the row of chips');
  await page.screenshot({ path: env.out('near.png') });

  console.log('\n2. with the other filters and the search box');
  await page.click(`#placeResults .locrow:has([data-lid="${want[0].id}"]) .visitbtn`); await wait(500);
  await page.click('[data-act="hide-visited"]'); await wait(300);
  ok((await ids())[0] === want[1].id, 'with Hide visited, the nearest place not yet visited is first');
  await page.click('[data-act="type"][data-v="restaurant"]'); await wait(300);
  const rest = want.filter(x => T.locations.find(l => l.id === x.id).type === 'restaurant').map(x => x.id);
  ok((await ids()).slice(0, rest.length).join() === rest.join(), 'filtered to restaurants, still nearest first');
  await page.click('[data-act="type"][data-v="All"]'); await page.click('[data-act="hide-visited"]'); await wait(300);
  await page.fill('#q', 'Test'); await wait(300);
  const typed = await ids();
  ok(typed.length > 3 && typed[0] === want[0].id && /\d (m|km) ·/.test(await meta(typed[0])), 'typing in the search box keeps the order and the distances');
  await page.fill('#q', ''); await wait(200);

  console.log('\n3. off again');
  await page.click('[data-act="near"]'); await wait(300);
  ok((await ids()).join() === before.concat().join() && !/nearest first/.test(await page.textContent('#placeResults')), 'tapping it again puts the list back as it was');
  await page.click('[data-act="near"]'); await wait(600);
  await page.reload(); await wait(800);
  await page.evaluate(() => setView('places')); await wait(300);
  ok(await page.getAttribute('[data-act="near"]', 'aria-pressed') === 'false', 'and it is off when the app is reopened (the position isn\'t kept)');
  ok(!Object.keys(await page.evaluate(() => Object.assign({}, localStorage))).some(k => /near|pos/i.test(k)), 'nothing about where you were is stored');

  console.log('\n4. location refused');
  const no = await env.phone({ clock: '2026-10-18T09:00:00+08:00', clockMode: 'install', context: { permissions: [] } });
  await no.evaluate(() => setView('places')); await wait(300);
  const b4 = await no.$$eval('#placeResults .locrow .lb', e => e.map(x => x.dataset.lid).join());
  await no.click('[data-act="near"]'); await wait(900);
  ok(/Location is off for this app|Couldn’t find where you are/.test(await no.textContent('#toast')), 'it says so: "' + (await no.textContent('#toast')).trim().slice(0, 70) + '…"');
  ok(await no.getAttribute('[data-act="near"]', 'aria-pressed') === 'false' && await no.$$eval('#placeResults .locrow .lb', e => e.map(x => x.dataset.lid).join()) === b4, 'and the list stays as it was');
  ok(!page.errs.length && !no.errs.length, 'no JS errors ' + page.errs.concat(no.errs).join('; '));
});
