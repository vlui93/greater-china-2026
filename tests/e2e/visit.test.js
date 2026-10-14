/* Ticking places off, opening on today, leave-by times for departures, and
   map links: name searches, precise pins, a saved share link. */
const { suite } = require('./lib');

suite({}, async (env) => {
  const { ok, wait, rows, tab } = env;
  const page = await env.phone({ clock: '2026-10-18T09:00:00+08:00', clockMode: 'install' });

  console.log('\n1. opens on today');
  await page.evaluate(()=>{ ui.day="2026-10-25"; save(LS.ui, ui); });
  await page.reload(); await wait(900);
  ok(await page.evaluate(()=>ui.day)==='2026-10-18' && await page.evaluate(()=>homeMode)==='day', 'reopened on 18 Oct: Day 3, not the day looked at last');
  ok(/Today/.test(await page.textContent('#viewTitle')) && await page.$('.daychip[aria-current="true"][data-date="2026-10-18"]')!==null, 'title Today, Day 3 chip on');
  await page.evaluate(()=>{ ui.day="2026-10-20"; save(LS.ui,ui); render(); });
  await page.clock.setSystemTime(new Date('2026-10-19T08:00:00+08:00'));
  await page.evaluate(()=>{ Object.defineProperty(document,'hidden',{configurable:true,get:()=>false}); document.dispatchEvent(new Event('visibilitychange')); }); await wait(200);
  ok(await page.evaluate(()=>ui.day)==='2026-10-19', 'left open overnight: moves to the new day on return');

  console.log('\n2. tick a stop off');
  const sid=await page.$eval('#stopList .stop', e=>e.dataset.lid);
  await page.click('#stopList .stop .visitbtn'); await wait(500);
  ok(await page.$eval('#stopList .stop', e=>e.classList.contains('been')), 'card dims');
  ok(/Been · 已去/.test(await page.textContent('#stopList .stop .stop-meta')), 'Been pill');
  await page.evaluate(()=>document.querySelector('nav.tabs').style.display='none'); await page.$eval('#stopList',e=>e.scrollIntoView()); await page.screenshot({path:env.out('stops.png')});
  ok((rows('Locations').find(l=>l.id===sid)||{}).visited==='2026-10-19', 'Sheet has the tick: '+(rows('Locations').find(l=>l.id===sid)||{}).visited);
  await page.evaluate(()=>setView("places")); await wait(300);
  ok(await page.$('.locrow.been')!==null && await page.$('.locrow.been .visitbtn[aria-pressed="true"]')!==null, 'shown in Places');
  const n0=await page.$$eval('#placeResults .locrow', e=>e.length);
  await page.click('[data-act="hide-visited"]'); await wait(200);
  ok(await page.$$eval('#placeResults .locrow', e=>e.length)===n0-1, 'Hide visited leaves it out');
  await page.click('[data-act="hide-visited"]'); await wait(200);
  ok(await page.evaluate(id=>pinColor(store.loc(id))===VISITED_COLOR, sid), 'grey pin');
  await page.evaluate(id=>locationDetail(id), sid); await wait(300);
  ok(/Been here/.test(await page.textContent('#sheetBody [data-act="visit"]')), 'detail says Been here');
  await page.click('#sheetBody [data-act="visit"]'); await wait(500);
  ok(/Mark as visited/.test(await page.textContent('#sheetBody [data-act="visit"]')), 'untick from the detail');
  ok((rows('Locations').find(l=>l.id===sid)||{}).visited==='no', 'untick reaches the Sheet as "no"');
  await page.evaluate(()=>closeSheet());
  // a sync with the Sheet blank keeps a tick made on the phone (old backend)
  await page.evaluate(id=>{ store.loc(id).visited="2026-10-19"; store.persist(); }, sid);
  tab('Locations').d.forEach((r,i)=>{ if(i && r[0]===sid){ const h=tab('Locations').d[0]; r[h.indexOf('visited')]=''; } });
  await page.evaluate(()=>store.sync({quiet:true})); await wait(600);
  ok(await page.evaluate(id=>isVisited(store.loc(id)), sid), 'a tick on the phone survives a sync from a blank column');

  console.log('\n3. route as a timeline');
  await page.evaluate(()=>{ homeMode="trip"; setView("today"); }); await wait(300);
  const rects=await page.$$eval('.route li', ls=>ls.map(l=>{ const r=l.getBoundingClientRect(); return [r.top,r.bottom,r.left,r.right]; }));
  const card=await page.$eval('.route', e=>{ const r=e.getBoundingClientRect(); return [r.left,r.right]; });
  ok(rects.length>=3 && rects.every((r,i)=>!i || r[0]>=rects[i-1][1]-0.5), rects.length+' stays, one under the other, no overlap');
  ok(rects.every(r=>r[2]>=card[0] && r[3]<=card[1]+0.5), 'all inside the card');
  ok(await page.$$eval('.route li .sub2', e=>e.some(x=>/night/.test(x.textContent) && /Oct/.test(x.textContent))), 'dates shown with nights');
  await page.evaluate(()=>document.querySelector('nav.tabs').style.display='none'); await page.$eval('.route',e=>e.scrollIntoView()); await page.$('.route').then(e=>e.screenshot({path:env.out('route.png')}));

  console.log('\n4. departures: leave by, from last night\'s hotel');
  const p21=await page.evaluate(()=>{ const b=store.data.bookings.find(x=>x.id==="fx-bk-03"); const d=depPlan(b,"2026-10-21",store.dayStops("2026-10-21"));
    return { o:d.origin.id, ride:d.ride, leave:fmtHM(d.leave,d.tz), by:fmtHM(d.atBy,d.tz), st:!!bkFromInfo(b).station }; });
  ok(p21.o==='fx-hk-hotel' && p21.st && p21.by==='08:15' && p21.ride<=20, 'HK → Guangzhou train: from the hotel to West Kowloon '+JSON.stringify(p21));
  const p24=await page.evaluate(()=>{ const b=store.data.bookings.find(x=>x.id==="fx-bk-04"); const d=depPlan(b,"2026-10-25",store.dayStops("2026-10-25")); return d.origin.id; });
  ok(p24==='fx-gz-hotel', 'moving day: leaves from last night\'s hotel, not the next one ('+p24+')');
  const p20=await page.evaluate(()=>{ const b=store.data.bookings.find(x=>x.id==="fx-bk-02"); return !!bkFromInfo(b).station; });
  ok(p20, 'ferry "from Sheung Wan" times the ride to the ferry terminal');
  await page.evaluate(()=>{ homeMode="day"; ui.day="2026-10-21"; setView("today"); }); await wait(300);
  const brief=await page.textContent('#view-today .brief');
  ok(/Leave/.test(brief) && /from Test Harbour/.test(brief) && /08:15/.test(brief), 'briefing: '+brief.replace(/\s+/g,' ').slice(0,200));
  await page.evaluate(()=>{ ui.day="2026-10-31"; render(); }); await wait(300);
  ok(await page.$('.travel.dep.tonight')!==null && /tonight/.test(await page.textContent('.travel.dep.tonight')), 'the 00:50 flight shows on the evening before, as tonight');
  ok(/from Test Bamboo/.test(await page.textContent('#view-today .brief')), 'with a leave line from the hotel');
  await page.clock.setSystemTime(new Date('2026-10-20T17:00:00+08:00'));
  await page.evaluate(()=>{ ui.day="2026-10-20"; render(); }); await wait(300);
  ok(/Leave/.test(await page.textContent('.brief.tomorrow')), 'Tomorrow card carries the leave time');

  console.log('\n5. + Add time');
  await page.evaluate(()=>{ homeMode="trip"; setView("today"); }); await wait(300);
  const tile=await page.$('.tk .linkbtn[data-act="bk-edit"]');
  ok(tile!==null, 'a ticket with no time offers + Add time');
  await tile.click(); await wait(300);
  ok(await page.isVisible('#b_time'), 'opens the booking with its time field');
  await page.evaluate(()=>closeSheet());

  console.log('\n6. map links');
  const u=await page.evaluate(()=>{
    const a=navUrls({name_en:"(FAR) Test Bakery",name_zh:"",city:"Hong Kong",nav_app:"google"});
    const c=navUrls({name_en:"Test Mall",name_zh:"TESTMALL 晚上",city:"Chengdu",nav_app:"amap",lat:"",lng:""});
    const r=navUrls({name_en:"X",name_zh:"测试",city:"Guangzhou",nav_app:"amap",lat:"23.11",lng:"113.26"});
    const p=navUrls({name_en:"X",name_zh:"测试",city:"Guangzhou",nav_app:"amap",lat:"23.105432",lng:"113.248765"});
    return [a.web,c.web,r.web,p.web,c.scheme,r.scheme,p.scheme]; });
  ok(/query=Test%20Bakery/.test(u[0]), 'remark left out of the search: '+u[0]);
  ok(/keyword=TESTMALL&city=%E6%88%90%E9%83%BD/.test(u[1]), 'TESTMALL 晚上 → TESTMALL in 成都: '+u[1]);
  ok(/\/search\?keyword=/.test(u[2]) && /\/navigation\?to=113.248765,23.105432,/.test(u[3]), 'rough pin searched by name, precise pin navigated to');
  ok(/^iosamap:\/\/poi\?sourceApplication=TripCompanion&name=TESTMALL&lat1=31\.0100&lon1=103\.6700&lat2=30\.3100&lon2=104\.4700&dev=1$/.test(u[4]), 'Amap app search uses name=, boxed to the city: '+u[4]);
  ok(/^iosamap:\/\/poi\?.*name=%E6%B5%8B%E8%AF%95/.test(u[5]) && !/keywords=/.test(u[5]), 'rough pin: Amap app searches by name');
  ok(/^iosamap:\/\/path\?sourceApplication=TripCompanion&dlat=23\.105432&dlon=113\.248765&dname=%E6%B5%8B%E8%AF%95&dev=1&t=0$/.test(u[6]), 'precise pin: Amap app opens the route to it: '+u[6]);
  console.log('\n7. set the pin of an existing place from a map link');
  const kt=await page.evaluate(()=>{ const l=store.loc("fx-hk-town"); l.name_en="(Optional) (closer to Day 2 places) Test West Town"; return l && {id:l.id, en:l.name_en, zh:l.name_zh, type:l.type, city:l.city}; });
  await page.evaluate(id=>locationForm(id), kt.id); await wait(300);
  ok(await page.isVisible('#f_link'), 'Edit this place has the map-link box');
  await page.fill('#f_link','https://www.google.com/maps/place/Somewhere+Else/@22.281234,114.128765,17z');
  await page.click('[data-act="link-fill"]'); await wait(300);
  ok(await page.inputValue('#f_lat')==='22.281234' && await page.inputValue('#f_name_en')===kt.en, 'pin filled, the name with its note kept: '+await page.inputValue('#f_name_en'));
  ok(!/Already on your list/.test(await page.textContent('#f_link_status')), 'not flagged as a duplicate of itself');
  await page.click('[data-act="save-location"]'); await wait(600);
  const kr=rows('Locations').find(l=>l.id===kt.id);
  ok(String(kr.lat)==='22.281234' && String(kr.lng)==='114.128765' && kr.name_en===kt.en && kr.type===kt.type && kr.city===kt.city, 'saved to the Sheet: new pin, same name, type and city');
  ok(await page.evaluate(id=>{ const a=store.loc(id), b=store.loc("fx-hk-peak"); return !!legText(a,b); }, kt.id), 'travel times work from the new pin');
  console.log('\n8. a saved map link');
  await page.evaluate(()=>{ closeSheet(); }); 
  await page.evaluate(()=>locationForm("fx-gz-isle")); await wait(300);
  ok(await page.isVisible('#f_map_url'), 'Edit this place has a Map link field');
  await page.fill('#f_link','【高德地图】测试岛\nhttps://surl.amap.com/T3st'); await page.click('[data-act="link-fill"]'); await wait(800);
  ok(await page.inputValue('#f_map_url')==='https://surl.amap.com/T3st', 'pasting a share link fills the Map link');
  await page.click('[data-act="save-location"]'); await wait(600);
  ok((rows('Locations').find(l=>l.id==='fx-gz-isle')||{}).map_url==='https://surl.amap.com/T3st', 'saved to the Sheet');
  await page.evaluate(()=>{ window.__opened=[]; window.open=function(u){ window.__opened.push(u); return {}; }; });
  await page.evaluate(()=>openMaps(store.loc("fx-gz-isle"))); await wait(100);
  ok((await page.evaluate(()=>window.__opened))[0]==='https://surl.amap.com/T3st', 'Navigate opens the saved link as it is');
  await page.evaluate(()=>locationDetail("fx-gz-isle")); await wait(300);
  ok(/Open in Amap .* your link/.test(await page.textContent('#sheetBody .navrow')), 'detail button says it opens your link');
  await page.evaluate(()=>locationForm("fx-gz-isle")); await wait(300);
  await page.fill('#f_map_url','https://example.com/x'); await page.click('[data-act="save-location"]'); await wait(300);
  ok(await page.isVisible('#f_map_url'), 'a non-map link is refused');
  await page.evaluate(()=>{ closeSheet(); ui.q=""; setView("places"); }); await wait(300);
  const all=await page.$$eval('#placeResults .locrow', e=>e.length);
  await page.click('[data-act="no-link"]'); await wait(200);
  const nl=await page.$$eval('#placeResults .locrow', e=>e.length), withLink=await page.evaluate(()=>store.data.locations.filter(mapLinkOf).length); ok(nl===all-withLink && withLink>=1, '"No map link" lists only the places still missing one ('+all+' → '+nl+', '+withLink+' with links)');
  await page.click('[data-act="no-link"]'); await wait(200);
});
