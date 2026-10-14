/* Map links: GPS/GCJ-02 conversion, which side of the border a pin is on, every place landing in its own city, names, every link format, a short Amap link resolved by the backend, duplicate warnings, and an older backend. */
const { suite, trip, fixture, fixturePath, swCache } = require('./lib');
const fs = require('fs'), path = require('path');

suite({}, async (env) => {
  const { ok, wait, rows, tab } = env;
  const page = await env.phone({});

  console.log('\n1. coordinate conversion');
  const v=await page.evaluate(()=>{ const w=gcjToWgs(39.915,116.404); const g=wgsToGcj(w[0],w[1]); return {w,g}; });
  ok(Math.abs(v.w[0]-39.91359571849836)<2e-6 && Math.abs(v.w[1]-116.39775549316407)<2e-6,
     'matches the published reference: GCJ (39.915,116.404) -> WGS ('+v.w[0].toFixed(6)+', '+v.w[1].toFixed(6)+')');
  ok(Math.abs(v.g[0]-39.915)<1e-8 && Math.abs(v.g[1]-116.404)<1e-8, 'round trip back to GCJ within 1e-8°');

  console.log('\n2. which side of the border');
  const R=await page.evaluate(()=>[[22.28,114.16],[22.296,114.172],[22.289,113.941],[22.48,113.91],[22.545,114.115],
     [22.1936,113.539],[22.14,113.565],[22.13,113.52],[23.13,113.26]].map(p=>regionOf(p[0],p[1])));
  const want=["Hong Kong","Hong Kong","Hong Kong","mainland","mainland","Macau","Macau","mainland","mainland"];
  ok(JSON.stringify(R)===JSON.stringify(want), 'Central, TST, Tung Chung = HK; Shekou, Luohu = mainland; Senado, Cotai = Macau; Hengqin = mainland');
  if(JSON.stringify(R)!==JSON.stringify(want)) console.log('       got '+JSON.stringify(R));

  console.log('\n3. city detection over every place in the trip');
  const miss=await page.evaluate(()=>store.data.locations.filter(l=>cityFor(+l.lat,+l.lng)!==l.city).map(l=>l.id+':'+cityFor(+l.lat,+l.lng)+'≠'+l.city));
  ok(miss.length===0, miss.length ? 'mismatches: '+miss.join(', ') : 'every place lands in its own city');

  console.log('\n4. names');
  const N=await page.evaluate(()=>[splitNames("Golden Noodle 金面馆(中山路店)"),splitNames("金面馆"),splitNames("Test Peak"),splitNames("金面馆（旗舰店）Flagship")]);
  ok(N[0].zh==="金面馆(中山路店)" && N[0].en==="Golden Noodle", 'mixed: '+JSON.stringify(N[0]));
  ok(N[1].zh==="金面馆" && N[1].en==="" && N[2].zh==="" && N[2].en==="Test Peak", 'Chinese only / English only');
  ok(N[3].zh==="金面馆（旗舰店）" && N[3].en==="Flagship", 'full-width brackets kept: '+JSON.stringify(N[3]));

  console.log('\n5. link formats');
  const P=await page.evaluate(()=>{
    const t=s=>{ const p=parseMapText(s); return Object.assign({p}, {pl:placeFromParsed(p)}); };
    return {
      gfull: t("https://www.google.com/maps/place/Test+Peak/@22.2759,114.1455,15z/data=!4m6!3m5!1s0x34!8m2!3d22.2712!4d114.15!16s"),
      gmain: t("https://www.google.com/maps/place/Some+Temple/@23.12,113.24,17z/data=!3d23.1290!4d113.2450"),
      auri:  t("https://uri.amap.com/marker?position=113.2450,23.1290&name=%E9%87%91%E9%9D%A2%E9%A6%86"),
      ashare:t("【高德地图】金面馆\n地址：广东省广州市荔湾区中山七路34号\nhttps://surl.amap.com/T3st"),
      gshare:t("Golden Noodle\n34 Zhongshan 7th Rd, Liwan District, Guangzhou\nhttps://maps.app.goo.gl/Ab12"),
      plain: t("22.2712, 114.15"),
      junk:  t("see you there")
    };});
  ok(P.gfull.p.name==="Test Peak" && P.gfull.pl.lat===22.2712 && P.gfull.pl.lng===114.15 && P.gfull.pl.city==="Hong Kong" && P.gfull.pl.shiftedM===0,
     'Google full link, Hong Kong: pin from !3d!4d (not @), not shifted');
  ok(P.gmain.pl.city==="Guangzhou" && P.gmain.pl.shiftedM>300 && P.gmain.pl.shiftedM<700, 'Google full link, mainland: shifted '+P.gmain.pl.shiftedM+' m to GPS');
  ok(P.auri.pl.lat>23.12 && P.auri.pl.lat<23.14 && P.auri.pl.lng>113.23 && P.auri.pl.lng<113.25 && P.auri.p.name==="金面馆" && P.auri.pl.shiftedM>300,
     'Amap URI link: longitude-first read correctly, name decoded, shifted '+P.auri.pl.shiftedM+' m');
  ok(P.ashare.p.name==="金面馆" && /中山七路34号/.test(P.ashare.p.address) && P.ashare.p.source==="amap" && P.ashare.p.lat===null && isShort(P.ashare.p.url),
     'Amap share text: Chinese name + address read, short link left to resolve');
  function isShort(u){ return /surl\.amap\.com|maps\.app\.goo\.gl/.test(u); }
  ok(P.gshare.p.name==="Golden Noodle" && /Zhongshan/.test(P.gshare.p.address) && P.gshare.pl.type==="restaurant", 'Google share text: name, address, type guessed restaurant');
  ok(P.plain.pl.lat===22.2712 && P.plain.pl.shiftedM===0, 'bare coordinates taken as GPS, not shifted');
  ok(P.junk.p.url==="" && P.junk.p.lat===null, 'plain words do not produce a place');
  const M=await page.evaluate(()=>placeFromParsed(mergeResolved(parseMapText("https://surl.amap.com/T3st"),
    {final_url:"https://wb.amap.com/?p=B0TEST0001,23.105432,113.248765,%E6%B5%8B%E8%AF%95%E9%9D%A2%E9%A6%86,x",title:"测试面馆-高德地图",hints:[]})));
  ok(M.names.zh==="测试面馆" && M.city==="Guangzhou" && M.shiftedM>300, 'Amap wb ?p= format after a redirect: name + pin');

  console.log('\n6. end to end: day view "+ New place", short Amap link, NEW backend');
  await page.click('button.daychip[data-date="2026-10-22"]'); await wait(200);
  await page.click('[data-act="quick-add"]'); await wait(300);
  await page.fill('#f_link', "【高德地图】测试面馆\n地址：广东省广州市荔湾区测试路1号\nhttps://surl.amap.com/T3st");
  await page.click('[data-act="link-fill"]'); await wait(800);
  const f=await page.evaluate(()=>({zh:$("#f_name_zh").value,lat:$("#f_lat").value,lng:$("#f_lng").value,city:$("#f_city").value,nav:$("#f_nav_app").value,type:$("#f_type").value,notes:$("#f_notes").value,st:$("#f_link_status").innerText}));
  console.log('       status: '+f.st);
  ok(f.zh==="测试面馆" && f.city==="Guangzhou" && f.nav==="amap" && f.type==="restaurant", 'names, city, map app, type filled');
  ok(+f.lat>23.1 && +f.lat<23.11 && +f.lng>113.24 && +f.lng<113.25 && /Pin moved \d+ m/.test(f.st), 'pin resolved via backend and moved to GPS');
  ok(/Address: 广东省广州市荔湾区测试路1号/.test(f.notes), 'address saved into notes');
  await page.fill('#f_time','15:00'); await page.click('[data-act="save-quick"]'); await wait(700);
  const added=await page.evaluate(()=>{ const l=store.data.locations.filter(x=>x.name_zh==="测试面馆")[0];
    return { loc:l, stop: l && store.data.schedule.some(s=>s.location_id===l.id && s.date==="2026-10-22" && s.planned_time==="15:00") }; });
  ok(added.loc && added.stop, '"Add to Day 7" works — the bug that stopped quick-add saving is fixed');

  console.log('\n7. duplicate warning: a link to a place already on the list');
  const cc=await page.evaluate(()=>{ const l=store.loc('fx-gz-hall'); const g=wgsToGcj(+l.lat,+l.lng);
     return 'https://uri.amap.com/marker?position='+g[1].toFixed(6)+','+g[0].toFixed(6); });
  await page.click('[data-act="quick-add"]'); await wait(300);
  await page.fill('#f_link', cc); await page.click('[data-act="link-fill"]'); await wait(300);
  const dup=await page.evaluate(()=>$("#f_link_status").innerText);
  ok(/Already on your list/.test(dup), 'warns it is already on the list');
  await page.evaluate(()=>closeSheet());

  console.log('\n8. your CURRENT backend: short link');
  env.deploy('v1');
  await page.click('[data-act="quick-add"]'); await wait(300);
  await page.fill('#f_link', "【高德地图】测试面馆二\nhttps://surl.amap.com/T3st");
  await page.click('[data-act="link-fill"]'); await wait(600);
  const old=await page.evaluate(()=>({zh:$("#f_name_zh").value, st:$("#f_link_status").innerText, q:store.queue.length}));
  ok(old.zh==="测试面馆二" && /one-off update/.test(old.st) && old.q===0, 'Chinese name still filled; clear message; nothing queued');
  await page.screenshot({path:env.out('link-oldbackend.png')});
  await page.evaluate(()=>closeSheet());

  console.log('\n9. Locations tab "+ New place" has the box too; editing does not');
  await page.click('nav.tabs button[data-view="places"]'); await wait(200);
  await page.click('[data-act="new-location"]'); await wait(300);
  ok(!!(await page.$('#f_link')), 'new place form: link box present');
  await page.evaluate(()=>closeSheet()); await page.evaluate(()=>locationForm('fx-gz-hall')); await wait(200);
  ok(!!(await page.$('#f_link')) && !(await page.$('#f_find')), 'edit form: a link box to set the pin, no search box');
});
