/* Search boxes keep focus while results redraw under them, and re-importing packing rewords without unticking or resurrecting. */
const { suite, trip, fixture, fixturePath, swCache } = require('./lib');
const fs = require('fs'), path = require('path');

suite({}, async (env) => {
  const { ok, wait, rows, tab } = env;
  const T = trip(), muNames = T.locations.filter(l => /mu/i.test(l.name_en + ' ' + l.name_zh)).map(l => l.name_en);
  const page = await env.phone({});
  console.log('\n1. Places search: the box is never replaced while typing');
  await page.click('nav.tabs button[data-view="places"]'); await wait(200);
  await page.evaluate(()=>{ window.__box=document.getElementById('q'); });
  await page.click('#q'); await page.keyboard.type('mu', {delay:40});
  const s=await page.evaluate(()=>({same:window.__box===document.getElementById('q'), v:document.getElementById('q').value, focus:document.activeElement.id,
    rows:document.querySelectorAll('#placeResults [data-act="loc"], #placeResults .card, #placeResults li').length, count:(document.getElementById('placeResults').innerText||'').slice(0,60)}));
  ok(s.same && s.v==='mu' && s.focus==='q', 'same input element, value "'+s.v+'" (no doubled letters), still focused');
  ok(new RegExp(muNames.length+' of '+T.locations.length).test(s.count) && s.count.includes(muNames[0]), 'results redrawn under it: '+s.count.replace(/\n/g,' | '));
  await page.keyboard.type('zzzq'); await wait(50);
  ok(/No match/i.test(await page.textContent('#placeResults')), 'no-match card shows for nonsense');
  await page.fill('#q',''); await page.keyboard.type('m'); 

  console.log('\n2. Add-to-day picker search');
  await page.click('nav.tabs button[data-view="day"]').catch(()=>{}); await wait(200);
  await page.evaluate(()=>pickLocationForDay('2026-10-24')); await wait(250);
  await page.evaluate(()=>{ window.__pq=document.getElementById('pq'); });
  await page.click('#pq'); await page.keyboard.type('mu', {delay:40});
  const p=await page.evaluate(()=>({same:window.__pq===document.getElementById('pq'), v:document.getElementById('pq').value, focus:document.activeElement.id,
    n:document.getElementById('pickResults').children.length}));
  ok(p.same && p.v==='mu' && p.focus==='pq' && p.n>0, 'picker keeps its box ("'+p.v+'"), '+p.n+' result nodes');
  await page.evaluate(()=>closeSheet());

  console.log('\n3. Re-import: packing reworded/regrouped, ticks and removals kept');
  const f1={kind:'greater-china-trip-notes',version:2,locations:[],checklist:[],packing:[
    {id:'pk-t1',section:'Clothing',order_index:1,text:'Walking shoes'},{id:'pk-t2',section:'Clothing',order_index:2,text:'Hat'}]};
  fs.writeFileSync(env.out('pk1.json'),JSON.stringify(f1));
  await page.click('#btnSettings'); await wait(200);
  await page.setInputFiles('#importFile', env.out('pk1.json')); await wait(400);
  await page.evaluate(()=>{ packing.items.forEach(i=>{ if(i.id==='pk-t1') i.done='1'; if(i.id==='pk-t2') i.removed='1'; }); });
  f1.packing[0].text='Comfortable walking shoes — hilly'; f1.packing[0].section='Footwear'; f1.packing[1].text='Sun hat';
  fs.writeFileSync(env.out('pk2.json'),JSON.stringify(f1));
  await page.setInputFiles('#importFile', env.out('pk2.json')); await wait(400);
  const it=await page.evaluate(()=>packing.items.filter(i=>/^pk-t/.test(i.id)).map(i=>({id:i.id,t:i.text,s:i.section,d:i.done,r:i.removed})));
  const a=it.find(i=>i.id==='pk-t1'), c=it.find(i=>i.id==='pk-t2');
  ok(it.length===2, 'no duplicates: '+it.length+' items');
  ok(a.t==='Comfortable walking shoes — hilly' && a.s==='Footwear' && a.d==='1', 'reworded + regrouped, still ticked');
  ok(c.r==='1' && c.t==='Hat', 'removed item stays removed and untouched');
});
