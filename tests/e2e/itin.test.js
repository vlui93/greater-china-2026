/* Importing an itinerary update: the phone says what would change and asks
   first; Cancel still brings in the new places; OK applies the stops to the
   Sheet; a phone that already has the new plan is asked nothing. Run against
   the first backend release, as phones in the field were. */
const { suite, fixture, fixturePath, trip } = require('./lib');

suite({ backend: 'v1' }, async (env) => {
  const { ok, wait } = env;
  const PM = fixture('phone-made.json'), U = fixture('itinerary-update.json');
  PM.locations.forEach(l => env.box.post('saveLocation', l));
  PM.schedule.forEach(e => env.box.post('saveScheduleEntry', e));
  const sheetRows = name => { const sh = env.SS.getSheetByName(name); const v = sh.getRange(1, 1, sh.getLastRow(), sh.getLastColumn()).getValues(); const h = v[0];
    return v.slice(1).map(r => Object.fromEntries(h.map((k, i) => [k, r[i]]))); };
  const added = U.schedule.filter(s => !/^fx-sc-|^sc-mtest/.test(s.id)).length;
  const newPlaces = U.locations.filter(l => l.add).map(l => l.id);
  const imp = async page => env.importFile(page, fixturePath('itinerary-update.json'), 2500);

  console.log('\n1. phone A, says Cancel to the itinerary question');
  const A = await env.phone({ connectWait: 900 });
  A.answers.push(false);
  let t = await imp(A);
  ok(A.dialogs.length === 1 && new RegExp(added + ' stops added').test(A.dialogs[0]) && /2 stops moved or retimed/.test(A.dialogs[0]) && /2 stops removed/.test(A.dialogs[0]),
     'asked first: ' + (A.dialogs[0] || '').replace(/\n+/g, ' / '));
  ok(new RegExp(newPlaces.length + ' new places').test(t) && !/itinerary/.test(t), 'toast: ' + t);
  let sh = sheetRows('Schedule');
  ok(sh.some(r => r.id === 'fx-sc-05') && !sh.some(r => r.id === 'sc-mtnew01'), 'cancelled: Sheet itinerary untouched');
  let L = sheetRows('Locations');
  const tea = L.find(r => r.id === 'loc-mtestn01');
  ok(L.filter(r => newPlaces.includes(r.id)).length === newPlaces.length && tea && tea.name_zh === '測試茶室' && +tea.lat > 22.28 && /invented 1930s/.test(tea.history_blurb),
     'the ' + newPlaces.length + ' new places reached the Sheet with details and pins');
  const lane = L.find(r => r.id === 'loc-mtest0101');
  ok(lane && +lane.lat > 22.28, 'the place saved with no pin got its pin filled');

  console.log('\n2. phone A imports again and says OK');
  A.dialogs = []; A.answers.push(true);
  t = await imp(A);
  ok(A.dialogs.length === 1, 'asked once');
  ok(/itinerary change/.test(t), 'toast: ' + t);
  sh = sheetRows('Schedule');
  const g = id => sh.find(r => r.id === id);
  ok(!g('fx-sc-05') && !g('sc-mtest0102'), '2 stops removed from the Sheet');
  ok(g('sc-mtnew01') && g('sc-mtnew01').location_id === 'loc-mtestn01' && g('sc-mtnew01').date === '2026-10-18', 'Test Tea Room added on 18 Oct');
  ok(g('sc-mtest0101').date === '2026-10-17' && String(g('sc-mtest0101').planned_time) === '20:30', 'the phone-made stop moved to 17 Oct 20:30');
  ok(String(g('fx-sc-03').planned_time) === '20:00', 'a trip stop retimed');
  ok(L.length === sheetRows('Locations').length, 'no duplicate places on re-import');
  const want18 = trip().schedule.filter(s => s.date === '2026-10-18' && s.id !== 'fx-sc-05').length + 1;
  const d18 = await A.evaluate(() => store.dayStops('2026-10-18').map(s => (store.loc(s.location_id) || {}).name_en));
  ok(d18[0] === 'Test Tea Room' && d18.length === want18, '18 Oct on the phone: ' + d18.join(' → '));

  console.log('\n3. phone B already synced the new plan: import asks nothing');
  const B = await env.phone({ connectWait: 900 });
  t = await imp(B);
  ok(B.dialogs.length === 0, 'no itinerary question');
  ok(new RegExp(U.checklist.length + ' checklist items').test(t) && !/itinerary/.test(t), 'toast: ' + t);
  ok(sheetRows('Schedule').length === sh.length, 'Sheet itinerary unchanged: ' + sh.length + ' stops');
});
