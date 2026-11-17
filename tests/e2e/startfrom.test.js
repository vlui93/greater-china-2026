/* A new trip started from an old one: its checklist tasks and packing lists
   arrive as a fresh copy — nothing ticked, nobody assigned, not tied to a
   place, due dates moved by the gap between the two first days — in one
   request, with the old trip untouched and no places or bookings copied. */
const { suite, trip } = require('./lib');

suite({}, async (env) => {
  const { ok, wait, rows } = env;
  const T = trip(), box = env.box;
  const place = T.locations[1].id;
  const CK = [
    { id: 'ck-s1', kind: 'task', section: 'Documents', text: 'Buy travel insurance', due: '2026-09-20', done: '2026-09-01T00:00:00Z', done_by: 'Alex', order_index: 1 },
    { id: 'ck-s2', kind: 'task', section: 'Bookings', text: 'Book the tickets for the invented peak', due: '2026-10-10', location_id: place, order_index: 2 },
    { id: 'ck-s3', kind: 'task', section: 'Documents', text: 'A task with no date', order_index: 3 },
    { id: 'ck-s4', kind: 'pack', section: 'Shared', text: 'Power board', done: '2026-10-01T00:00:00Z', done_by: 'Sam', assignee: 'Sam', order_index: 4 },
    { id: 'ck-s5', kind: 'each', section: 'Documents', text: 'Passport', order_index: 5 },
    { id: 'ck-s6', kind: 'task', section: 'Documents', text: 'A deleted task', removed: '1', order_index: 6 } ];
  CK.forEach(i => box.post('saveChecklistItem', Object.assign({ updated: '2026-09-01T00:00:00Z' }, i)));
  const page = await env.phone({ clock: '2026-11-10T09:00:00+08:00', clockMode: 'install' });
  await page.evaluate(() => { packing.items = [{ id: 'pk-m1', kind: 'pack', section: 'Mine', text: 'Earplugs', done: '2026-10-10T00:00:00Z', order_index: 1 }, { id: 'pk-m2', kind: 'pack', section: 'Mine', text: 'Sunhat', done: '', order_index: 2 }]; packing.persist(); });
  const newTrip = async (name, start, end, from) => {
    await page.click('#btnSettings'); await wait(500);
    await page.click('[data-act="trip-new"]'); await wait(300);
    await page.fill('#t_name', name); await page.fill('#t_start', start); await page.fill('#t_end', end); await page.fill('#t_tz', 'Asia/Tokyo');
    if (from !== undefined) await page.selectOption('#t_from', from);
    const n0 = page.posted.length;
    await page.click('[data-act="trip-save"]'); await wait(1500);
    return page.posted.slice(n0);
  };
  const of = id => rows('Checklist').filter(r => r.trip_id === id);

  console.log('\n1. the form offers it');
  await page.click('#btnSettings'); await wait(500); await page.click('[data-act="trip-new"]'); await wait(300);
  const opts = await page.$$eval('#t_from option', e => e.map(x => x.textContent));
  ok(opts[0] === 'An empty trip' && opts.some(o => /Greater China’s checklist and packing/.test(o)), 'Start from: ' + opts.join(' | '));
  ok(/Places and bookings aren’t copied/.test(await page.textContent('#sheetBody')), 'and says what is and isn\'t copied');
  await page.evaluate(() => closeSheet());

  console.log('\n2. a trip started from the open one');
  const sent = await newTrip('Test Next Trip', '2027-05-04', '2027-05-14', 'gc2026');   // first day 200 days after 16 Oct 2026
  const id2 = await page.evaluate(() => TRIP.id), mine = of(id2);
  ok(await page.evaluate(() => TRIP.name) === 'Test Next Trip' && id2 !== 'gc2026', 'the new trip is open');
  ok(mine.length === 5 && !mine.some(r => /deleted/.test(r.text)), 'its checklist has the 5 live items, not the deleted one (' + mine.map(r => r.kind).join(',') + ')');
  ok(mine.every(r => !r.done && !r.done_by && !r.assignee && !r.location_id && !r.removed), 'nothing ticked, nobody assigned, none tied to a place');
  const due = t => (mine.find(r => r.text === t) || {}).due;
  ok(due('Buy travel insurance') === '2027-04-08' && due('Book the tickets for the invented peak') === '2027-04-28' && due('A task with no date') === '', 'due dates moved 200 days with the first day: ' + due('Buy travel insurance') + ', ' + due('Book the tickets for the invented peak') + '; none invented for the one without');
  ok(mine.every(r => !CK.some(c => c.id === r.id)) && new Set(mine.map(r => r.id)).size === 5, 'each copy has an id of its own');
  const old = of('').concat(of('gc2026'));
  ok(old.find(r => r.id === 'ck-s1').done_by === 'Alex' && old.find(r => r.id === 'ck-s4').assignee === 'Sam' && old.find(r => r.id === 'ck-s2').location_id === place && old.length === 6, 'the old trip\'s checklist is exactly as it was');
  const ups = sent.filter(j => j.action !== 'all' && j.action !== 'ping');
  ok(ups.length === 1 && ups[0].action === 'batch' && ups[0].payload.jobs.length === 6, 'the trip and its 5 items went up in one request (' + ups.map(j => j.action).join(', ') + ')');
  ok(rows('Locations').filter(l => l.trip_id === id2).length === 0 && rows('Bookings').filter(b => b.trip_id === id2).length === 0 && await page.evaluate(() => store.data.locations.length) === 0, 'no places or bookings were copied');
  ok(/Started from Greater China: 3 tasks and 4 packing items copied, nothing ticked/.test(await page.textContent('#toast')), 'toast: "' + (await page.textContent('#toast')).trim() + '"');
  await env.go(page, 'prep'); await wait(600);
  ok(/Buy travel insurance/.test(await page.textContent('#view-prep')) && await page.$$eval('#view-prep .ckbox[aria-checked="true"]', e => e.length) === 0, 'Prep shows the tasks, none ticked');
  const pk = await page.evaluate(() => packing.items.map(i => i.text + ':' + (i.done ? 'ticked' : 'open')).join(','));
  ok(pk === 'Earplugs:open,Sunhat:open', 'this phone\'s own packing list came too, unticked (' + pk + ')');
  ok(await page.evaluate(() => JSON.parse(localStorage.getItem('gct.packing')).map(i => i.text + ':' + (i.done ? 'ticked' : 'open')).join(',')) === 'Earplugs:ticked,Sunhat:open', 'the old trip\'s own list is untouched');
  await page.screenshot({ path: env.out('startfrom-prep.png') });

  console.log('\n3. from a trip that isn\'t the open one');
  await page.click('#btnSettings'); await wait(500); await page.click('[data-act="trip-open"][data-tid="gc2026"]'); await wait(1200);
  const sent3 = await newTrip('Test Third Trip', '2027-05-14', '2027-05-20', id2);   // ten days after the second
  const id3 = await page.evaluate(() => TRIP.id), third = of(id3);
  ok(sent3.some(j => j.action === 'checklist'), 'the app asks the Sheet for that trip\'s checklist');
  ok(third.length === 5 && (third.find(r => r.text === 'Buy travel insurance') || {}).due === '2027-04-18', 'copied from the second trip, dates moved ten days more');

  console.log('\n4. an empty trip stays empty; and with no connection');
  await newTrip('Test Empty Trip', '2027-07-01', '2027-07-05', '');
  const id4 = await page.evaluate(() => TRIP.id);
  ok(of(id4).length === 0 && await page.evaluate(() => packing.items.length) === 0, '"An empty trip" copies nothing');
  let offline = false;
  await page.ctx.route('**/macros/s/**', route => offline ? route.abort('internetdisconnected') : route.fallback());
  offline = true;
  await newTrip('Test Offline Trip', '2027-08-01', '2027-08-05', id2);
  ok(/couldn’t be read without a connection/.test(await page.textContent('#toast')) && await page.evaluate(() => TRIP.name) === 'Test Offline Trip', 'from a trip that isn\'t open, with no connection: created, and it says the checklist couldn\'t be read');
  offline = false;
  ok(!page.errs.length, 'no JS errors ' + page.errs.join('; '));
});
