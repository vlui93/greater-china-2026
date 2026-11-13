/* A phone used before it is connected: places and stops added on it wait in
   the queue, details imported by name are matched and queued, nothing tries
   the network, and connecting sends it all up without losing anything. */
const { suite, trip, fixturePath } = require('./lib');
const fs = require('fs');

suite({}, async (env) => {
  const { ok, wait } = env;
  const T = trip(), SS = env.SS, box = env.box;
  const sheetLoc=id=>{ const sh=SS.getSheetByName('Locations'); const H=box.TABS.Locations; const r=sh.d.find(r=>r[0]===id); return r?Object.fromEntries(H.map((h,i)=>[h,r[i]])):null; };
  const sheetSc=id=>SS.getSheetByName('Schedule').d.some(r=>r[0]===id);
  // A phone holding the trip, not connected; then two places and two stops are added on it.
  const mk=(id,en,zh,city,lat,lng)=>({id,name_en:en,name_zh:zh,city,type:'restaurant',lat,lng,nav_app:city==='Hong Kong'?'google':'amap',
    history_blurb:'',recommendations:'',dishes_to_order:'',souvenirs:'',notes:'Address: test'});
  const cache=trip(); cache.checklist=[];
  const added=[mk('loc-mg0abc12','Test Dessert','测试甜品','Hong Kong',22.2801,114.1720), mk('loc-mg0def34','','测试点心','Guangzhou',23.1181,113.2512)];
  const stops=[{id:'sc-mg0abc99',date:'2026-10-17',order_index:9,location_id:'loc-mg0abc12',planned_time:'16:00',notes:''},
               {id:'sc-mg0def88',date:'2026-10-22',order_index:9,location_id:'loc-mg0def34',planned_time:'12:00',notes:''}];
  let reachedBackend=0;
  const page = await env.phone({ connect: false, tz: 'Australia/Sydney',
    init: { fn: c => { if (!localStorage.getItem('gct.cache')) localStorage.setItem('gct.cache', c); }, arg: JSON.stringify(cache) },
    filter: (out) => { reachedBackend++; return out; } });
  await wait(200);
  await page.evaluate(async ([added, stops]) => {
    for (const l of added) await saveLocation(l);
    for (const st of stops) await store.write('saveScheduleEntry', st, () => { store.data.schedule.push(st); });
  }, [added, stops]); await wait(300);
  await page.evaluate(() => render());

  console.log('\n1. places and stops added before connecting');
  const q=await page.evaluate(()=>store.queue.map(j=>j.action+':'+j.payload.id));
  ok(q.length===4 && q.includes('saveLocation:loc-mg0abc12') && q.includes('saveScheduleEntry:sc-mg0def88'), 'the two places and two stops are queued: '+q.join(', '));
  ok(!q.some(x=>/:fx-/.test(x)), 'none of the trip\'s own places or stops were queued');
  ok(/Local only · 4 to upload/.test(await page.textContent('.syncbadge')), 'badge: "'+(await page.textContent('.syncbadge')).trim()+'"');
  await page.reload(); await wait(400);
  ok((await page.evaluate(()=>store.queue.length))===4, 'reopening the app keeps the four waiting, no more');

  console.log('\n2. importing details by name, still not connected');
  // edit the way the app does (Edit place -> Save), which goes through saveLocation
  await page.evaluate(()=>{ const l=JSON.parse(JSON.stringify(store.loc('loc-mg0def34'))); l.recommendations='My own note'; return saveLocation(l); });
  const notes={ kind:'greater-china-trip-notes', locations:[
    { name_zh:'测试点心', history_blurb:'A written background.', recommendations:'Should not replace mine', dishes_to_order:'虾饺 Har gow', getting_there:'Metro Line 1', tickets:'' },
    { name_en:'test dessert', history_blurb:'Another background.', souvenirs:'Egg rolls', getting_there:'MTR Exit A' } ] };
  fs.writeFileSync(env.out('by-name.json'), JSON.stringify(notes));
  await page.click('#btnSettings'); await wait(200);
  await page.setInputFiles('#importFile', env.out('by-name.json')); await wait(500);
  ok(/Updated 2 places/.test(await page.textContent('#toast')), 'toast: '+(await page.textContent('#toast')).trim());
  const L=await page.evaluate(()=>[store.loc('loc-mg0def34'), store.loc('loc-mg0abc12')]);
  ok(L[0].history_blurb==='A written background.' && L[0].dishes_to_order==='虾饺 Har gow' && L[0].getting_there==='Metro Line 1', 'matched by Chinese name; details filled');
  ok(L[0].recommendations==='My own note', 'your own text was not overwritten');
  ok(L[1].history_blurb==='Another background.' && L[1].souvenirs==='Egg rolls', 'matched by English name, case-insensitive');
  ok((await page.evaluate(()=>store.queue.length))===7, 'your edit and the details are queued (4 + 1 + 2)');
  ok(reachedBackend===0, 'nothing tried to reach the backend while not connected');

  console.log('\n3. adding another place while not connected');
  await page.click('button.daychip[data-date="2026-10-18"]'); await wait(200);
  await page.click('[data-act="quick-add"]'); await wait(300);
  await page.fill('#f_name_zh','测试小吃'); await page.fill('#f_lat','22.3301'); await page.fill('#f_lng','114.1622');
  await page.click('[data-act="save-quick"]'); await wait(500);
  ok((await page.evaluate(()=>store.queue.length))===9, 'place + stop queued (it used to be dropped)');

  console.log('\n4. the whole trip notes import waits to go up too');
  await page.click('#btnSettings'); await wait(200);
  await page.setInputFiles('#importFile', fixturePath('trip-notes.json')); await wait(600);
  const big=(await page.textContent('#toast')).trim(), nBig=+(big.match(/(\d+) places?\b/)||[0,0])[1];
  const qBig=await page.evaluate(()=>store.queue.slice(9).map(j=>j.action));
  ok(nBig>10 && qBig.length===nBig && qBig.every(a=>a==='saveLocation'), 'each of the '+nBig+' places it changed is queued for the Sheet ("'+big.slice(0,60)+'")');

  console.log('\n5. CONNECTING');
  const sentBefore=page.posted.length;
  await page.click('#btnSettings'); await wait(200);
  await page.fill('#s_url','https://script.google.com/macros/s/X/exec'); await page.fill('#s_key','k');
  await page.click('[data-act="save-cfg"]'); await wait(2500);
  ok((await page.evaluate(()=>store.queue.length))===0, 'queue emptied');
  const ups=page.posted.slice(sentBefore).filter(j=>j.action!=='all' && j.action!=='ping');
  // the first goes alone (the phone doesn't yet know what this backend can do); its reply says, and the rest go together
  ok(ups[0].action==='saveLocation' && ups[1].action==='batch' && ups[1].payload.jobs.length===8+nBig, 'in two requests: the first change, then the other '+(8+nBig)+' together');
  ok(ups.slice(2).every(j=>j.action==='batch' && j.payload.jobs.every(x=>x.action==='saveChecklistItem')), 'then the checklist the import brought, together as well');
  ok(sheetLoc('loc-mg0abc12') && sheetLoc('loc-mg0def34') && sheetSc('sc-mg0abc99') && sheetSc('sc-mg0def88'), 'both earlier places and their stops are in the Sheet');
  const s34=sheetLoc('loc-mg0def34');
  console.log('       sheet row: '+JSON.stringify({h:s34.history_blurb,r:s34.recommendations,d:s34.dishes_to_order}));
  ok(s34.history_blurb==='A written background.' && s34.recommendations==='My own note' && s34.dishes_to_order==='虾饺 Har gow', 'the imported details reached the Sheet, your note intact');
  ok(!!env.SS.getSheetByName('Locations').d.find(r=>r[2]==='测试小吃'), 'the place added unconnected is in the Sheet');
  const after=await page.evaluate(()=>({n:store.data.locations.length, a:!!store.loc('loc-mg0abc12'), d:!!store.loc('loc-mg0def34'),
     s:store.data.schedule.filter(e=>/^sc-mg0/.test(e.id)).length, gt:(store.loc('loc-mg0def34')||{}).getting_there}));
  ok(after.a && after.d && after.s===2, 'and they are still on the phone after the sync — nothing disappeared');
  ok(after.gt==='Metro Line 1' && s34.getting_there==='Metro Line 1', 'getting-there is on the phone and in the Sheet');
  ok(after.n===T.locations.length+3, 'place count: '+after.n+' ('+T.locations.length+' + 3)');
  ok(/Synced/.test(await page.textContent('.syncbadge')), 'badge: '+(await page.textContent('.syncbadge')).trim());
});
