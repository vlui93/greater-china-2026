/* Deleting places quickly, and getting them back. Swipe a place left in
   Locations to show Delete; it goes from every day (All Days and Home) and
   from the Sheet, with Undo, and into "Recently deleted", where Restore puts
   it back on the same days. With the current backend the bin is the Sheet's
   Bin tab, shared by every phone; with an older one it stays on the phone. */
const { suite, trip } = require('./lib');

suite({}, async (env) => {
  const { ok, wait, rows } = env;
  const page = await env.phone({ clock: '2026-10-18T09:00:00+08:00', clockMode: 'install', context: { hasTouch: true, isMobile: true } });
  await page.evaluate(() => { save(LS.me, 'Alex'); });
  const T = trip();
  const cdp = await page.ctx.newCDPSession(page);
  const rowSel = id => `#placeResults .locwrap:has([data-lid="${id}"])`;
  // A finger swipe, starting on the row's right-hand button the way a thumb would
  const swipe = async id => {
    await page.$eval(rowSel(id), e => e.scrollIntoView({ block: 'center' })); await wait(100);
    const b = await page.$eval(rowSel(id), e => { const r = e.getBoundingClientRect(); return [r.x + r.width - 30, r.y + r.height / 2]; });
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: b[0], y: b[1] }] });
    for (let i = 1; i <= 10; i++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: b[0] - 14 * i, y: b[1] + 1 }] }); await wait(16); }
    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await wait(300);
  };
  const count = lid => T.schedule.filter(s => s.location_id === lid).length;
  const victim = T.locations.map(l => l.id).filter(id => T.locations.find(l => l.id === id).type !== 'hotel').sort((a, b) => count(b) - count(a))[0];
  const days = [...new Set(T.schedule.filter(s => s.location_id === victim).map(s => s.date))];
  const stopsBefore = await page.evaluate(id => store.data.schedule.filter(s => s.location_id === id).map(s => s.id + '@' + s.date).sort(), victim);
  // All Days shows a count per day, not the places
  const dayCount = async d => { await page.evaluate(() => setView('days')); await wait(300); return page.$eval(`#view-days [data-date="${d}"]`, e => e.textContent.match(/(\d+) stops?|nothing planned/)[0]); };
  const before = await dayCount(days[0]);
  await page.evaluate(() => setView('places')); await wait(300);

  console.log('\n1. swipe to delete');
  ok(/Swipe a place to the left to delete it/.test(await page.textContent('#placeResults')), 'the list says how');
  await swipe(victim);
  ok(/-92px/.test(await page.$eval(rowSel(victim) + ' .ckslide', e => e.style.transform)) && await page.isVisible(rowSel(victim) + ' .ckdel'), 'a finger swipe opens Delete');
  ok(!await page.$('#sheet.open'), 'and the swipe didn\'t also open the place or navigate');
  await page.screenshot({ path: env.out('bin-swipe.png') });
  await page.click(rowSel(victim) + ' .ckdel'); await wait(700);
  ok(!await page.$(rowSel(victim)), 'gone from Locations');
  ok(new RegExp('and its ' + stopsBefore.length + ' stop').test(await page.textContent('#toast')) && await page.$('#toast .undo'), 'toast: "' + (await page.textContent('#toast')).replace('Undo', '').trim() + '", with Undo');
  ok(await page.evaluate(id => !store.data.schedule.some(s => s.location_id === id), victim), 'off every day on this phone');
  await page.evaluate(d => { homeMode = 'day'; ui.day = d; setView('today'); }, days[0]); await wait(300);
  ok(!await page.$(`#stopList [data-lid="${victim}"]`), 'not on Home for ' + days[0]);
  const after = await dayCount(days[0]);
  ok(parseInt(after, 10) === parseInt(before, 10) - T.schedule.filter(s => s.location_id === victim && s.date === days[0]).length || (/nothing/.test(after) && parseInt(before, 10) === 1),
    'All Days counts one stop fewer on ' + days[0] + ': ' + before + ' → ' + after);
  ok(!rows('Locations').some(l => l.id === victim) && !rows('Schedule').some(s => s.location_id === victim), 'gone from the Sheet, stops too');

  console.log('\n2. Recently deleted');
  await page.evaluate(() => setView('places')); await wait(300);
  ok(/Recently deleted \(1\)/.test(await page.textContent('#placeResults')), 'the list links to Recently deleted (1)');
  await page.click('[data-act="bin"]'); await wait(300);
  ok(new RegExp(stopsBefore.length + ' stop').test(await page.textContent('#sheetBody')) && await page.$('#sheetBody [data-act="bin-restore"]'), 'the bin lists it, with its stops');
  ok(/by Alex/.test(await page.textContent('#sheetBody')) && /any phone/.test(await page.textContent('#sheetBody')), 'says who deleted it, and that the bin is shared');
  const binRow = rows('Bin').find(b => JSON.parse(b.location).id === victim);
  ok(binRow && binRow.deleted_by === 'Alex' && JSON.parse(binRow.stops).length === stopsBefore.length, 'the Sheet\'s Bin tab holds it, with its stops');
  await page.screenshot({ path: env.out('bin-sheet.png') });
  await page.click('#sheetBody [data-act="bin-restore"]'); await wait(800);
  ok(/Restored .* to \d+ day/.test(await page.textContent('#toast')), 'toast: "' + (await page.textContent('#toast')).trim() + '"');
  ok(/Nothing in the bin/.test(await page.textContent('#sheetBody')), 'the bin is empty again');
  const stopsAfter = await page.evaluate(id => store.data.schedule.filter(s => s.location_id === id).map(s => s.id + '@' + s.date).sort(), victim);
  ok(JSON.stringify(stopsAfter) === JSON.stringify(stopsBefore), 'back on the same days: ' + stopsAfter.join(', '));
  ok(rows('Locations').some(l => l.id === victim) && rows('Schedule').filter(s => s.location_id === victim).length === stopsBefore.length, 'and back in the Sheet, stops too');
  await page.evaluate(() => closeSheet()); await wait(200);
  ok(await page.$(rowSel(victim)), 'back in Locations');

  console.log('\n3. delete from Edit place: Undo, no dialog');
  const other = T.locations.find(l => l.type === 'restaurant').id;
  await page.evaluate(id => locationForm(id), other); await wait(300);
  await page.click('#sheetBody [data-act="delete-location"]'); await wait(700);
  ok(!page.dialogs.length, 'no "are you sure" dialog — Undo and the bin cover it');
  ok(await page.evaluate(id => !store.loc(id), other) && !await page.$('#sheet.open'), 'deleted, sheet closed');
  await page.click('#toast .undo'); await wait(800);
  ok(await page.evaluate(id => !!store.loc(id), other) && rows('Locations').some(l => l.id === other), 'Undo brings it back, in the Sheet too');

  console.log('\n4. forget an item, and a plain tap still opens the place');
  await swipe(other); await page.click(rowSel(other) + ' .ckdel'); await wait(600);
  await page.click('[data-act="bin"]'); await wait(300);
  await page.click('#sheetBody [data-act="bin-forget"]'); await wait(300);
  ok(/Nothing in the bin/.test(await page.textContent('#sheetBody')), 'removing it from the bin empties it');
  ok(!rows('Bin').length, 'and the Sheet\'s Bin tab too');
  await page.evaluate(() => closeSheet()); await wait(200);
  const tapId = T.locations.find(l => l.type === 'attraction').id;
  await page.$eval(rowSel(tapId), e => e.scrollIntoView({ block: 'center' })); await wait(100);
  await page.tap(rowSel(tapId) + ' .lb'); await wait(400);
  ok(await page.$('#sheet.open') && await page.evaluate(id => store.loc(id) && true, tapId), 'a tap opens the place, nothing deleted');

  console.log('\n5. another phone restores it');
  await page.evaluate(() => { closeSheet(); setView('places'); }); await wait(300);
  await swipe(victim); await page.click(rowSel(victim) + ' .ckdel'); await wait(700);
  const other2 = await env.phone({ clock: '2026-10-18T10:00:00+08:00', clockMode: 'install' });
  await other2.evaluate(() => setView('places')); await wait(300);
  ok(await other2.evaluate(id => !store.loc(id), victim), 'the second phone doesn\'t have it either');
  await other2.click('[data-act="bin"]'); await wait(300);
  ok(/by Alex/.test(await other2.textContent('#sheetBody')), 'its bin shows the place the first phone deleted');
  await other2.click('#sheetBody [data-act="bin-restore"]'); await wait(800);
  ok(await other2.evaluate(id => store.data.schedule.filter(s => s.location_id === id).length, victim) === stopsBefore.length, 'restored there, with its stops');
  ok(rows('Locations').some(l => l.id === victim) && !rows('Bin').length, 'the Sheet has it back, and the Bin row is gone');
  await page.evaluate(() => store.sync({ quiet: true })); await wait(800);
  ok(await page.evaluate(id => !!store.loc(id), victim) && !/Recently deleted/.test(await page.textContent('#placeResults')), 'the first phone sees it back after a sync, bin empty');

  console.log('\n6. with an older backend, the bin stays on the phone');
  const old = await env.phone({ clock: '2026-10-18T11:00:00+08:00', clockMode: 'install',
    filter: (out, body) => { if (body.action === 'all' && out.data) delete out.data.bin; return out; } });
  await old.evaluate(() => setView('places')); await wait(300);
  const tid = T.locations.find(l => l.type === 'shopping').id;
  await old.evaluate(id => deletePlace(id), tid); await wait(700);
  await old.click('[data-act="bin"]'); await wait(300);
  ok(/Places deleted on this phone/.test(await old.textContent('#sheetBody')), 'its bin says it is this phone\'s');
  await old.click('#sheetBody [data-act="bin-restore"]'); await wait(800);
  ok(await old.evaluate(id => !!store.loc(id), tid) && rows('Locations').some(l => l.id === tid), 'and restores from there');
  ok(!page.errs.length && !other2.errs.length && !old.errs.length, 'no JS errors ' + page.errs.concat(other2.errs, old.errs).join('; '));
});
