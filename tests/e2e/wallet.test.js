/* Ticket links: the wallet on the overview, adding/refusing/changing/removing a
   link, links kept through a sync, on the day, on a place, and links from the
   Sheet (only https ones become links). */
const { suite, trip } = require('./lib');

suite({}, async (env) => {
  const { ok, wait } = env;
  const T = trip(), nTravel = T.bookings.filter(b => /flight|train|ferry/.test(b.type)).length;
  const phone = data => env.phone({ static: () => data, tz: 'Australia/Sydney', clock: '2026-10-03T20:28:00+10:00',
    context: { serviceWorkers: 'block' } });
  const A = await phone(T);

  console.log('\n1. the wallet on the overview');
  const cards = await A.$$eval('.wallet .tk:not(.addnew)', e => e.map(x => x.querySelector('.tk-t').textContent + ' | ' + x.querySelector('.tk-when').textContent));
  ok(cards.length === nTravel, nTravel + ' travel bookings, soonest first: ' + cards.map(c => c.split(' | ')[1]).join(', '));
  ok(new RegExp('0 of ' + nTravel + ' linked').test(await A.textContent('#view-today')), 'says none are linked yet');
  ok(await A.$$eval('.wallet .tk.missing', e => e.length) === nTravel, 'each shows + Add link');

  console.log('\n2. adding, refusing, changing, removing a link');
  A.answers.push('http://not-secure.example/t');
  await A.click('.wallet .tk:nth-child(3) [data-act="bk-ticket"]'); await wait(300);
  ok(/https/.test(await A.textContent('#toast')), 'http link refused');
  ok(!A.posted.some(j => j.action === 'saveBooking'), '…and nothing sent');
  A.answers.push('https://example.com/orders/hsr-123');
  await A.click('.wallet .tk:nth-child(3) [data-act="bk-ticket"]'); await wait(400);
  const sent = A.posted.filter(j => j.action === 'saveBooking').pop();
  ok(sent && JSON.stringify(sent.payload) === '{"id":"fx-bk-03","ticket_url":"https://example.com/orders/hsr-123"}', 'only the id and link go to the Sheet: ' + JSON.stringify(sent && sent.payload));
  const href = await A.$eval('.wallet .tk:nth-child(3) a.tk-go', e => e.getAttribute('href') + ' ' + e.target + ' ' + e.rel);
  ok(href === 'https://example.com/orders/hsr-123 _blank noopener', 'card now opens it: ' + href);
  ok(new RegExp('1 of ' + nTravel + ' linked').test(await A.textContent('#view-today')), 'count updates');

  await A.click('nav.tabs button[data-view="bookings"]'); await wait(200);
  ok(await A.$('.bk[data-bid="fx-bk-03"] .pill.ok') !== null, 'Bookings list marks it');
  await A.click('.bk[data-bid="fx-bk-03"] .bk-head'); await wait(150);
  ok(await A.$('.bk[data-bid="fx-bk-03"] .bk-acts a[href="https://example.com/orders/hsr-123"]') !== null, 'and opens it from the booking');
  ok(await A.$('.bk[data-bid="fx-bk-07"] .bk-acts [data-act="bk-ticket"]') !== null, 'hotels can take a link too');

  console.log('\n3. kept through a sync with a backend that has no ticket column');
  await A.evaluate(() => store.sync({ quiet: true })); await wait(600);
  ok(await A.evaluate(() => store.data.bookings.filter(b => b.id === 'fx-bk-03')[0].ticket_url) === 'https://example.com/orders/hsr-123', 'link survives');

  console.log('\n4. on the day');
  await A.click('nav.tabs button[data-view="today"]'); await wait(150);
  await A.click('button.daychip[data-date="2026-10-21"]'); await wait(250);
  ok(await A.$('.brief a.tklink[href="https://example.com/orders/hsr-123"]') !== null, 'day briefing links the train ticket');

  console.log('\n5. a ticket for a place');
  const pandaDay = T.schedule.filter(s => s.location_id === 'fx-cd-panda').map(s => s.date).sort()[0];
  await A.evaluate(() => locationForm('fx-cd-panda')); await wait(200);
  await A.fill('#f_ticket_url', 'ftp://nope'); await A.click('[data-act="save-location"]'); await wait(250);
  ok(/https/.test(await A.textContent('#toast')), 'non-https place link refused');
  await A.fill('#f_ticket_url', 'https://example.com/panda-entry'); await A.click('[data-act="save-location"]'); await wait(400);
  await A.evaluate(() => locationDetail('fx-cd-panda')); await wait(250);
  ok(await A.$('#sheet a.btn[href="https://example.com/panda-entry"]') !== null, 'place page has Open ticket');
  await A.evaluate(() => closeSheet());
  await A.click('.daychip.trip'); await wait(250);
  const pc = await A.$$eval('.wallet .tk:not(.addnew)', e => e.map(x => x.querySelector('.tk-t').textContent + '|' + x.querySelector('.tk-when').textContent));
  ok(pc.some(c => /Panda/.test(c) && c.includes(+pandaDay.slice(8) + ' Oct')), 'wallet lists it on its day: ' + pc.filter(c => /Panda/.test(c)));
  await A.click('button.daychip[data-date="' + pandaDay + '"]'); await wait(250);
  ok(await A.$('.brief a.tklink[href="https://example.com/panda-entry"]') !== null, 'and the day briefing links it');

  console.log('\n6. removing');
  await A.click('nav.tabs button[data-view="bookings"]'); await wait(150);
  await A.click('.bk[data-bid="fx-bk-03"] .bk-head'); await wait(150);
  A.answers.push('');
  await A.click('.bk[data-bid="fx-bk-03"] [data-act="bk-ticket"]'); await wait(400);
  ok(await A.evaluate(() => store.data.bookings.filter(b => b.id === 'fx-bk-03')[0].ticket_url) === '', 'blank removes the link');

  console.log('\n7. links from an upgraded backend reach every phone');
  const up = trip(); up.bookings.forEach(x => { if (x.id === 'fx-bk-04') x.ticket_url = 'https://example.com/flight-ta'; });
  const B = await phone(up);
  ok(await B.$('.wallet a.tk-go[href="https://example.com/flight-ta"]') !== null, 'a link saved on another phone shows here');
  const bad = trip(); bad.bookings[0].ticket_url = 'javascript:alert(1)';
  const C = await phone(bad);
  ok(await C.$('.wallet a[href^="javascript"]') === null && await C.$$eval('.wallet .tk.missing', e => e.length) === nTravel, 'a non-https link from the Sheet is never turned into a link');
});
