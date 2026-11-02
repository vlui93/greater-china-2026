/* Who sees which trip. The owner adds a person for some trips, with their own
   key, and sends an invite; that person's phone sees those trips and nothing
   else — not the other trip's places, stops, bookings, checklist, day names,
   bin or "Other trips". A change they may not make is refused and dropped.
   Removing them stops their key. A view-only person can look, not change.
   Keys never show in the console. */
const { suite, trip } = require('./lib');

suite({}, async (env) => {
  const { ok, wait, rows } = env;
  const T = trip(), box = env.box;
  box.post('saveTrip', { id: 'gc2026', name: 'Greater China', start: '2026-10-16', end: '2026-11-01', tz: 'Asia/Shanghai', is_default: '1' });
  box.post('saveTrip', { id: 'tB', name: 'Secret Trip', start: '2027-05-01', end: '2027-05-05', tz: 'Asia/Tokyo' });
  ['Hidden Temple', 'Hidden Cafe'].forEach((n, i) => box.post('saveLocation', { id: 'loc-hid' + i, name_en: n, name_zh: '秘' + i, city: 'Kyoto', type: 'attraction', trip_id: 'tB' }));
  box.post('saveScheduleEntry', { id: 'sc-hid', date: '2027-05-02', order_index: 1, location_id: 'loc-hid0', trip_id: 'tB' });
  box.post('saveBooking', { id: 'bk-hid', type: 'hotel', date: '2027-05-01', description: 'Hidden Hotel', trip_id: 'tB' });
  box.post('saveChecklistItem', { id: 'ck-hid', kind: 'task', text: 'Hidden task', trip_id: 'tB' });
  box.post('saveDay', { id: 'day-tB-20270502', trip_id: 'tB', date: '2027-05-02', label: 'Hidden day' });
  box.post('deleteLocation', { id: 'loc-hid1', bin_id: 'bin-hid' });
  const logs = [];
  const watch = p => p.on('console', m => logs.push(m.text()));

  console.log('\n1. the owner adds Sam for the first trip only');
  const owner = await env.phone({ context: { permissions: ['clipboard-read', 'clipboard-write'] } }); watch(owner);
  await owner.click('#btnSettings'); await wait(300);
  ok(/People/.test(await owner.textContent('#sheetBody')) && await owner.$('[data-act="people"]'), 'Settings has People for the owner');
  await owner.click('[data-act="people"]'); await wait(800);
  await owner.click('[data-act="person-new"]'); await wait(300);
  await owner.fill('#pp_name', 'Sam');
  await owner.uncheck('.pp_trip[value="tB"]'); await owner.check('.pp_trip[value="gc2026"]');
  await owner.click('[data-act="person-save"]'); await wait(800);
  const inv = await owner.inputValue('#pp_invite');
  ok(/^Hi Sam — this opens our trip app/.test(inv) && /#join=[A-Za-z0-9_-]+/.test(inv), 'an invite with a link');
  const sam = rows('Members').find(m => m.name === 'Sam');
  ok(sam && sam.trips === 'gc2026' && sam.role === 'member' && /^m-[0-9a-f]{64}$/.test(sam.key), 'Sam is in the Members tab: first trip only, can edit, own key');
  await owner.click('[data-act="person-invite"]'); await wait(300);
  ok((await owner.evaluate(() => navigator.clipboard.readText())) === inv, 'Copy invite puts it on the clipboard');
  await owner.screenshot({ path: env.out('people-invite.png') });
  const link = inv.match(/https?:\S+#join=\S+/)[0];

  console.log('\n2. Sam opens the invite');
  const phone = await env.phone({ connect: false }); watch(phone);
  phone.answers.push(true);
  await phone.goto(link); await wait(1500);
  ok(/Connect this phone as Sam\?/.test(phone.dialogs.join('|')), 'asks first: "Connect this phone as Sam?"');
  ok(!/#join/.test(phone.url()), 'the invite is cleared from the address bar');
  const d = await phone.evaluate(() => ({ trip: TRIP.id, trips: allTrips().map(t => t.id), locs: store.raw.locations.map(l => l.id), sc: store.raw.schedule.map(s => s.id),
    bk: store.raw.bookings.map(b => b.id), ck: store.raw.checklist.map(c => c.id), days: (store.raw.days || []).map(x => x.id), bin: (store.raw.bin || []).map(b => b.id), me: store.raw.me }));
  ok(d.trip === 'gc2026' && d.locs.length === T.locations.length, 'connected, on the first trip, with its ' + T.locations.length + ' places');
  ok(JSON.stringify(d.trips) === '["gc2026"]', 'the trip list holds only that trip');
  ok(!d.locs.some(id => /hid/.test(id)) && !d.sc.includes('sc-hid') && !d.bk.includes('bk-hid') && !d.ck.includes('ck-hid') && !d.days.some(x => /tB/.test(x)) && !d.bin.includes('bin-hid'),
    'none of the secret trip: places, stops, bookings, checklist, day names, bin');
  ok(d.me && d.me.name === 'Sam' && !d.me.owner && !('key' in d.me), 'the phone knows it is Sam, not the owner');
  await phone.evaluate(() => setView('places')); await wait(300);
  await phone.click('[data-act="library"]').catch(() => {}); await wait(800);
  ok(!/Hidden/.test(await phone.textContent('body')), '"Other trips" shows nothing from the secret trip');
  await phone.evaluate(() => closeSheet());
  await phone.click('#btnSettings'); await wait(300);
  const st = await phone.textContent('#sheetBody');
  ok(/Signed in[\s\S]*As Sam · can edit · 1 trip/.test(st) && !/Manage people/.test(st) && !await phone.$('[data-act="trip-new"]'), 'Settings: "As Sam · can edit · 1 trip", no People, no new trip');
  await phone.evaluate(() => closeSheet());

  console.log('\n3. Sam can edit his trip, not the other');
  const lid = T.locations[0].id;
  await phone.evaluate(id => saveLocation(Object.assign({}, store.loc(id), { notes: 'Sam was here' })), lid); await wait(700);
  ok((rows('Locations').find(l => l.id === lid) || {}).notes === 'Sam was here', 'his edit reaches the Sheet');
  await phone.evaluate(() => saveLocation({ id: 'loc-hid0', name_en: 'Taken over', trip_id: 'tB' })); await wait(900);
  ok(/Not saved: This key can't see that trip/.test(await phone.textContent('#toast')), 'a change to the secret trip: "Not saved: This key can\'t see that trip"');
  ok(await phone.evaluate(() => store.queue.length) === 0 && (rows('Locations').find(l => l.id === 'loc-hid0') || {}).name_en === 'Hidden Temple', 'dropped from the queue; the Sheet untouched');

  console.log('\n4. a view-only person, by pasting the invite');
  const vic = box.post('saveMember', { name: 'Vic', trips: 'gc2026', role: 'viewer' }).data.member;
  const vinv = 'Hi Vic — ' + link.replace(/#join=\S+/, '') + '#join=' + Buffer.from(JSON.stringify({ u: 'https://script.google.com/macros/s/X/exec', k: vic.key, n: 'Vic' })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const vp = await env.phone({ connect: false }); watch(vp);
  await vp.fill('#g_url', vinv); await wait(200);
  ok(await vp.inputValue('#g_url') === 'https://script.google.com/macros/s/X/exec' && await vp.inputValue('#g_key') === vic.key, 'pasting the whole invite fills in both boxes');
  await vp.click('#gateBtn'); await wait(1200);
  ok(/view only/.test(await vp.textContent('#view-today .syncbadge')), 'the badge says view only');
  await vp.evaluate(id => saveLocation(Object.assign({}, store.loc(id), { notes: 'Vic edit' })), lid); await wait(900);
  ok(/Not saved: View only/.test(await vp.textContent('#toast')) && (rows('Locations').find(l => l.id === lid) || {}).notes === 'Sam was here', 'a change is refused: "Not saved: View only…"');

  console.log('\n5. removing Sam');
  await owner.click('[data-act="people"]'); await wait(800);
  await owner.click('[data-act="person-edit"][data-mid="' + sam.id + '"]'); await wait(300);
  owner.answers.push(true);
  await owner.click('[data-act="person-remove"]'); await wait(800);
  ok(/Removed \(1\)/.test(await owner.textContent('#sheetBody')) && rows('Members').find(m => m.name === 'Sam').revoked, 'Sam moves under Removed');
  await phone.click('#view-today [data-act="sync"]').catch(async () => { await phone.evaluate(() => setView('today')); await phone.click('#view-today [data-act="sync"]'); }); await wait(900);
  ok(/this key has been removed — ask the trip owner for a new invite/.test(await phone.textContent('#toast')), 'Sam\'s next sync: "this key has been removed…"');
  ok(await vp.evaluate(() => store.sync({ quiet: true }).then(() => true, () => false)), 'Vic still syncs');

  console.log('\n6. no keys in the console');
  ok(!logs.some(l => l.includes(sam.key) || l.includes(vic.key)), 'no key ever logged');
  ok(!owner.errs.length && !phone.errs.length && !vp.errs.length, 'no JS errors ' + owner.errs.concat(phone.errs, vp.errs).join('; '));
});
