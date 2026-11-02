/* Locations as the on-the-road planner: what the review found the travellers
   actually used. Progress against the plan, an "On the plan" filter (with
   "Hide visited": what's left), the day each place is planned for, a spice
   tag and "Mild-friendly" filter read from a "Spice:" line in the notes, and
   one tap to add a place to today. */
const { suite, trip } = require('./lib');

suite({}, async (env) => {
  const { ok, wait, rows } = env;
  const page = await env.phone({ clock: '2026-10-18T09:00:00+08:00', clockMode: 'install' });
  const T = trip();
  const planned = [...new Set(T.schedule.map(s => s.location_id))];
  const dayOf = lid => { const d = T.schedule.filter(s => s.location_id === lid).map(s => s.date).sort()[0]; return Math.round((Date.parse(d) - Date.parse('2026-10-16')) / 864e5) + 1; };
  const n = () => page.$$eval('#placeResults .locrow', e => e.length);
  const prog = () => page.textContent('.planprog .pt');
  await page.evaluate(() => setView('places')); await wait(300);

  console.log('\n1. progress against the plan');
  ok(new RegExp('On the plan · 0 of ' + planned.length + ' planned visited').test(await prog()), 'progress: "' + (await prog()).trim() + '"');
  const peak = 'fx-hk-peak';
  ok(new RegExp('Day ' + dayOf(peak) + '\\b').test(await page.$eval(`#placeResults .locrow:has([data-lid="${peak}"]) .mt`, e => e.textContent)), 'each row says the day it is planned for (Day ' + dayOf(peak) + ')');
  await page.click(`#placeResults .locrow:has([data-lid="${peak}"]) .visitbtn`); await wait(500);
  ok(new RegExp('1 of ' + planned.length + ' planned visited').test(await prog()), 'ticking one off moves it: "' + (await prog()).trim() + '"');
  await page.click('[data-act="city"][data-v="Hong Kong"]'); await wait(200);
  const hk = [...new Set(T.schedule.map(s => s.location_id))].filter(id => T.locations.find(l => l.id === id).city === 'Hong Kong');
  ok(new RegExp('^Hong Kong · 1 of ' + hk.length + ' planned').test((await prog()).trim()), 'per city: "' + (await prog()).trim() + '"');
  await page.click('[data-act="city"][data-v="All"]'); await wait(200);

  console.log('\n2. On the plan, and what is left');
  const all = await n();
  await page.click('[data-act="on-plan"]'); await wait(200);
  ok(await n() === planned.length && planned.length < all, 'On the plan: only places on the schedule (' + planned.length + ' of ' + all + ')');
  await page.click('[data-act="hide-visited"]'); await wait(200);
  ok(await n() === planned.length - 1, 'with Hide visited: what is left to see (' + (await n()) + ')');
  await page.click('[data-act="hide-visited"]'); await page.click('[data-act="on-plan"]'); await wait(200);

  console.log('\n3. an optional stop counts as an extra');
  const once = planned.find(id => id !== peak && T.schedule.filter(s => s.location_id === id).length === 1 && T.locations.find(l => l.id === id).type !== 'hotel');
  const sid = T.schedule.find(s => s.location_id === once).id;
  await page.evaluate(sid => updateStop(sid, { notes: 'OPTIONAL — only if there is time' }), sid); await wait(400);
  await page.evaluate(() => render()); await wait(200);
  ok(/Option on day/.test(await page.$eval(`#placeResults .locrow:has([data-lid="${once}"]) .mt`, e => e.textContent)), 'its row says "Option on day …"');
  ok(new RegExp('of ' + (planned.length - 1) + ' planned visited · extras 0 of 1').test(await prog()), 'progress counts it as an extra: "' + (await prog()).trim() + '"');

  console.log('\n4. spice, from the notes');
  ok(await page.$('[data-act="mild"]') === null, 'no Mild-friendly chip while no place says its spice level');
  const [mild, hot] = T.locations.filter(l => l.type === 'restaurant').map(l => l.id);
  await page.evaluate(([a, b]) => Promise.all([
    saveLocation(Object.assign({}, store.loc(a), { notes: 'Spice: mild options — the clear-broth soup and the steamed fish\nWalk in.' })),
    saveLocation(Object.assign({}, store.loc(b), { notes: 'Spice: spicy' }))]), [mild, hot]); await wait(500);
  await page.evaluate(() => render()); await wait(200);
  ok(/Mild options/.test(await page.$eval(`#placeResults .locrow:has([data-lid="${mild}"]) .mt`, e => e.textContent)), 'the row shows "Mild options"');
  ok(/Spicy/.test(await page.$eval(`#placeResults .locrow:has([data-lid="${hot}"]) .mt`, e => e.textContent)), 'and "Spicy" on the other');
  await page.click('[data-act="mild"]'); await wait(200);
  const shown = await page.$$eval('#placeResults .locrow [data-act="open"].lb', e => e.map(x => x.dataset.lid));
  ok(shown.length === 1 && shown[0] === mild, 'Mild-friendly leaves only the mild one: ' + shown.join(','));
  await page.screenshot({ path: env.out('plan-locations.png') });
  await page.click('[data-act="mild"]'); await wait(200);
  ok((rows('Locations').find(l => l.id === mild) || {}).notes.startsWith('Spice: mild options'), 'the spice line is in the Sheet, as notes');

  console.log('\n5. add to today');
  const notToday = planned.find(id => !T.schedule.some(s => s.location_id === id && s.date === '2026-10-18') && T.locations.find(l => l.id === id).type !== 'hotel');
  await page.evaluate(id => locationDetail(id), notToday); await wait(300);
  ok(await page.isVisible('#sheetBody [data-act="add-today"]'), 'the place page offers "Add to today" during the trip');
  await page.click('#sheetBody [data-act="add-today"]'); await wait(700);
  ok(await page.evaluate(id => store.dayStops('2026-10-18').some(s => s.location_id === id), notToday), 'it is on today\'s plan');
  ok(/Added to today/.test(await page.textContent('#toast')) && await page.$('#sheetBody [data-act="add-today"]') === null, 'toast says so; the button goes');
  ok(rows('Schedule').some(s => s.location_id === notToday && s.date === '2026-10-18'), 'the stop reached the Sheet');
  await page.click('#toast .undo'); await wait(700);
  ok(!await page.evaluate(id => store.dayStops('2026-10-18').some(s => s.location_id === id), notToday), 'Undo takes it off again');
  await page.evaluate(() => closeSheet());
  await page.clock.setSystemTime(new Date('2026-11-05T09:00:00+08:00'));
  await page.evaluate(id => locationDetail(id), notToday); await wait(300);
  ok(await page.$('#sheetBody [data-act="add-today"]') === null, 'not offered once the trip is over');
  ok(!page.errs.length, 'no JS errors ' + page.errs.join('; '));
});
