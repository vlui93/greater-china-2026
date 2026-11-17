/* The recap: per city and in total, planned places visited and skipped,
   extras (an optional stop taken, a place never on the plan) and meals kept —
   checked against counts made here from the invented trip — on Home after
   the trip, in the Trip hub once anything is ticked, and as text to copy. */
const { suite, trip } = require('./lib');

suite({}, async (env) => {
  const { ok, wait } = env;
  const T = trip(), box = env.box;
  const loc = id => T.locations.find(l => l.id === id);
  // One stop made optional, one place added that was never on the plan
  const optStop = T.schedule.find(s => loc(s.location_id).type === 'attraction' && T.schedule.filter(x => x.location_id === s.location_id).length === 1);
  box.post('saveScheduleEntry', { id: optStop.id, notes: 'OPTIONAL — only if there is time' });
  box.post('saveLocation', { id: 'fx-unplanned', name_en: 'Test Unplanned Find', name_zh: '测试偶遇', city: loc(optStop.location_id).city, type: 'shopping', lat: 22.3, lng: 114.2, nav_app: 'google' });
  // The plan, counted here: a place is planned if it has a stop that isn't optional; hotels aside
  const plannedIds = [...new Set(T.schedule.filter(s => s.id !== optStop.id).map(s => s.location_id))].filter(id => loc(id).type !== 'hotel');
  const cities = [...new Set(plannedIds.map(id => loc(id).city))];
  // Visit: every planned place in the first city but one, half of the rest, the optional one and the unplanned one
  const c0 = cities[0], inC0 = plannedIds.filter(id => loc(id).city === c0), skipC0 = inC0[inC0.length - 1];
  const visited = new Set(inC0.filter(id => id !== skipC0).concat(plannedIds.filter(id => loc(id).city !== c0).filter((id, i) => i % 2 === 0)));
  [...visited, optStop.location_id, 'fx-unplanned'].forEach(id => box.post('saveLocation', { id, visited: '2026-10-20' }));
  const n = { planned: plannedIds.length, done: plannedIds.filter(id => visited.has(id)).length,
    meals: plannedIds.filter(id => loc(id).type === 'restaurant').length, kept: plannedIds.filter(id => loc(id).type === 'restaurant' && visited.has(id)).length };
  const c0n = { planned: inC0.length, done: inC0.length - 1 };

  const page = await env.phone({ clock: '2026-11-05T09:00:00+08:00', clockMode: 'install', context: { permissions: ['clipboard-read', 'clipboard-write'] } });

  console.log('\n1. after the trip, Home says how it went');
  const card = await page.$eval('.recapcard', e => e.innerText).catch(() => '');
  ok(new RegExp('^' + n.done + ' of ' + n.planned + ' planned places visited').test(card.trim()), 'Home: "' + card.split('\n')[0] + '" (counted here: ' + n.done + ' of ' + n.planned + ')');
  ok(await page.evaluate(() => isStub(recapSheet)), 'without loading the recap\'s file to say it');
  await page.click('.recapcard'); await wait(600);
  ok(await page.$('#sheet.open') && (await page.textContent('#sheetTitle')).trim() === 'Recap', 'tapping it opens the recap');

  console.log('\n2. the numbers, against the count made here');
  const head = (await page.$eval('#sheetBody .blurb b', e => e.textContent)).trim();
  ok(head === 'Visited ' + n.done + ' of ' + n.planned + ' planned places, plus 2 extras; ' + n.kept + ' of ' + n.meals + ' planned meals kept.', head);
  const rc = await page.$$eval('#sheetBody .recapcity', e => e.map(x => ({ city: x.dataset.city, n: x.querySelector('.rc-n').textContent, skip: (x.querySelector('.rc-skip') || {}).textContent || '', extra: (x.querySelector('.rc-extra') || {}).textContent || '' })));
  ok(rc.map(x => x.city).join() === cities.join(), 'one card per city, in the order visited: ' + rc.map(x => x.city).join(', '));
  const r0 = rc.find(x => x.city === c0);
  ok(new RegExp('^' + c0n.done + ' of ' + c0n.planned + ' planned').test(r0.n), c0 + ': ' + r0.n);
  ok(r0.skip.includes(loc(skipC0).name_en) && !inC0.filter(id => id !== skipC0).some(id => r0.skip.includes(loc(id).name_en)), 'its Skipped line names the one planned place not visited, and no visited one');
  const rx = rc.find(x => x.city === loc(optStop.location_id).city);
  ok(rx.extra.includes(loc(optStop.location_id).name_en) && rx.extra.includes('Test Unplanned Find'), 'Extras: the optional stop that was taken and the place that was never on the plan');
  ok(!rc.some(x => T.locations.filter(l => l.type === 'hotel').some(h => (x.skip + x.extra).includes(h.name_en))), 'hotels aren\'t counted either way');
  await page.screenshot({ path: env.out('recap.png'), fullPage: true });

  console.log('\n3. copy as text');
  await page.click('[data-act="recap-copy"]'); await wait(400);
  const clip = await page.evaluate(() => navigator.clipboard.readText());
  ok(/Recap copied/.test(await page.textContent('#toast')) && clip.split('\n')[1] === head, 'copied; its second line is the headline');
  ok(clip.split('\n')[0].startsWith('Trip recap — ') && clip.includes('\n' + c0 + ': ' + c0n.done + ' of ' + c0n.planned + ' planned') && clip.includes('  Skipped: ') && clip.includes('  Extras: '), 'with the trip, each city, what was skipped and the extras');
  ok(clip === await page.evaluate(() => recapText()), 'exactly the text the app builds');
  await page.evaluate(() => closeSheet());

  console.log('\n4. in the Trip hub');
  await page.click('nav.tabs button[data-view="trip"]'); await wait(300);
  const row = await page.$$eval('#view-trip .hubrow', e => e.map(x => x.querySelector('.ht').textContent + ': ' + x.querySelector('.hs').textContent).find(x => /^Recap/.test(x)) || '');
  ok(row === 'Recap: ' + n.done + ' of ' + n.planned + ' planned places visited', row);
  await page.click('#view-trip [data-act="recap"]'); await wait(400);
  ok(await page.$('#sheet.open'), 'and opens from there');
  await page.evaluate(() => closeSheet());

  console.log('\n5. a trip with nothing ticked yet, before it starts');
  const fresh = await (async () => { [...visited, optStop.location_id, 'fx-unplanned'].forEach(id => box.post('saveLocation', { id, visited: '' }));
    return env.phone({ clock: '2026-10-05T09:00:00+08:00', clockMode: 'install' }); })();
  ok(!await fresh.$('.recapcard'), 'no recap on Home before the trip');
  await fresh.click('nav.tabs button[data-view="trip"]'); await wait(300);
  ok(!await fresh.$('#view-trip [data-act="recap"]'), 'and no Recap row while nothing has been visited');
  box.post('saveLocation', { id: plannedIds[0], visited: '2026-10-17' });
  await fresh.evaluate(() => store.sync({ quiet: true })); await wait(500);
  ok(/^1 of /.test(await fresh.$eval('#view-trip [data-act="recap"] .hs', e => e.textContent).catch(() => '')), 'the row appears with the first tick');
  ok(!page.errs.length && !fresh.errs.length, 'no JS errors ' + page.errs.concat(fresh.errs).join('; '));
});
