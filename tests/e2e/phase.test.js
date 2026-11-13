/* Four tabs — Home, Days, Places, Trip — with Prep and Bookings as screens of
   the Trip tab, each row of its hub saying where things stand; Home changing
   with the trip (before: what to look at in the plan; during: today; after:
   complete); and Chinese under the tab names only for a trip that uses it. */
const { suite, trip } = require('./lib');

suite({}, async (env) => {
  const { ok, wait, rows } = env;
  const T = trip(), box = env.box;
  const today = '2026-10-05';
  box.post('saveChecklistItem', { id: 'ck-p1', kind: 'task', text: 'Buy travel insurance', due: '2026-10-01', done: '', updated: '2026-09-01T00:00:00Z' });
  box.post('saveChecklistItem', { id: 'ck-p2', kind: 'task', text: 'Check passports', due: '2026-10-10', done: '2026-09-20T00:00:00Z', done_by: 'Alex', updated: '2026-09-20T00:00:00Z' });
  box.post('saveChecklistItem', { id: 'ck-p3', kind: 'task', text: 'Install the map apps', due: '2026-10-12', done: '', updated: '2026-09-01T00:00:00Z' });
  // Shape the plan: one middle day emptied, and two heavy days in a row after it
  const dates = [...new Set(T.schedule.map(s => s.date))].sort();
  const empty = dates[5], h1 = dates[7], h2 = dates[8];
  T.schedule.filter(s => s.date === empty).forEach(s => box.post('deleteScheduleEntry', { id: s.id }));
  box.post('saveDay', { id: 'day-h1', date: h1, label: 'Mountain day (heavy)' });
  // the second is heavy by what a stop's note says, not by its name
  box.post('saveScheduleEntry', { id: T.schedule.find(x => x.date === h2).id, notes: 'A full day trip out to the valley' });
  const page = await env.phone({ clock: today + 'T09:00:00+08:00', clockMode: 'install' });
  const sel = () => page.$$eval('nav.tabs button[aria-selected="true"]', e => e.map(x => x.dataset.view).join());
  const back = () => page.isVisible('#btnHub');

  console.log('\n1. four tabs');
  const tabs = await page.$$eval('nav.tabs button', e => e.map(x => x.querySelector('span').textContent));
  ok(tabs.join() === 'Home,Days,Places,Trip', 'the bar is ' + tabs.join(' · '));
  ok(!await page.$('nav.tabs [data-view="prep"]') && !await page.$('nav.tabs [data-view="bookings"]'), 'Prep and Bookings are no longer tabs');
  ok(!await back(), 'no back button on Home');

  console.log('\n2. the Trip tab is a hub that says where things stand');
  await page.click('nav.tabs button[data-view="trip"]'); await wait(300);
  const hub = await page.$$eval('#view-trip .hubrow', e => e.map(x => x.querySelector('.ht').textContent + ': ' + x.querySelector('.hs').textContent));
  ok(hub.length === 4 && /^Prep: 1 of 3 tasks done · 1 overdue$/.test(hub[0]), hub[0]);
  ok(new RegExp('^Bookings: ' + T.bookings.length + ' bookings · next ').test(hub[1]), hub[1]);
  ok(/^People: Who can see which trip$/.test(hub[2]) && /^Settings: /.test(hub[3]), hub[2] + ' / ' + hub[3]);
  ok(await sel() === 'trip' && !await back(), 'Trip is the selected tab; no back button on the hub itself');
  await page.screenshot({ path: env.out('phase-hub.png') });

  console.log('\n3. Prep and Bookings open from it, with a way back');
  await page.click('#view-trip [data-act="go"][data-v="prep"]'); await wait(500);
  ok(await page.isVisible('#view-prep') && /Buy travel insurance/.test(await page.textContent('#view-prep')), 'Prep opens');
  ok(await sel() === 'trip' && await back(), 'Trip stays selected, and the header has a back button');
  await page.click('#btnHub'); await wait(300);
  ok(await page.isVisible('#view-trip') && !await back(), 'back returns to the hub');
  await page.click('#view-trip [data-act="go"][data-v="bookings"]'); await wait(500);
  ok(await page.$$eval('#view-bookings .bk', e => e.length) === T.bookings.length && await sel() === 'trip' && await back(), 'Bookings opens the same way');
  await page.reload(); await wait(800);
  ok(await page.isVisible('#view-bookings') && await sel() === 'trip' && await back(), 'reopening the app on Bookings keeps Trip selected and the back button');
  await page.click('nav.tabs button[data-view="places"]'); await wait(300);
  ok(await sel() === 'places' && !await back(), 'another tab: no back button');
  await page.click('nav.tabs button[data-view="trip"]'); await wait(300);
  await page.click('#view-trip [data-act="people"]'); await wait(700);
  ok(await page.$('#sheet.open') && /People/.test(await page.textContent('#sheetTitle')), 'People opens from the hub');
  await page.evaluate(() => closeSheet()); await wait(200);
  await page.click('#view-trip [data-act="settings"]'); await wait(600);
  ok(/Web App URL/.test(await page.textContent('#sheetBody')), 'and Settings');
  await page.evaluate(() => closeSheet());

  console.log('\n4. before the trip, Home says what to look at in the plan');
  await page.click('nav.tabs button[data-view="today"]'); await wait(300);
  ok(/Departing in 11 days/.test(await page.textContent('.triphero')), 'countdown: ' + (await page.textContent('.triphero .c')).trim());
  const notes = await page.$$eval('.plannotes .pn', e => e.map(x => x.innerText.replace(/\s+/g, ' ').trim() + '@' + (x.dataset.date || '')));
  ok(notes.some(n => /^Nothing planned/.test(n) && n.endsWith('@' + empty)), 'the emptied day: "' + (notes.find(n => n.endsWith('@' + empty)) || '') + '"');
  ok(notes.some(n => /^2 heavy days in a row/.test(n) && n.endsWith('@' + h1)), 'the two heavy days: "' + (notes.find(n => /heavy/.test(n)) || '') + '"');
  ok(notes.some(n => /No meals planned|Only one meal planned/.test(n)), 'and days short of meals');
  ok(!notes.some(n => n.endsWith('@' + dates[0]) && /Nothing/.test(n)), 'the travel day at the start isn\'t called empty');
  await page.screenshot({ path: env.out('phase-before.png'), fullPage: true });
  await page.click('.plannotes .pn[data-date="' + empty + '"]'); await wait(400);
  ok(await page.evaluate(() => homeMode + '/' + ui.day) === 'day/' + empty, 'tapping one opens that day');
  box.post('saveDay', { id: 'day-h2', date: h2, label: 'Valley day (light)' });
  box.post('saveDay', { id: 'day-e', date: empty, label: 'Flex day' });
  await page.evaluate(() => store.sync({ quiet: true })); await wait(500);
  await page.evaluate(() => { homeMode = 'trip'; setView('today'); }); await wait(300);
  const notes2 = await page.$$eval('.plannotes .pn', e => e.map(x => x.innerText.replace(/\s+/g, ' ').trim() + '@' + (x.dataset.date || '')));
  ok(!notes2.some(n => /heavy/.test(n)) && !notes2.some(n => n.endsWith('@' + empty)), 'naming a day "light" ends the heavy run; naming the empty one "flex" clears it');

  console.log('\n5. during and after');
  await page.clock.setSystemTime(new Date('2026-10-18T09:00:00+08:00'));
  await page.reload(); await wait(800);
  ok(await page.evaluate(() => homeMode) === 'day' && /Today/.test(await page.textContent('#viewTitle')) && !await page.$('.plannotes'), 'during the trip, Home is today\'s plan, with no plan notes');
  await page.clock.setSystemTime(new Date('2026-11-05T09:00:00+08:00'));
  await page.reload(); await wait(800);
  ok(/Trip complete/.test(await page.textContent('.triphero')) && !await page.$('.plannotes'), 'afterwards it says the trip is complete, with no plan notes');
  await page.click('nav.tabs button[data-view="trip"]'); await wait(300);
  const after = await page.$eval('#view-trip .hubrow .hs', e => e.textContent + (e.classList.contains('warn') ? ' [flagged]' : ''));
  ok(/tasks done/.test(after) && !/flagged/.test(after), 'the hub no longer flags overdue tasks once the trip is over: "' + after + '"');

  console.log('\n6. Chinese under the tab names only where the trip uses it');
  ok(await page.isVisible('nav.tabs .tz.zh') && /旅程/.test(await page.textContent('#viewTitle')), 'this trip: shown');
  await page.clock.setSystemTime(new Date(today + 'T09:00:00+08:00'));
  await page.click('#view-trip [data-act="settings"]'); await wait(600);
  await page.click('[data-act="trip-new"]'); await wait(300);
  await page.fill('#t_name', 'Test Elsewhere'); await page.fill('#t_start', '2027-04-01'); await page.fill('#t_end', '2027-04-05');
  await page.fill('#t_tz', 'Europe/Lisbon');
  await page.click('[data-act="trip-save"]'); await wait(1000);
  const nt = await page.evaluate(() => TRIP.name + ' / china:' + tripHasChina() + ' / ' + document.body.className);
  ok(await page.evaluate(() => TRIP.name) === 'Test Elsewhere' && !await page.isVisible('nav.tabs .tz.zh'), 'a trip with no Chinese-speaking city: tab names only (' + nt + ')');
  await page.click('nav.tabs button[data-view="trip"]'); await wait(300);
  ok((await page.textContent('#viewTitle')).trim() === 'Trip', 'and the hub is titled plainly');
  const sizes = await page.$$eval('nav.tabs button', e => e.map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  ok(sizes.every(x => x[0] >= 44 && x[1] >= 44), 'tabs still at least 44px each way (' + sizes.map(x => x.join('×')).join(', ') + ')');
  ok(!page.errs.length, 'no JS errors ' + page.errs.join('; '));
});
