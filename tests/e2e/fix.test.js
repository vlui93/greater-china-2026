/* Reading map share links: English name from the share text and Chinese from the link, a plain message on an older backend, and an import that fills a place saved with no pin without ever moving an existing one. */
const { suite, trip, fixture, fixturePath, swCache } = require('./lib');
const fs = require('fs'), path = require('path');

suite({}, async (env) => {
  const { ok, wait, rows, tab } = env;
  const page = await env.phone({});

  console.log('\n1. Amap set to English: English name from the share text, Chinese from the link');
  for(const tagLine of ["【Amap】Test Garden Restaurant", "[Amap] Test Garden Restaurant"]){
    await page.evaluate(()=>closeSheet()); await page.click('button.daychip[data-date="2026-10-22"]'); await wait(150);
    await page.click('[data-act="quick-add"]'); await wait(250);
    await page.fill('#f_link', tagLine+"\nAddress: 1 Test Road, Yuexiu District\nhttps://surl.amap.com/T3st");
    await page.click('[data-act="link-fill"]'); await wait(900);
    const f=await page.evaluate(()=>({en:$("#f_name_en").value, zh:$("#f_name_zh").value, lat:$("#f_lat").value, st:$("#f_link_status").innerText, notes:$("#f_notes").value}));
    ok(f.en==="Test Garden Restaurant" && f.zh==="测试面馆" && +f.lat>23.1, tagLine.slice(0,7)+'… -> en "'+f.en+'", zh "'+f.zh+'", pin '+f.lat);
    ok(/Address: 1 Test Road/.test(f.notes) && !/Amap/.test(f.en), 'address kept, app tag stripped from the name');
  }
  await page.evaluate(()=>closeSheet());

  console.log('\n2. a bare Google short link, on the backend you have today');
  env.deploy('v1');
  await page.click('[data-act="quick-add"]'); await wait(250);
  await page.fill('#f_link', "https://maps.app.goo.gl/Zz9Yy8?g_st=ic");
  await page.click('[data-act="link-fill"]'); await wait(600);
  const g=await page.evaluate(()=>$("#f_link_status").innerText);
  console.log('       status: '+g);
  ok(/too old to read it/.test(g) && /type the Chinese name/.test(g) && !/Nothing usable/.test(g) && !/README/.test(g), 'plain explanation, no README reference');
  await page.evaluate(()=>closeSheet());
  env.deploy();

  console.log('\n3. the restaurant\'s notes file, on a place saved with no pin');
  const rid=await page.evaluate(()=>{ const l={ id:'loc-mtest0001', name_en:'Test Waterfall Restaurant', name_zh:'测试瀑布餐厅',
      city:'Guangzhou', type:'restaurant', lat:'', lng:'', nav_app:'amap', history_blurb:'', recommendations:'', dishes_to_order:'', souvenirs:'',
      notes:'Address: Test Hotel, No.368, Test East Road Building 1' };
    store.data.locations.push(l); store.persist(); return l.id; });
  await page.evaluate(()=>{ const l=store.loc('fx-gz-hall'); window.__pin=[l.lat,l.lng]; });
  await page.click('#btnSettings'); await wait(200);
  await page.setInputFiles('#importFile', fixturePath('restaurant-notes.json')); await wait(800);
  const w=await page.evaluate(()=>store.loc('loc-mtest0001'));
  ok(+w.lat===23.131234 && +w.lng===113.271234, 'empty pin filled');
  ok(w.history_blurb.startsWith('The Test Hotel opened') && /虾饺/.test(w.dishes_to_order) && /Test Line/.test(w.getting_there), 'background, dishes, getting there filled');
  ok(w.notes.startsWith('Address: Test Hotel, No.368') && /测试东路368号/.test(w.notes), 'your address note kept, Chinese address added under it');
  const sheetRow=(()=>{ const sh=env.SS.getSheetByName('Locations'), H=env.box.TABS.Locations; return ()=>{ const r=sh.d.find(r=>r[0]==='loc-mtest0001'); return r?Object.fromEntries(H.map((h,i)=>[h,r[i]])):null; }; })();
  await wait(800);
  const sr=sheetRow();
  ok(sr && +sr.lat===23.131234 && /虾饺/.test(sr.dishes_to_order), 'and it reached the Sheet (pin + details)');
  // a second file must never move an existing pin
  fs.writeFileSync(env.out('move-pin.json'), JSON.stringify({locations:[{id:'fx-gz-hall', lat:1, lng:2}]}));
  await page.click('#btnSettings'); await wait(200);
  await page.setInputFiles('#importFile', env.out('move-pin.json')); await wait(400);
  const cc=await page.evaluate(()=>{ const l=store.loc('fx-gz-hall'); return [l.lat,l.lng]; });
  ok(JSON.stringify(cc)===JSON.stringify(await page.evaluate(()=>window.__pin)), 'an existing pin is never moved by an import');
});
