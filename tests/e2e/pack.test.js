/* Packing: everyone's list, the group's and mine, and swiping an item or a
   whole section left to delete it, with Undo. */
const { suite } = require('./lib');

suite({}, async (env) => {
  const { ok, wait, rows } = env;
  const page = await env.phone({ clock: '2026-10-12T09:00:00+08:00', clockMode: 'install', context: { hasTouch: true, isMobile: true } });
  await page.evaluate(()=>{ save(LS.me,"Alex"); });
  // seed: two "each" items in Clothes, one in Shoes, two group items, one task section
  await page.evaluate(async()=>{
    const mk=(id,kind,section,text,o)=>({id,kind,section,text,due:"",location_id:"",done:"",done_by:"",order_index:o,removed:""});
    const L=[mk("ck-e1","each","Clothes","6 quick-dry tees",200),mk("ck-e2","each","Clothes","7 underwear and socks",201),
      mk("ck-e3","each","Shoes","Waterproof hikers",210),mk("ck-g1","pack","Power & tech","Type G adapters ×2",300),
      mk("ck-g2","pack","Health","First-aid kit",310),
      Object.assign(mk("ck-t1","task","Money","Tell the banks",60),{due:"2026-10-14"}),
      Object.assign(mk("ck-t2","task","Money","Get cash",61),{due:"2026-10-14"})];
    for(const i of L) await saveChecklistItem(i);
  });
  await wait(400);
  await page.evaluate(()=>{ ui.prepTab="packing"; setView("prep"); }); await wait(300);
  console.log('\n1. layout');
  const heads=await page.$$eval('.whohead b', e=>e.map(x=>x.textContent));
  ok(heads.join("|")==="Each of us · 每人|Group · 共用|Just me · 仅我", 'three blocks: '+heads.join("|"));
  ok(/One for the group/.test(await page.textContent('#view-prep')), 'group items say they are one for the group');
  await page.screenshot({path:env.out('pack-1.png'), fullPage:true});

  console.log('\n2. ticks');
  await page.click('[data-act="ck-toggle"][data-id="ck-e1"]'); await wait(300);
  ok(await page.evaluate(()=>!!eachTicks()["ck-e1"]), 'each tick kept on the phone');
  ok(!(rows('Checklist').find(r=>r.id==="ck-e1")||{}).done, '…and not in the Sheet');
  await page.click('[data-act="ck-toggle"][data-id="ck-g1"]'); await wait(400);
  ok(/Alex brings it/.test(await page.textContent('#view-prep')), 'group tick shows who brings it');
  ok((rows('Checklist').find(r=>r.id==="ck-g1")||{}).done_by==="Alex", 'group tick in the Sheet');

  console.log('\n3. swipe an item (mouse)');
  const swipe=async(sel, dist)=>{ await page.$eval(sel, e=>e.scrollIntoView({block:'center'})); await wait(60); const b=await page.$eval(sel, e=>{const r=e.getBoundingClientRect();return [r.x+r.width-30, r.y+r.height/2];});
    await page.mouse.move(b[0],b[1]); await page.mouse.down(); for(let i=1;i<=8;i++){ await page.mouse.move(b[0]-dist*i/8, b[1]+2); await wait(16);} await page.mouse.up(); await wait(300); };
  const rowSel=id=>`.ckrow:has([data-id="${id}"])`;
  await swipe(rowSel('ck-e2'), 140);
  const tx=await page.$eval(rowSel('ck-e2')+' .ckslide', e=>e.style.transform);
  ok(/-92px/.test(tx), 'slides open to show Delete: '+tx);
  ok(await page.evaluate(()=>!eachTicks()["ck-e2"]), 'swipe did not tick the box');
  await page.screenshot({path:env.out('pack-2.png')});
  await page.click(rowSel('ck-e2')+' .ckdel'); await wait(500);
  ok(await page.$(rowSel('ck-e2'))===null, 'deleted from the list');
  ok((rows('Checklist').find(r=>r.id==="ck-e2")||{}).removed==="1", 'removed in the Sheet');
  ok(/Deleted/.test(await page.textContent('#toast')) && await page.$('#toast .undo')!==null, 'toast with Undo');
  await page.click('#toast .undo'); await wait(600);
  ok(await page.$(rowSel('ck-e2'))!==null && (rows('Checklist').find(r=>r.id==="ck-e2")||{}).removed==="", 'Undo brings it back, Sheet too');

  console.log('\n4. a short swipe springs back, a tap closes an open row');
  await swipe(rowSel('ck-e3'), 25);
  ok(!/-/.test(await page.$eval(rowSel('ck-e3')+' .ckslide', e=>e.style.transform)), 'short swipe springs back');
  await swipe(rowSel('ck-e3'), 140);
  await page.click(rowSel('ck-e1')+' .cktext'); await wait(300);
  ok(!/-/.test(await page.$eval(rowSel('ck-e3')+' .ckslide', e=>e.style.transform)), 'tap elsewhere closes it');
  ok(!(await page.$eval('#sheet', e=>e.classList.contains('open'))), '…without opening the item tapped');

  console.log('\n5. touch swipe');
  const cdp=await page.ctx.newCDPSession(page);
  await page.$eval(rowSel('ck-g2'), e=>e.scrollIntoView({block:'center'})); await wait(100);
  const tb=await page.$eval(rowSel('ck-g2'), e=>{const r=e.getBoundingClientRect();return [r.x+r.width-30, r.y+r.height/2];});
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:tb[0],y:tb[1]}]});
  for(let i=1;i<=10;i++){ await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:tb[0]-14*i,y:tb[1]+1}]}); await wait(16); }
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await wait(300);
  ok(/-92px/.test(await page.$eval(rowSel('ck-g2')+' .ckslide', e=>e.style.transform)), 'opens with a finger too');
  await page.click('body',{position:{x:5,y:5}}); await wait(300);

  console.log('\n6. delete a whole section by swiping its title');
  await page.evaluate(()=>window.scrollTo(0,0));
  await swipe('.ckhead:has([data-section="Clothes"])', 160);
  ok(/Delete all 2/.test(await page.textContent('.ckhead:has([data-section="Clothes"]) .ckdel')), 'button says Delete all 2');
  await page.click('.ckhead:has([data-section="Clothes"]) .ckdel'); await wait(1500);
  ok(await page.$('[data-section="Clothes"]')===null, 'section gone');
  ok(["ck-e1","ck-e2"].every(id=>(rows('Checklist').find(r=>r.id===id)||{}).removed==="1"), 'both rows removed in the Sheet');
  await page.click('#toast .undo'); await wait(1500);
  ok(await page.$('.ckname[data-section="Clothes"]')!==null, 'Undo restores the section');

  console.log('\n7. rename a section, move an item to the group');
  await page.click('.ckname[data-section="Shoes"]'); await wait(300);
  await page.fill('#c_secname','Footwear'); await page.click('[data-act="ck-section-save"]'); await wait(600);
  ok(await page.$('.ckname[data-section="Footwear"]')!==null && (rows('Checklist').find(r=>r.id==="ck-e3")||{}).section==="Footwear", 'renamed, in the Sheet too');
  await page.click('[data-act="ck-edit"][data-id="ck-e3"]'); await wait(300);
  ok(await page.$('input[name="c_who"][value="each"]:checked')!==null, 'form shows who packs it');
  await page.check('input[name="c_who"][value="pack"]'); await page.click('[data-act="ck-save"]'); await wait(600);
  ok((rows('Checklist').find(r=>r.id==="ck-e3")||{}).kind==="pack", 'moved to the group');

  console.log('\n8. tasks swipe too, and progress on the overview');
  await page.evaluate(()=>{ ui.prepTab="checklist"; renderPrep(); }); await wait(300);
  await swipe(rowSel('ck-t1'), 140); await page.click(rowSel('ck-t1')+' .ckdel'); await wait(500);
  ok((rows('Checklist').find(r=>r.id==="ck-t1")||{}).removed==="1", 'task deleted by swipe');
  await page.screenshot({path:env.out('pack-3.png')});
  await page.evaluate(()=>{ ui.prepTab="packing"; renderPrep(); }); await wait(300);
  await page.screenshot({path:env.out('pack-4.png'), fullPage:true});

  console.log('\n9. section dropdown, a new section, and who brings a group item');
  await page.evaluate(()=>window.scrollTo(0,0));
  await page.click('.ckadd[data-scope="shared"][data-section="Health"]'); await wait(300);
  const opts=()=>page.$$eval('#c_section_sel option', e=>e.map(o=>o.value));
  let o=await opts();
  ok(await page.inputValue('#c_section_sel')==='Health' && o.includes('Power & tech') && o.includes('Footwear') && o[o.length-1]==='__new__',
     'Section is a dropdown of the group list\'s sections, on the one you added from: '+o.join(' | '));
  ok(await page.isVisible('#c_assign') && !(await page.isVisible('#c_section_new')), 'group item: "Who\'s bringing it" shown; no new-section box yet');
  await page.check('input[name="c_who"][value="each"]'); await wait(100);
  o=await opts();
  ok(o.includes('Clothes') && !o.includes('Power & tech') && !(await page.isVisible('#c_assign')), 'switch to "each of us": that list\'s sections, no one to assign');
  await page.check('input[name="c_who"][value="pack"]'); await wait(100);
  await page.fill('#c_text','Biscuits');
  await page.selectOption('#c_section_sel','__new__');
  ok(await page.isVisible('#c_section_new'), '"New section…" opens a box for the name');
  await page.click('[data-act="ck-save"]'); await wait(300);
  ok(/Name the new section/.test(await page.innerText('#toast')) && await page.isVisible('#sheet.open'), 'an empty new section is refused, form stays open');
  await page.fill('#c_section_new','Snacks');
  await page.selectOption('#c_assign','__new__'); await page.fill('#c_assign_new','Sam');
  await page.click('[data-act="ck-save"]'); await wait(700);
  const bis=rows('Checklist').find(r=>r.text==='Biscuits')||{};
  ok(bis.section==='Snacks' && bis.kind==='pack' && bis.assignee==='Sam', 'saved to the Sheet: new section, given to someone new: '+JSON.stringify([bis.section,bis.kind,bis.assignee]));
  ok(await page.$('.ckname[data-section="Snacks"]')!==null && /Sam to bring/.test(await page.innerText('.ckrow:has([data-id="'+bis.id+'"])')), 'the new section shows, with "Sam to bring"');
  await page.click('[data-act="ck-edit"][data-id="ck-g2"]'); await wait(300);
  const people=await page.$$eval('#c_assign option', e=>e.map(o=>o.textContent));
  ok(people.includes('Alex (you)') && people.includes('Sam'), 'names offered: you, and everyone already on the list — '+people.join(' | '));
  await page.selectOption('#c_assign','Alex'); await page.click('[data-act="ck-save"]'); await wait(600);
  ok(/You're bringing it/.test(await page.innerText('.ckrow:has([data-id="ck-g2"])')) && (rows('Checklist').find(r=>r.id==='ck-g2')||{}).assignee==='Alex', 'given to you: "You\'re bringing it", in the Sheet too');
  await page.click('[data-act="ck-toggle"][data-id="ck-g2"]'); await wait(500);
  ok(/Alex brings it/.test(await page.innerText('.ckrow:has([data-id="ck-g2"])')), 'ticked: "Alex brings it"');
  await page.click('[data-act="ck-edit"][data-id="ck-g2"]'); await wait(300);
  await page.check('input[name="c_who"][value="each"]'); await page.click('[data-act="ck-save"]'); await wait(600);
  ok((rows('Checklist').find(r=>r.id==='ck-g2')||{}).assignee==='', 'moved to "each of us": nobody is assigned');
  await page.screenshot({path:env.out('pack-5.png'), fullPage:true});

  console.log('\n10. the backend deployed today has no assignee column');
  await page.ctx.unroute('**/macros/s/**');
  await page.ctx.route('**/macros/s/**', async route=>{ const body=route.request().postData()||'{}';
    const j=JSON.parse(env.box.doPost({postData:{contents:body},parameter:{}})._t);
    if(j.data && Array.isArray(j.data.checklist)) j.data.checklist.forEach(i=>{ delete i.assignee; });
    route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(j)}); });
  await page.evaluate(()=>store.sync({quiet:true})); await wait(700);
  ok(await page.evaluate(()=>!store.supportsAssignee), 'the app notices');
  ok(await page.evaluate(id=>(store.data.checklist.find(i=>i.id===id)||{}).assignee, bis.id)==='Sam', 'an assignment survives a sync with it (kept on this phone)');
  await page.click('[data-act="ck-edit"][data-id="'+bis.id+'"]'); await wait(300);
  ok(/Once the Sheet's script is updated/.test(await page.innerText('#c_assign_f')), 'and the form says so');
  await page.evaluate(()=>closeSheet());
});
