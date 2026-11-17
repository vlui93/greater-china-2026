/* Switching trips from the header: the open trip's name sits top right on
   every tab; tapping it lists the trips — on now and coming first, then past
   ones, archived ones left out — and one tap opens another. */
const { suite, trip } = require('./lib');

suite({}, async (env) => {
  const { ok, wait } = env;
  const T = trip(), box = env.box;
  // added out of order, so the list has to sort them
  box.post('saveTrip', { id: 'tw-past', name: 'Test Old Trip', start: '2025-05-01', end: '2025-05-05', tz: 'Asia/Tokyo' });
  box.post('saveTrip', { id: 'tw-later', name: 'Test Summer Trip With A Rather Long Name', start: '2027-07-01', end: '2027-07-10', tz: 'Europe/Lisbon' });
  box.post('saveTrip', { id: 'tw-soon', name: 'Test Spring Trip', start: '2027-03-01', end: '2027-03-08', tz: 'Asia/Tokyo' });
  box.post('saveTrip', { id: 'tw-arch', name: 'Test Archived Trip', start: '2024-05-01', end: '2024-05-05', tz: 'Asia/Tokyo', archived: '1' });
  box.post('saveLocation', { id: 'tw-p1', name_en: 'Test Spring Place', name_zh: '测试春', city: 'Kyoto', type: 'attraction', trip_id: 'tw-soon' });
  const page = await env.phone({ clock: '2026-10-18T09:00:00+08:00', clockMode: 'install' });
  const label = () => page.textContent('#btnTrip .tn');

  console.log('\n1. the open trip, top right');
  ok((await label()).trim() === 'Greater China' && await page.isVisible('#btnTrip'), 'Home shows "' + (await label()).trim() + '" at the top');
  const r = await page.$eval('#btnTrip', e => { const b = e.getBoundingClientRect(), s = document.querySelector('#btnSettings').getBoundingClientRect(); return { right: b.right <= s.left + 1, top: b.top < 120, h: b.height, w: b.width }; });
  ok(r.right && r.top && r.h >= 44, 'at the top right, beside Settings, ' + Math.round(r.h) + 'px tall');
  for (const v of ['days', 'places', 'trip']) {
    await page.click(`nav.tabs button[data-view="${v}"]`); await wait(250);
    ok(await page.isVisible('#btnTrip'), 'still there on ' + v);
  }
  await page.click('nav.tabs button[data-view="today"]'); await wait(250);
  for (const vw of [320, 390]) {
    await page.setViewportSize({ width: vw, height: 760 }); await wait(300);
    const fit = await page.evaluate(() => { const t = document.querySelector('#viewTitle').getBoundingClientRect(), b = document.querySelector('#btnTrip').getBoundingClientRect(), s = document.querySelector('#btnSettings').getBoundingClientRect();
      const apart = (x, y) => x.right <= y.left + 1 || y.right <= x.left + 1 || x.bottom <= y.top + 1 || y.bottom <= x.top + 1;
      return { ok: document.documentElement.scrollWidth <= innerWidth + 1 && apart(t, b) && apart(b, s) && b.right <= innerWidth && b.top < 160,
               oneLine: t.height < 34, name: document.querySelector('#btnTrip .tn').scrollWidth <= document.querySelector('#btnTrip .tn').clientWidth + 1 }; });
    ok(fit.ok && fit.oneLine, vw + 'px: title on one line, the trip button and Settings beside or under it, nothing overlapping');
    if (vw === 320) ok(await page.$eval('#btnTrip', e => { const b = e.getBoundingClientRect(), t = document.querySelector('#viewTitle').getBoundingClientRect(); return b.top >= t.bottom - 1 && e.querySelector('.tn').scrollWidth <= e.querySelector('.tn').clientWidth + 1; }),
      '320px: the trip button takes its own line under the title, the name shown whole');
  }

  await page.setViewportSize({ width: 390, height: 844 }); await wait(300);

  console.log('\n2. tapping it lists the trips');
  await page.click('#btnTrip'); await wait(700);
  ok(await page.$('#sheet.open') && (await page.textContent('#sheetTitle')).trim() === 'Trips', 'it opens the Trips list');
  const names = await page.$$eval('.trippick .tp .tt', e => e.map(x => x.firstChild.textContent));
  ok(names.join('|') === 'Greater China|Test Spring Trip|Test Summer Trip With A Rather Long Name|Test Old Trip', 'on now, then coming, then past: ' + names.join(', '));
  ok(/ON NOW/.test(await page.textContent('.trippick .tp.on')) && await page.$eval('.trippick .tp.on', e => e.getAttribute('aria-current')) === 'true', 'the open one is marked, and says it is on now');
  ok(!names.includes('Test Archived Trip') && /1 archived/.test(await page.textContent('#sheetBody')), 'the archived one is left out, with a pointer to Settings');
  ok(/1 Mar – 8 Mar 2027 · 1 place/.test(await page.textContent('.trippick .tp[data-tid="tw-soon"]')), 'each shows its dates and places: "' + (await page.textContent('.trippick .tp[data-tid="tw-soon"] .ts')).trim() + '"');
  ok(await page.isVisible('[data-act="trip-new"]') && await page.isVisible('#sheetBody [data-act="settings"]'), '+ New trip and Manage trips are there too');
  await page.screenshot({ path: env.out('tripswitch.png') });

  console.log('\n3. one tap opens another');
  await page.click('.trippick .tp[data-tid="tw-soon"]'); await wait(1500);
  ok(await page.evaluate(() => TRIP.id) === 'tw-soon' && !await page.$('#sheet.open'), 'Test Spring Trip is open, the list closed');
  ok((await label()).trim() === 'Test Spring Trip', 'and the header says so');
  ok(await page.evaluate(() => store.data.locations.map(l => l.id).join()) === 'tw-p1', 'with its own places');
  await page.click('#btnTrip'); await wait(600);
  await page.click('.trippick .tp.on'); await wait(300);
  ok(!await page.$('#sheet.open') && await page.evaluate(() => TRIP.id) === 'tw-soon', 'tapping the open one just closes the list');
  await page.click('#btnTrip'); await wait(600);
  await page.click('.trippick .tp[data-tid="tw-later"]'); await wait(1500);
  const w = await page.$eval('#btnTrip', e => { const b = e.getBoundingClientRect(); return b.right <= innerWidth && b.width <= innerWidth * 0.42; });
  ok(w && /Long Name/.test(await label()), 'a long name is cut short to fit, not pushed off the screen');
  await page.click('#btnTrip'); await wait(600);
  await page.click('#sheetBody [data-act="settings"]'); await wait(600);
  ok(/Web App URL/.test(await page.textContent('#sheetBody')) && /Archived trips \(1\)/.test(await page.textContent('#sheetBody')), 'Manage trips opens Settings, archived trips and all');
  await page.evaluate(() => closeSheet());

  console.log('\n4. a trip with no connection');
  await page.route('**/macros/s/**', r => r.abort('internetdisconnected'));
  await page.click('#btnTrip'); await wait(600);
  await page.click('.trippick .tp[data-tid="tw-past"]'); await wait(1500);
  ok(await page.evaluate(() => TRIP.id) === 'tw-later' && (await label()).trim().startsWith('Test Summer'), 'with no connection the open trip stays open, and the header with it');
  ok(!page.errs.length, 'no JS errors ' + page.errs.join('; '));
});
