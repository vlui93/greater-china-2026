/* Travel on the day plan: a flight's departure and landing, bag drop, stops that clash with travel, a hotel's check-in and check-out, and the calendar and print using the arrival. */
const { suite, trip, fixture, fixturePath, swCache } = require('./lib');
const fs = require('fs'), path = require('path');

suite({}, async (env) => {
  const { ok, wait, rows, tab } = env;
  const page = await env.phone({});
  console.log('\n1. enter the flight: TA138 MEL 22:20 → HKG 04:40');
  await page.evaluate(()=>setView("bookings")); await wait(200);
  await page.click('.bk[data-bid="fx-bk-01"] [data-act="bk"]'); await page.click('#view-bookings [data-act="bk-edit"][data-bid="fx-bk-01"]'); await wait(200);
  ok(await page.isVisible('#b_number') && await page.isVisible('#b_arr_time') && await page.innerText('#b_arr_date_l')==='ARRIVES' || /arrives/i.test(await page.innerText('#b_arr_date_l')), 'flight form has number, route and arrival');
  await page.fill('#b_number','ta 138'); await page.fill('#b_from','MEL'); await page.fill('#b_to','HKG');
  await page.fill('#b_time','22:20'); await page.fill('#b_arr_time','04:40');
  await page.click('[data-act="bk-save"]'); await wait(600);
  const r=rows('Bookings').find(b=>b.id==='fx-bk-01');
  ok(r.number==='TA138' && r.from_place==='MEL' && r.to_place==='HKG' && r.time==='22:20' && r.arr_time==='04:40' && r.arr_date==='2026-10-17', 'saved: arrival worked out as the next day '+JSON.stringify([r.number,r.arr_date,r.arr_time]));
  ok(/22:20 → 04:40 \+1/.test(await page.innerText('.bk[data-bid="fx-bk-01"] .bk-when')) && /Melbourne time/i.test(await page.innerText('.bk[data-bid="fx-bk-01"] .bk-when')), 'list: '+await page.innerText('.bk[data-bid="fx-bk-01"] .bk-when'));
  ok(await page.evaluate(()=>{ const b=store.data.bookings.find(x=>x.id==="fx-bk-01"); return bookingWhen(b)===Date.parse("2026-10-16T22:20:00+11:00") && bkArrMs(b)===Date.parse("2026-10-17T04:40:00+08:00"); }), 'leaves 22:20 Melbourne time, lands 04:40 Hong Kong time');

  console.log('\n2. Day 1: when to leave for the airport');
  await page.evaluate(()=>{ homeMode="day"; ui.day="2026-10-16"; setView("today"); }); await wait(300);
  let dep=await page.innerText('.travel.dep');
  ok(/22:20/.test(dep) && /Be at the airport by 19:50/.test(dep) && /Lands 04:40 on Sat 17 Oct \(Hong Kong time\)/.test(dep), 'departure: '+dep.replace(/\n/g,' | '));

  console.log('\n3. Day 2: land, drop bags, out early');
  await page.evaluate(()=>{ ui.day="2026-10-17"; render(); }); await wait(300);
  const arr=await page.innerText('.travel.arr');
  ok(/04:40/.test(arr) && /Land · HKG/.test(arr), 'arrival card first: 04:40 Land · HKG');
  const drop=(arr.match(/drop your bags about (\d\d:\d\d)/)||[])[1];
  ok(drop && drop>='05:30' && drop<='06:30', 'bag drop about '+drop+' (~50 min through the airport, ~45 min in)');
  ok(/room is ready from 15:00/.test(arr), 'says when the room is ready, from the hotel booking');
  ok(/Free from about 0\d:\d\d until [^\n]+ at 14:00 — \d+ h/.test(arr), 'free hours until the first stop: '+(arr.match(/Free from[^\n]*/)||[''])[0]);
  ok(await page.evaluate(()=>{ const v=$("#view-today"); const a=v.querySelector('.travel.arr'), s=v.querySelector('#stopList'); return !!(a.compareDocumentPosition(s) & Node.DOCUMENT_POSITION_FOLLOWING); }), 'it sits before the stops');
  ok(/Land HKG/.test(await page.innerText('.brief')), 'the day briefing says so too');

  console.log('\n4. stops that clash with travel');
  await page.evaluate(()=>{ const l=store.data.locations.find(x=>x.city==="Hong Kong" && x.type==="attraction"); return Promise.all([addStop("2026-10-17", l.id, "04:00", ""), addStop("2026-10-17", l.id, "05:30", "")]); }); await page.evaluate(()=>render()); await wait(300);
  const pills=await page.$$eval('#stopList .pill.clash', e=>e.map(x=>x.innerText));
  ok(pills.some(p=>/before you land/i.test(p)) && pills.some(p=>/before you're free/i.test(p)), 'flagged: '+pills.join(', '));
  await page.evaluate(()=>{ const s=store.data.schedule.find(x=>x.date==="2026-10-17" && store.loc(x.location_id).type==="hotel"); s.planned_time="06:15"; render(); }); await wait(300);
  ok(await page.evaluate(()=>{ const s=store.data.schedule.find(x=>x.date==="2026-10-17" && store.loc(x.location_id).type==="hotel"); const c=document.querySelector('.stop[data-sid="'+s.id+'"]'); return c && !c.querySelector('.pill.clash'); }), 'the 06:15 bag-drop stop at the hotel is not flagged');
  await page.evaluate(()=>{ const b=store.data.bookings.find(x=>x.id==="fx-bk-04"); b.time="10:45"; b.arr_time="13:05"; b.from_place="CAN"; b.to_place="TFU"; b.number="TA330"; store.persist();
    const l=store.data.locations.find(x=>x.city==="Guangzhou" && x.type==="attraction"); return addStop("2026-10-25", l.id, "11:30", ""); });
  await page.evaluate(()=>{ ui.day="2026-10-25"; render(); }); await wait(300);
  ok(/After you leave for TA330/i.test(await page.innerText('#stopList')), 'a Guangzhou stop during the flight is flagged');
  const cards=await page.$$eval('#view-today .travel', e=>e.map(x=>x.className.replace('travel ','')+':'+x.querySelector('.tt').innerText.slice(0,5)));
  ok(cards.join()==='dep:10:45,arr:13:05', 'same-day flight: departure then arrival, in time order ('+cards.join()+')');

  console.log('\n5. calendar and print use the arrival');
  const ics=await page.evaluate(()=>buildIcs({days:false,stops:false,bookings:true}).text.replace(/\r\n /g,''));
  ok(/UID:bk-fx-bk-01@trip-companion\r\nDTSTAMP:\d+T\d+Z\r\nDTSTART:20261016T112000Z\r\nDTEND:20261016T204000Z/.test(ics), 'calendar: 22:20 Melbourne to 04:40 Hong Kong, in UTC');
  ok(/04:40<\/b> · Land · Melbourne \(MEL\) → Hong Kong \(HKG\)/.test(await page.evaluate(()=>printHTML(false))), 'print: the landing on Day 2');

  console.log('\n6. a hotel: check-in and check-out');
  await page.evaluate(()=>setView("bookings")); await wait(200);
  await page.click('.bk[data-bid="fx-bk-07"] [data-act="bk"]'); await page.click('#view-bookings [data-act="bk-edit"][data-bid="fx-bk-07"]'); await wait(200);
  ok(!await page.isVisible('#b_number') && !await page.isVisible('#b_from') && /check-in/i.test(await page.innerText('#b_date_l')) && /check-out/i.test(await page.innerText('#b_arr_date_l')), 'hotel form: check-in and check-out, no flight fields');
  await page.fill('#b_arr_date','2026-10-21'); await page.fill('#b_arr_time','11:00');
  await page.click('[data-act="bk-save"]'); await wait(500);
  ok(/in 15:00 · out Wed 21 Oct 11:00/i.test(await page.innerText('.bk[data-bid="fx-bk-07"] .bk-when')), 'list: '+await page.innerText('.bk[data-bid="fx-bk-07"] .bk-when'));

  console.log('\n7. an older backend keeps the new fields on the phone');
  await page.ctx.unroute('**/macros/s/**');
  await page.ctx.route('**/macros/s/**', async route=>{ const body=route.request().postData()||'{}';
    const j=JSON.parse(env.box.doPost({postData:{contents:body},parameter:{}})._t);
    if(j.data && j.data.bookings) j.data.bookings.forEach(b=>{ ['number','from_place','to_place','arr_date','arr_time','arr_tz'].forEach(k=>delete b[k]); });
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j)}); });
  await page.evaluate(()=>store.sync({quiet:true})); await wait(600);
  ok(await page.evaluate(()=>{ const b=store.data.bookings.find(x=>x.id==="fx-bk-01"); return b.number==="TA138" && b.arr_time==="04:40"; }), 'arrival and number survive a sync');
});
