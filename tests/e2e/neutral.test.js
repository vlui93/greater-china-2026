/* No trip is built into the app. A phone that knows nothing, on a Sheet whose
   Trips tab is empty, works out the one trip from the plan's own dates; once
   the Sheet lists its trips the phone remembers the default one; and the page,
   its manifest and the app's files name no trip, city list or dates. */
const { suite, trip } = require('./lib');
const fs = require('fs'), path = require('path');
const ROOT = path.join(__dirname, '..', '..');

suite({}, async (env) => {
  const { ok, wait, rows } = env;
  const T = trip();
  const dates = T.schedule.map(s => s.date).concat(T.bookings.map(b => b.date), T.bookings.map(b => b.arr_date))
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d || '')).sort(), first = dates[0], last = dates[dates.length - 1];
  const span = Math.round((Date.parse(last) - Date.parse(first)) / 864e5) + 1;

  console.log('\n1. before connecting');
  const page = await env.phone({ trip0: false, connect: false });
  ok(await page.title() === 'My trip', 'the page is titled "' + await page.title() + '"');
  ok(!/Greater China/.test(await page.content()), 'nothing on the page names a trip');
  ok(await page.evaluate(() => TRIP.id === 'trip-1' && TRIP.start === TRIP.end && TRIP.start === todayISO()), 'the placeholder trip is just today, until there is a plan');

  console.log('\n2. a Sheet with a plan but no Trips rows');
  await page.fill('#g_url', 'https://script.google.com/macros/s/X/exec'); await page.fill('#g_key', 'k');
  await page.click('#gateBtn'); await wait(900);
  const t = await page.evaluate(() => ({ id: TRIP.id, name: TRIP.name, start: TRIP_START, end: TRIP_END, days: DAYS.length, n: store.data.locations.length, title: document.title }));
  ok(t.id === 'trip-1' && t.name === 'My trip', 'one trip, called "' + t.name + '"');
  ok(t.start === first && t.end === last && t.days === span, 'running over the dates the plan and its bookings use: ' + t.start + ' to ' + t.end + ' (' + t.days + ' days)');
  ok(t.n === T.locations.length, 'with all ' + t.n + ' places in it');
  await page.click('#btnSettings'); await wait(500);
  const st = await page.innerText('#sheetBody');
  ok(/My trip/.test(st) && !/Greater China/.test(st), 'Settings lists it by that name');
  await page.screenshot({ path: env.out('neutral-settings.png') });

  console.log('\n3. adding a second trip writes the first one out as it stands');
  await page.click('[data-act="trip-new"]'); await wait(300);
  await page.fill('#t_name', 'Test Second'); await page.fill('#t_start', '2027-04-01'); await page.fill('#t_end', '2027-04-05');
  await page.click('[data-act="trip-save"]'); await wait(900);
  const tr = rows('Trips');
  const one = tr.find(x => x.id === 'trip-1');
  ok(tr.length === 2 && one && one.name === 'My trip' && one.start === first && one.end === last && String(one.is_default) === '1', 'Trips: the first trip (default, ' + (one && one.start) + ' to ' + (one && one.end) + ') and the new one');
  ok(rows('Locations').filter(l => !l.trip_id).length === T.locations.length, 'its places still belong to it (no trip id: the default trip)');
  await page.click('#btnSettings'); await wait(400); await page.click('[data-act="trip-open"][data-tid="trip-1"]'); await wait(900);
  ok(await page.evaluate(() => TRIP.id === 'trip-1' && store.data.locations.length) === T.locations.length, 'and it opens with them');

  console.log('\n4. a phone remembers the default trip the Sheet lists');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('gct.trip0') || 'null'));
  ok(saved && saved.id === 'trip-1' && saved.start === first, 'kept on the phone after a sync that brought the trips');
  env.box.post('saveTrip', { id: 'trip-1', name: 'Renamed in the Sheet' });
  await page.evaluate(() => store.sync({ quiet: true })); await wait(500);
  ok(await page.evaluate(() => TRIP.name) === 'Renamed in the Sheet' && await page.evaluate(() => JSON.parse(localStorage.getItem('gct.trip0')).name) === 'Renamed in the Sheet', 'and kept up to date');

  console.log('\n5. what ships names no trip');
  const man = JSON.parse(fs.readFileSync(path.join(ROOT, 'manifest.json'), 'utf8'));
  const cities = [...new Set(T.locations.map(l => l.city))];
  ok(man.name === 'Trips' && man.short_name === 'Trips', 'the home-screen name is "' + man.short_name + '"');
  ok(!cities.some(c => man.description.includes(c)) && !/\d{4}|\b(Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\b/.test(man.description), 'the manifest description lists no cities and no dates');
  const html = fs.readFileSync(path.join(ROOT, 'index.html'), 'utf8');
  ok(/<title>Trips<\/title>/.test(html) && /apple-mobile-web-app-title" content="Trips"/.test(html), 'index.html is titled Trips');
  const shipped = ['index.html', 'prep.js', 'bookings.js', 'manage.js', 'extras.js', 'map.js', 'sw.js', 'manifest.json'];
  const named = shipped.filter(f => /Greater China|gc2026|LEGACY_TRIP/.test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  ok(named.length === 0, 'no shipped file carries the first trip\'s name or id' + (named.length ? ': ' + named.join(', ') : ''));
  const dated = shipped.filter(f => new RegExp(first + '|' + last).test(fs.readFileSync(path.join(ROOT, f), 'utf8')));
  ok(dated.length === 0, 'or its first or last day' + (dated.length ? ': ' + dated.join(', ') : ''));
  ok(!page.errs.length, 'no JS errors ' + page.errs.join('; '));
});
