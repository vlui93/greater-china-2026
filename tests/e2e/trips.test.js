/* More than one trip: the first trip unchanged, a new one with its own places, cities and fares, renaming a day, moving dates, an older backend, and deleting a trip. */
const { suite, trip, fixture, fixturePath, swCache } = require('./lib');
const fs = require('fs'), path = require('path');

suite({}, async (env) => {
  const { ok, wait, rows, tab } = env;
  // A day name kept in the Sheet's Days tab wins over the automatic one
  env.tab('Days').appendRow(['day-gc2026-20261020', 'gc2026', '2026-10-20', 'Test day trip']);
  const page = await env.phone({});

  const nLoc=await page.evaluate(()=>store.data.locations.length);

  console.log('\n1. the trip you have: nothing changes');
  ok(await page.evaluate(()=>TRIP.id==="gc2026" && DAYS.length===17 && store.supportsTrips), 'one trip, 17 days, backend knows trips');
  ok(await page.evaluate(()=>dayLabel("2026-10-20"))==="Test day trip", 'day names from the Days tab');
  ok(await page.evaluate(()=>bookingWhen({date:"2026-10-21",time:"09:15"})===Date.parse("2026-10-21T09:15:00+08:00")), 'booking times still read as UTC+8');
  ok(await page.evaluate(()=>bookingWhen({date:"2026-10-16",time:"10:00",tz:"Australia/Sydney"})===Date.parse("2026-10-16T10:00:00+11:00")), 'a booking in Sydney time reads as AEDT');
  ok(await page.evaluate(()=>ZH_SIMPLIFY && tripHasChina()), 'China trip: Simplified on');
  ok(await page.evaluate(()=>cityZh("Chengdu")==="成都" && mapAppFor("Chengdu")==="amap" && mapAppFor("Hong Kong")==="google"), 'city facts unchanged');
  await page.click('#btnSettings'); await wait(200);
  ok(await page.$('[data-act="trip-new"]')!==null && /Greater China/.test(await page.innerText('#sheetBody')), 'Settings lists the trip, with + New trip');
  ok(/Chengdu[\s\S]*Shanghai/.test(await page.innerText('#sheetBody')), 'Settings lists cities with their time zones');

  console.log('\n2. a new trip');
  await page.click('[data-act="trip-new"]'); await wait(200);
  await page.fill('#t_name','Test Japan'); await page.fill('#t_start','2027-04-01'); await page.fill('#t_end','2027-04-05');
  await page.fill('#t_tz','Asia/Tokyo');
  await page.click('[data-act="trip-save"]'); await wait(900);
  const jp=await page.evaluate(()=>({id:TRIP.id, name:TRIP.name, days:DAYS.length, locs:store.data.locations.length, view:ui.view, title:document.title}));
  ok(jp.name==="Test Japan" && jp.days===5 && jp.locs===0 && jp.title==="Test Japan", 'opened: 5 days, no places ('+JSON.stringify(jp)+')');
  ok(/Test Japan/.test(await page.innerText('.triphero')), 'hero shows the trip name');
  const tr=rows('Trips');
  ok(tr.length===2 && tr.some(t=>t.id==='gc2026' && String(t.is_default)==='1') && tr.some(t=>t.id===jp.id && t.tz==='Asia/Tokyo'), 'Sheet: Trips has the first trip (default) and the new one');
  ok(await page.evaluate(()=>!ZH_SIMPLIFY && !tripHasChina()), 'not a China trip: Chinese shown as written');

  console.log('\n3. a city with fares');
  await page.click('#btnSettings'); await wait(200); await page.click('[data-act="city-new"]'); await wait(200);
  await page.fill('#y_name','Kyoto'); await page.fill('#y_name_zh','京都'); await page.fill('#y_lat','35.0116'); await page.fill('#y_lng','135.7681');
  await page.dispatchEvent('#y_lng','change');
  await page.fill('#y_tz','Asia/Tokyo'); await page.fill('#y_currency','¥'); await page.fill('#y_flag','500'); await page.fill('#y_flag_km','1.1');
  await page.fill('#y_per_km','400'); await page.fill('#y_round','10'); await page.fill('#y_transit','subway');
  ok(await page.inputValue('#y_region')==='', 'region worked out from the centre: elsewhere');
  await page.click('[data-act="city-save"]'); await wait(500);
  const ky=rows('Cities').find(c=>c.name==='Kyoto');
  ok(ky && ky.tz==='Asia/Tokyo' && String(ky.flag)==='500' && ky.transit==='subway', 'Sheet: Cities has Kyoto with fares');
  ok(await page.evaluate(()=>mapAppFor("Kyoto")==="google" && cityOptions()[0]!=="Hong Kong" || cityOptions().indexOf("Kyoto")>=0), 'Kyoto offered in the place forms');

  console.log('\n4. places go into this trip');
  await page.evaluate(()=>{ homeMode="day"; ui.day="2027-04-01"; setView("today"); }); await wait(200);
  for(const p of [["Test Shrine","東寺","34.9806","135.7478"],["Test Market","錦市場","35.0050","135.7647"]]){
    await page.click('[data-act="quick-add"]'); await wait(200);
    await page.selectOption('#f_city','Kyoto');
    ok(await page.inputValue('#f_nav_app')==='google', p[0]+': map app google for Kyoto');
    await page.fill('#f_name_en',p[0]); await page.fill('#f_name_zh',p[1]); await page.fill('#f_lat',p[2]); await page.fill('#f_lng',p[3]);
    await page.click('[data-act="save-quick"]'); await wait(600);
  }
  const L=rows('Locations').filter(l=>/^Test (Shrine|Market)$/.test(l.name_en));
  const SC=rows('Schedule').filter(s=>L.some(l=>l.id===s.location_id));
  ok(L.length===2 && L.every(l=>l.trip_id===jp.id), 'Sheet: both places tagged with the trip');
  ok(SC.length===2 && SC.every(s=>s.trip_id===jp.id && s.date==='2027-04-01'), 'Sheet: both stops tagged, on day 1');
  const leg=await page.innerText('#stopList');
  ok(/subway, or taxi ≈ ¥\d+/.test(leg), 'leg uses Kyoto fares and its transit word: '+(leg.match(/\d+\.\d km[^\n]*/)||[''])[0]);
  ok(/東寺/.test(leg) && !/东寺/.test(leg), 'Chinese name shown as written');
  ok(await page.evaluate(()=>dayLabel("2027-04-01"))==="Kyoto", 'automatic day name from where the day is');

  console.log('\n5. rename a day, guide, packing');
  page.once('dialog',d=>d.accept('Arrive Kyoto')); await page.click('[data-act="rename-day"]'); await wait(500);
  ok(/Arrive Kyoto/.test(await page.innerText('#viewSub')), 'renamed in the app');
  ok(rows('Days').some(d=>d.trip_id===jp.id && d.date==='2027-04-01' && d.label==='Arrive Kyoto'), 'Sheet: Days row saved');
  await page.evaluate(()=>{ ui.prepTab="guide"; setView("prep"); }); await wait(200);
  const g=await page.innerText('#view-prep');
  ok(/offline maps/i.test(g) && !/Alipay/.test(g), 'general guide, not the China one');
  await page.evaluate(()=>{ packing.items.push({id:"my-jp1",kind:"pack",section:"Mine",text:"JR pass",done:"",order_index:1}); packing.persist(); });

  console.log('\n6. back to the first trip');
  await page.click('#btnSettings'); await wait(200); await page.click('[data-act="trip-open"][data-tid="gc2026"]'); await wait(500);
  const gc=await page.evaluate(()=>({id:TRIP.id, n:store.data.locations.length, kyoto:store.data.locations.some(l=>l.city==="Kyoto"), pk:packing.items.some(i=>i.id==="my-jp1"), simp:ZH_SIMPLIFY}));
  ok(gc.id==='gc2026' && gc.n===nLoc && !gc.kyoto, 'first trip: same '+nLoc+' places, none of Japan\'s');
  ok(!gc.pk && gc.simp, 'its own packing list, Simplified back on');
  await page.evaluate(()=>{ ui.prepTab="guide"; setView("prep"); }); await wait(200);
  ok(/Alipay/.test(await page.innerText('#view-prep')), 'China guide back');
  await page.reload(); await wait(800);
  ok(await page.evaluate(()=>TRIP.id==="gc2026" && store.raw.locations.some(l=>l.name_en==="Test Shrine")), 'after reload: still the first trip, Japan cached');
  await page.evaluate(()=>switchTrip(allTrips().filter(t=>t.name==="Test Japan")[0].id)); await wait(300);
  ok(await page.evaluate(()=>packing.items.some(i=>i.id==="my-jp1")), "Japan's packing list kept");

  console.log('\n7. move the dates, plan follows');
  await page.click('#btnSettings'); await wait(200); await page.click('[data-act="trip-edit"]'); await wait(200);
  await page.fill('#t_start','2027-04-03'); await page.fill('#t_end','2027-04-07');
  await page.click('[data-act="trip-save"]'); await wait(1200);
  const SC2=rows('Schedule').filter(s=>s.trip_id===jp.id), D2=rows('Days').filter(d=>d.trip_id===jp.id);
  ok(SC2.length===2 && SC2.every(s=>s.date==='2027-04-03'), 'Sheet: stops moved two days');
  ok(D2.length===1 && D2[0].date==='2027-04-03' && D2[0].label==='Arrive Kyoto', 'Sheet: day name moved with them');
  ok(await page.evaluate(()=>DAYS[0]==="2027-04-03" && dayLabel("2027-04-03")==="Arrive Kyoto"), 'app shows the moved plan');

  console.log('\n8. an older backend: trips kept on the phone, no new ones');
  await page.ctx.unroute('**/macros/s/**');
  await page.ctx.route('**/macros/s/**', async route=>{ const body=route.request().postData()||'{}';
    const j=JSON.parse(env.box.doPost({postData:{contents:body},parameter:{}})._t);
    if(j.data && j.data.locations){ delete j.data.trips; delete j.data.cities; delete j.data.days; }
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j)}); });
  await page.evaluate(()=>store.sync({quiet:true})); await wait(600);
  ok(await page.evaluate(()=>!store.supportsTrips && store.raw.trips.length===2 && cityInfo("Kyoto")!==null), 'trips and cities kept');
  await page.click('#btnSettings'); await wait(200);
  ok(await page.$('[data-act="trip-new"]')===null && /one-off update/.test(await page.innerText('#sheetBody')), 'no + New trip; says the script needs the update');
  await page.evaluate(()=>closeSheet());
  await page.ctx.unroute('**/macros/s/**');
  await page.ctx.route('**/macros/s/**', async route=>{ const body=route.request().postData()||'{}';
    route.fulfill({status:200,contentType:'application/json',body:env.box.doPost({postData:{contents:body},parameter:{}})._t}); });
  await page.evaluate(()=>store.sync({quiet:true})); await wait(600);

  console.log('\n9. delete the trip');
  await page.click('#btnSettings'); await wait(200); await page.click('[data-act="trip-edit"]'); await wait(200);
  page.once('dialog',d=>d.accept()); await page.click('[data-act="trip-delete"]'); await wait(900);
  ok(await page.evaluate(()=>TRIP.id==="gc2026" && allTrips().length===1 && !store.raw.locations.some(l=>l.name_en==="Test Shrine")), 'app: back on the first trip, Japan gone');
  ok(rows('Trips').length===1 && !rows('Locations').some(l=>l.trip_id===jp.id) && !rows('Schedule').some(s=>s.trip_id===jp.id) && !rows('Days').some(d=>d.trip_id===jp.id), 'Sheet: its rows removed');
  ok(rows('Locations').length===nLoc, 'Sheet: the first trip\'s '+nLoc+' places untouched');
  await page.click('#btnSettings'); await wait(200); await page.click('[data-act="trip-edit"]'); await wait(200);
  ok(await page.$('#sheetBody [data-act="trip-delete"]')===null && await page.$('#t_name')!==null, 'the first trip has no delete button');
});
