/* Photos from Wikipedia: the right article (coordinates must agree), the
   larger size when there is one, saved for offline use, kept through a sync,
   and set or turned off by hand. Wikipedia is a stand-in here. */
const { suite, trip, ROOT } = require('./lib');
const fs = require('fs'), path = require('path');
const PNG=fs.readFileSync(path.join(ROOT,'icons/icon-32.png'));
const U='https://upload.wikimedia.org/wikipedia/commons/thumb/';
const WIKI={
  'en/Test_Peak': {type:'standard',coordinates:{lat:22.2759,lon:114.1455},thumbnail:{source:U+'a/ab/Peak.jpg/320px-Peak.jpg'},originalimage:{width:3000}},
  'en/Test_Night_Market': {type:'standard',coordinates:{lat:40.7,lon:-74.0},thumbnail:{source:U+'b/bc/Wrong.jpg/320px-Wrong.jpg'},originalimage:{width:3000}},
  'zh/測試夜市': {type:'standard',coordinates:{lat:22.3065,lon:114.1702},thumbnail:{source:U+'c/cd/Temple.jpg/300px-Temple.jpg'},originalimage:{width:300}},
  'en/Test_West_Town': {type:'disambiguation',thumbnail:{source:U+'d/de/K.jpg/320px-K.jpg'}},
  'en/Test_Cable_Car': {type:'standard',coordinates:{lat:22.2895,lon:113.9410},thumbnail:{source:U+'e/ef/NP.jpg/320px-NP.jpg'},originalimage:{width:2000}},
};
const asked=[];

