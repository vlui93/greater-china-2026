/* Reading a pasted confirmation into a booking, editing and deleting bookings, the calendar file, the printable itinerary, packing templates and a second trip's places library. */
const { suite, trip, fixture, fixturePath, swCache } = require('./lib');
const fs = require('fs'), path = require('path');

suite({}, async (env) => {
  const { ok, wait, rows, tab } = env;
  const T = trip();
  const page = await env.phone({});
  const zlib=require('zlib');

  console.log('\n1. reading a pasted confirmation');
  const P=t=>page.evaluate(x=>parseBookingText(x), t);
  let o=await P("Your booking is confirmed\nBooking reference: X7K2QP\nFlight TA110\nMelbourne (MEL) → Singapore (SIN)\nDeparture: Mon 9 Nov 2026, 09:15\nArrival: 14:40\nPassenger: MR TEST PERSON");
  ok(o.type==='flight' && o.date==='2026-11-09' && o.time==='09:15' && o.description==='MEL → SIN — TA110' && o.confirmation_no==='X7K2QP' && o.number==='TA110' && o.from_place==='MEL' && o.to_place==='SIN' && o.arr_time==='14:40', 'flight: '+JSON.stringify(o));
  ok(!/TEST PERSON/.test(JSON.stringify(o)), 'passenger names not copied');
  o=await P("Train ticket booked\nOrder No.: 1234567890\nG1234 Shenzhen North → Xiamen North\nDate: 12 Nov 2026\nDeparture 08:12  Arrival 14:05\nCoach 05, Seat 12F");   // qa-allow: invented order number
  ok(o.type==='train' && o.date==='2026-11-12' && o.time==='08:12' && o.description==='Shenzhen North → Xiamen North — G1234' && o.confirmation_no==='1234567890' && /Coach 05, seat 12F/.test(o.details) && o.arr_time==='14:05' && o.number==='G1234' && o.from_place==='Shenzhen North', 'train: '+JSON.stringify(o));   // qa-allow: invented order number
  o=await P("Booking confirmation\nConfirmation number: 4123.567.890\nTest Harbour Hotel\nCheck-in: Saturday, 17 October 2026 (from 15:00)\nCheck-out: Wednesday, 21 October 2026 (until 11:00)\n4 nights, 1 room\nThanks, Test Person");
  ok(o.type==='hotel' && o.date==='2026-10-17' && o.description==='Test Harbour Hotel — 4 nights' && o.confirmation_no==='4123.567.890' && o.arr_date==='2026-10-21' && o.time==='15:00' && o.arr_time==='11:00', 'hotel: '+JSON.stringify(o));
  o=await P("订单号：E123456789\n2026年11月14日 08:30开\n厦门北站—福州南站 G8501次 03车12A号");
  ok(o.type==='train' && o.date==='2026-11-14' && o.time==='08:30' && o.description==='厦门北站 → 福州南站 — G8501' && o.confirmation_no==='E123456789' && o.number==='G8501', 'Chinese train: '+JSON.stringify(o));
  o=await P("SeaTest ferry\nBooking no. TJ88812\nHong Kong → Macau\nDeparture: 3 Nov, 9:30am");
  ok(o.type==='ferry' && o.date==='2026-11-03' && o.time==='09:30' && o.description==='Hong Kong → Macau' && o.confirmation_no==='TJ88812', 'ferry, no year, am/pm: '+JSON.stringify(o));
  o=await P("Flight QF127 departs 05/10/2026 at 2:05 pm");
  ok(o.date==='2026-10-05' && o.time==='14:05', 'day-first dates, pm times: '+o.date+' '+o.time);

  console.log('\n2. add, edit and delete a booking');
  await page.evaluate(()=>setView("bookings")); await wait(200);
  await page.click('#view-bookings [data-act="bk-new"]'); await wait(200);
  await page.fill('#b_paste', "Your booking is confirmed\nBooking reference: X7K2QP\nFlight TA110\nMelbourne (MEL) → Singapore (SIN)\nDeparture: Mon 9 Nov 2026, 09:15\nArrival: 14:40");
  await page.click('[data-act="bk-read"]'); await wait(200);
  ok(/Filled in: type, number, route, date, time, arrival, what it is, reference/.test(await page.innerText('#b_paste_status')), 'says what it filled: '+await page.innerText('#b_paste_status'));
  ok(await page.getAttribute('#b_tz','placeholder')==='Australia/Melbourne' && await page.getAttribute('#b_arr_tz','placeholder')==='Asia/Singapore', 'time zones worked out from MEL and SIN');
  await page.click('#sheetBody details summary'); await page.fill('#b_tz','Australia/Melbourne');
  await page.click('[data-act="bk-save"]'); await wait(600);
  let bk=rows('Bookings').find(b=>b.description==='MEL → SIN — TA110');
  ok(bk && bk.confirmation_no==='X7K2QP' && bk.type==='flight' && bk.time==='09:15' && bk.tz==='Australia/Melbourne' && bk.number==='TA110' && bk.arr_time==='14:40' && bk.arr_date==='2026-11-09', 'saved to the Sheet, with the arrival');
  ok(/Melbourne time/i.test(await page.innerText('#view-bookings')), 'shown in Melbourne time');
  await page.click(`.bk[data-bid="${bk.id}"] [data-act="bk"]`); await page.click(`[data-act="bk-edit"][data-bid="${bk.id}"]`); await wait(200);
  ok(await page.$('#b_paste')===null && await page.inputValue('#b_description')==='MEL → SIN — TA110', 'Edit opens it filled in');
  await page.fill('#b_time','10:05'); await page.check('#b_tobook');
  await page.click('[data-act="bk-save"]'); await wait(500);
  bk=rows('Bookings').find(b=>b.id===bk.id);
  ok(bk.time==='10:05' && /^TO BOOK\./.test(bk.details), 'edited: new time, marked TO BOOK');
  await page.click(`.bk[data-bid="${bk.id}"] [data-act="bk"]`); await page.click(`[data-act="bk-edit"][data-bid="${bk.id}"]`); await wait(200);
  page.once('dialog',d=>d.accept()); await page.click('[data-act="bk-delete"]'); await wait(500);
  ok(!rows('Bookings').some(b=>b.id===bk.id) && !await page.evaluate(id=>store.data.bookings.some(b=>b.id===id), bk.id), 'deleted, here and in the Sheet');

  console.log('\n3. calendar file');
  const ics=await page.evaluate(()=>buildIcs({days:true,stops:true,bookings:true}));
  const ev=ics.text.split('BEGIN:VEVENT').length-1;
  ok(ev===ics.n && ev>40, ics.n+' events');
  ok(/\r\n/.test(ics.text) && !/[^\r]\n/.test(ics.text), 'CRLF line endings');
  ok(ics.text.split('\r\n').every(l=>Buffer.byteLength(l,'utf8')<=75), 'every line folded to 75 bytes, Chinese included');
  const s1=await page.evaluate(()=>{ const s=store.dayStops("2026-10-17").find(x=>/^\d\d:\d\d/.test(x.planned_time||"")); return s?{id:s.id,t:s.planned_time}:null; });
  const unf=ics.text.replace(/\r\n /g,'');
  const m1=unf.match(new RegExp('UID:stop-'+s1.id+'@trip-companion\\r\\nDTSTAMP:\\d+T\\d+Z\\r\\nDTSTART:(\\d{8}T\\d{6}Z)'));
  const want='20261017T'+String(+s1.t.slice(0,2)-8).padStart(2,'0')+s1.t.slice(3,5)+'00Z';
  ok(m1 && m1[1]===want, 'a Hong Kong stop at '+s1.t+' is '+want+' in UTC ('+(m1&&m1[1])+')');
  ok(/DTSTART;VALUE=DATE:20261017\r\nDTEND;VALUE=DATE:20261018\r\nSUMMARY:Day 2 · /.test(unf), 'all-day day summaries');
  ok(/SUMMARY:[^\r]*\\,/.test(unf) || /DESCRIPTION:[^\r]*\\[,;n]/.test(unf), 'commas and new lines escaped');
  await page.evaluate(()=>setView("days")); await wait(200);
  await page.click('[data-act="ics"]'); await wait(200);
  const [dl]=await Promise.all([page.waitForEvent('download'), page.click('[data-act="ics-go"][data-how="download"]')]);
  ok(/^Greater-China\.ics$/.test(dl.suggestedFilename()), 'downloads '+dl.suggestedFilename());
  await page.evaluate(()=>closeSheet());

  console.log('\n4. printable itinerary');
  await page.click('[data-act="print"]'); await wait(300);
  const pv=await page.innerText('#prPreview');
  ok(/Day 1 · Friday 16 Oct/.test(pv) && /Day 17/.test(pv), 'every day with something on it');
  ok(await page.$$eval('#prPreview .zh', e=>e.length)>40, 'Chinese names shown large');
  await page.evaluate(()=>{ window.print=function(){ window.__printed=true; }; });
  await page.click('[data-act="print-go"]'); await wait(200);
  await page.emulateMedia({media:'print'});
  const vis=await page.evaluate(()=>({app:getComputedStyle($("#app")).display, pv:getComputedStyle($("#printView")).display, printed:window.__printed, n:$("#printView").innerText.length}));
  ok(vis.app==='none' && vis.pv==='block' && vis.printed && vis.n>1000, 'on paper: only the itinerary '+JSON.stringify(vis));
  await page.emulateMedia({media:'screen'});
  ok(await page.evaluate(()=>getComputedStyle($("#printView")).display)==='none', 'hidden on screen');
  await page.evaluate(()=>closeSheet());

  console.log('\n5. packing templates');
  await page.evaluate(()=>{ packing.items.push({id:"my-gc1",kind:"pack",section:"Docs",text:"Passport (6+ months left)",done:"",order_index:1},{id:"my-gc2",kind:"pack",section:"Gear",text:"Umbrella",done:"1",order_index:2}); packing.persist(); ui.prepTab="packing"; setView("prep"); });
  await wait(200);
  await page.click('[data-act="pk-templates"]'); await wait(200);
  ok(/Essentials[\s\S]*11 new/.test(await page.innerText('#sheetBody')), 'starter shows what is new (passport already there)');
  await page.click('[data-act="pk-use"][data-src="st:st-essentials"]'); await wait(200);
  ok(await page.evaluate(()=>packing.items.filter(i=>!i.removed).length)===13 && await page.evaluate(()=>packing.items.filter(i=>i.done).length)===1, 'added 11, nothing ticked, existing tick kept');
  page.once('dialog',d=>d.accept('Standard')); await page.click('[data-act="pk-save-template"]'); await wait(200);

  console.log('\n6. a second trip: copy places and a packing list across');
  await page.click('#btnSettings'); await wait(200); await page.click('[data-act="trip-new"]'); await wait(200);
  await page.fill('#t_name','Test Trip'); await page.fill('#t_start','2027-03-01'); await page.fill('#t_end','2027-03-04'); await page.fill('#t_tz','Asia/Hong_Kong');
  await page.click('[data-act="trip-save"]'); await wait(800);
  await page.evaluate(()=>{ ui.prepTab="packing"; setView("prep"); }); await wait(200);
  await page.click('[data-act="pk-templates"]'); await wait(200);
  const tp=await page.innerText('#sheetBody');
  ok(/Standard[\s\S]*Yours · 13 items/.test(tp) && /Your list from Greater China/.test(tp), 'saved template and the other trip\'s list both offered');
  await page.click('[data-act="pk-use"][data-src^="trip:"]'); await wait(200);
  ok(await page.evaluate(()=>packing.items.length===13 && packing.items.every(i=>!i.done)), 'other trip\'s list copied, unticked');
  await page.evaluate(()=>setView("places")); await wait(200);
  await page.click('[data-act="library"]'); await wait(300);
  const nOther=await page.$$eval('#libResults .locrow', e=>e.length);
  ok(nOther===T.locations.length, 'library lists the other trip\'s '+T.locations.length+' places');
  await page.fill('#lq','Peak'); await wait(200);
  const pickName=await page.$eval('#libResults .locrow .en', e=>e.innerText);
  await page.click('#libResults [data-act="lib-copy"]'); await wait(500);
  ok(await page.$('#libResults .pill.ok')!==null, 'marked as copied');
  const cp=await page.evaluate(n=>store.data.locations.find(l=>l.name_en===n), pickName);
  const orig=await page.evaluate(n=>store.raw.locations.find(l=>l.name_en===n && !l.trip_id), pickName);
  ok(cp && cp.id!==orig.id && cp.trip_id===await page.evaluate(()=>TRIP.id) && cp.history_blurb===orig.history_blurb && cp.lat===orig.lat, 'copy is a new place in this trip, with the notes: '+pickName);
  ok(rows('Locations').some(l=>l.id===cp.id && l.trip_id===cp.trip_id), 'saved to the Sheet');
  await page.evaluate(()=>closeSheet()); await page.click('[data-act="library"]'); await wait(300); await page.fill('#lq','Peak'); await wait(200);
  ok(/Here/.test(await page.$eval('#libResults .locrow', e=>e.innerText)), 'shows as already here next time');
  await page.evaluate(()=>closeSheet());
});