suite({}, async (env) => {
  const { ok, wait } = env;
  const T = trip();
  const page = await env.phone({ static: () => T, tz: 'Australia/Sydney', clock: '2026-10-03T20:28:00+10:00', connect: false });
  await page.ctx.route(/https:\/\/(en|zh)\.wikipedia\.org\/api\/rest_v1\/page\/summary\/.*/, r=>{
    const m=r.request().url().match(/https:\/\/(en|zh)\.wikipedia\.org\/api\/rest_v1\/page\/summary\/(.*)$/);
    const key=m[1]+'/'+decodeURIComponent(m[2]); asked.push(key);
    const j=WIKI[key];
    r.fulfill(j?{status:200,contentType:'application/json',headers:{'access-control-allow-origin':'*'},body:JSON.stringify(j)}
              :{status:404,headers:{'access-control-allow-origin':'*'},body:'{}'});
  });
  let offline=false;   // routed requests skip the browser's offline switch, so the stand-in honours it too
  await page.ctx.route('https://upload.wikimedia.org/**', r=>{
    if(offline) return r.abort('internetdisconnected');
    const u=r.request().url();
    if(/640px-NP\.jpg/.test(u)) return r.fulfill({status:404,headers:{'access-control-allow-origin':'*'},body:''});   // the larger size refused
    r.fulfill({status:200,contentType:'image/png',headers:{'access-control-allow-origin':'*'},body:PNG});
  });
  await page.fill('#g_url','https://script.google.com/macros/s/X/exec'); await page.fill('#g_key','k');
  await page.click('#gateBtn'); await wait(900);
  await page.evaluate(()=>photoRun); await wait(200);

  console.log('\n1. finding photos');
  await page.evaluate(()=>findPhotos(true));
  const P=await page.evaluate(()=>({ peak:store.loc('fx-hk-peak').photo_url, temple:store.loc('fx-hk-market').photo_url,
    kt:store.loc('fx-hk-town').photo_url||'', np:store.loc('fx-hk-cable').photo_url }));
  ok(/640px-Peak\.jpg$/.test(P.peak), 'right place, coordinates agree: larger size used — '+P.peak.split('/').pop());
  ok(/300px-Temple\.jpg$/.test(P.temple), 'English article 13,000 km away was rejected; Chinese Wikipedia used — '+P.temple.split('/').pop());
  ok(P.kt==='', 'disambiguation page skipped, nothing else found');
  ok(/320px-NP\.jpg$/.test(P.np), 'larger size refused, falls back to the lead image — '+P.np.split('/').pop());
  const cn=await page.evaluate(()=>[cleanName('Golden Noodle Shop(Jordan)'), cleanName('Test Pan-Fried Buns - Wan Chai'), cleanName('測試生煎包 (灣仔店)')]);
  ok(cn.join('|')==='Golden Noodle Shop|Test Pan-Fried Buns|測試生煎包', 'branch names are trimmed before asking: '+cn.join(' / '));
  const cached=await page.evaluate(()=>caches.open('gct-photos').then(c=>c.keys()).then(k=>k.map(r=>r.url.split('/').pop())));
  ok(cached.length===3 && cached.includes('640px-Peak.jpg') && !cached.includes('640px-NP.jpg'), 'saved for offline: '+cached.join(', '));
  const st=await page.evaluate(()=>photoStats());
  ok(st.n===3, 'stats: '+st.n+' of '+st.of+' · '+st.mb+' MB');
  const n1=asked.length;
  await page.evaluate(()=>findPhotos(false));
  ok(asked.length===n1, 'a second run asks Wikipedia nothing (tried within 14 days)');

  console.log('\n2. showing them');
  await page.click('button.daychip[data-date="2026-10-19"]'); await wait(300);
  ok(await page.$('.stop[data-lid="fx-hk-cable"] .stop-photo')!==null, 'stop card shows its photo');
  ok(await page.$('.stop[data-lid="fx-hk-central"] .stop-photo')===null, 'no photo, no banner');
  const navTop=await page.$eval('.stop[data-lid="fx-hk-cable"] .stop-side', e=>getComputedStyle(e).top);
  ok(navTop==='144px', 'navigate button moves below the photo ('+navTop+')');
  await page.click('.stop[data-lid="fx-hk-cable"] .stop-photo'); await wait(400);
  ok(await page.$('#sheet .hero.has-photo')!==null, 'place page hero uses the photo');
  const cr=await page.$eval('#sheet .credit a', e=>e.href).catch(()=>'');
  ok(cr==='https://commons.wikimedia.org/wiki/File:NP.jpg', 'credit links the file page: '+cr);
  await page.evaluate(()=>closeSheet());
  await page.click('nav.tabs button[data-view="places"]'); await wait(200);
  ok(await page.$('#placeResults .thumb.photo')!==null, 'list thumbnails use photos');

  console.log('\n3. kept through sync; set by hand');
  await page.evaluate(()=>store.sync({quiet:true})); await wait(600);
  ok(/640px-Peak/.test(await page.evaluate(()=>store.loc('fx-hk-peak').photo_url)), 'a sync from the old backend keeps the photo');
  await page.evaluate(()=>locationForm('fx-hk-peak')); await wait(200);
  await page.fill('#f_photo_url','http://insecure.example/x.jpg'); await page.click('[data-act="save-location"]'); await wait(300);
  ok(/https/.test(await page.textContent('#toast')), 'non-https link refused: '+await page.textContent('#toast'));
  await page.fill('#f_photo_url','NONE'); await page.click('[data-act="save-location"]'); await wait(400);
  ok(await page.evaluate(()=>store.loc('fx-hk-peak').photo_url)==='none' && await page.evaluate(()=>photoOf(store.loc('fx-hk-peak')))==='', '"none" removes the photo');
  const n2=asked.length; await page.evaluate(()=>findPhotos(true));
  ok(!asked.slice(n2).includes('en/Test_Peak'), '…and stops it being looked up again');
  const sent=page.posted.filter(j=>j.action==='saveLocation' && j.payload && j.payload.id==='fx-hk-peak').pop();
  ok(sent && sent.payload.photo_url==='none' && sent.payload.name_en==='Test Peak', 'sent to the Sheet with the rest of the place');

  console.log('\n4. offline');
  await page.reload(); await wait(1200);
  await page.evaluate(()=>navigator.serviceWorker.ready); await page.reload(); await wait(800);
  const ctrl=await page.evaluate(()=>!!navigator.serviceWorker.controller);
  ok(ctrl, 'service worker controls the page');
  offline=true; await page.ctx.setOffline(true);
  await page.reload(); await wait(800);
  const loaded=await page.evaluate(()=>new Promise(res=>{ var i=new Image(); i.onload=()=>res(i.naturalWidth); i.onerror=()=>res(0);
    i.src=store.loc('fx-hk-cable').photo_url; }));
  ok(loaded>0, 'photo loads with no connection ('+loaded+'px)');
  const miss=await page.evaluate(()=>new Promise(res=>{ var i=new Image(); i.onload=()=>res('loaded'); i.onerror=()=>res('failed');
    i.src='https://upload.wikimedia.org/wikipedia/commons/thumb/z/zz/Never.jpg/320px-Never.jpg'; }));
  ok(miss==='failed', 'an unsaved photo just fails quietly offline');
  offline=false; await page.ctx.setOffline(false);
});
