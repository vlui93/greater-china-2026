/* Prep: importing checklist and packing on a phone while the backend is still the first release, ticking without jamming the queue, soft deletes, the upgrade uploading the phone's checklist, newest tick wins, day briefings, the Tomorrow card and the guide. */
const { suite, trip, fixture, fixturePath, swCache } = require('./lib');
const fs = require('fs'), path = require('path');

suite({ backend: 'v1' }, async (env) => {
  const { ok, wait, rows, tab } = env;
  const N = fixture('trip-notes.json'), T = trip(), ids = new Set(T.locations.map(l => l.id));
  const nPlaces = N.locations.filter(x => x.id && ids.has(x.id)).length, nMiss = N.locations.length - nPlaces;
  const nCk = N.checklist.length, nPk = N.packing.length;
  const SS = env.SS, sheetCk = () => { const sh = SS.getSheetByName('Checklist'); return sh ? sh.getLastRow() - 1 : -1; };
  const page = await env.phone({ clock: '2026-09-25T20:00:00+10:00', tz: 'Asia/Shanghai', connectWait: 600, dialogs: false });

  console.log('\n1. import on a phone, backend still the OLD one');
  await page.click('#btnSettings'); await wait(200);
  await page.fill('#s_me','Alex'); await page.press('#s_me','Tab'); await wait(2500);
  await page.setInputFiles('#importFile', fixturePath('trip-notes.json')); await wait(500);
  const t1=(await page.textContent('#toast')).trim();
  ok(new RegExp(nPlaces+' places').test(t1) && new RegExp(nCk+' checklist').test(t1) && new RegExp(nPk+' packing').test(t1) && new RegExp(nMiss+' places not on this phone').test(t1), 'toast: "'+t1+'"');

  console.log('\n2. Prep → Checklist');
  await page.click('nav.tabs button[data-view="prep"]'); await wait(250);
  const heads=await page.$$eval('#view-prep .ckhead .ckslide > :first-child', e=>e.map(x=>x.textContent));
  ok(heads[0]==='Next up' && heads.includes('Bookings') && heads.includes('Documents'), 'sections: '+heads.join(' / '));
  const firstDue=await page.$eval('#view-prep .ckgroup .due', e=>e.textContent);
  ok(/due in 3 days/.test(firstDue), 'next-up item shows its due date: "'+firstDue+'"');
  ok(await page.textContent('#viewSub')==='21 days until you fly', 'sub: '+await page.textContent('#viewSub'));

  console.log('\n3. ticking against the old backend does not jam the queue');
  const before=page.posted.length;
  await page.click('.ckbox[data-id="ck-01"]'); await wait(400);
  ok(await page.getAttribute('.ckbox[data-id="ck-01"]','aria-checked')==='true', 'ck-01 ticked');
  ok(await page.evaluate(()=>store.queue.length)===0, 'queue empty — Unknown action was not queued');
  await page.evaluate(()=>{ const e=store.data.schedule[0]; const c=JSON.parse(JSON.stringify(e)); c.notes='edited'; return store.write('saveScheduleEntry',c,function(){ store.data.schedule[0]=c; }); });
  await wait(300);
  const row=env.SS.getSheetByName('Schedule').d.find(r=>r[0]===(T.schedule[0].id));
  ok(row && row[5]==='edited', 'an unrelated edit still reaches the Sheet');

  console.log('\n4. delete is soft, and re-import does not resurrect it');
  await page.click('.cktext[data-id="ck-35"]'); await wait(200);
  await page.click('[data-act="ck-delete"]'); await wait(300);   // no confirm: Undo instead
  ok(!(await page.$('.ckbox[data-id="ck-35"]')), 'deleted item hidden');
  await page.click('#btnSettings'); await wait(200);
  await page.setInputFiles('#importFile', fixturePath('trip-notes.json')); await wait(400);
  await page.click('nav.tabs button[data-view="prep"]'); await wait(200);
  ok(!(await page.$('.ckbox[data-id="ck-35"]')) && await page.getAttribute('.ckbox[data-id="ck-01"]','aria-checked')==='true',
     're-import: deleted stays deleted, tick stays ticked');

  console.log('\n5. packing');
  await page.click('[data-act="prep-tab"][data-v="packing"]'); await wait(200);
  await page.click('.ckbox[data-id="pk-01"]'); await page.click('.ckbox[data-id="ck-p01"]'); await wait(300);
  const by=await page.textContent('.ckbox[data-id="ck-p01"] + .cktext');
  ok(/Alex/.test(by), 'shared item shows who ticked it');
  await page.reload(); await wait(600);
  ok(await page.getAttribute('.ckbox[data-id="pk-01"]','aria-checked')==='true', 'personal tick survives reload');

  console.log('\n6. sync against the OLD backend keeps the checklist');
  await page.evaluate(()=>store.sync({quiet:true})); await wait(500);
  ok(await page.evaluate(()=>store.data.checklist.length)===nCk, 'still '+nCk+' items after sync');
  ok(sheetCk()===-1, 'old backend has no Checklist tab (nothing was pushed into the void)');

  console.log('\n7. UPGRADE: new script, same spreadsheet');
  env.deploy();
  await page.evaluate(()=>store.sync({quiet:true})); await wait(1500);
  ok(sheetCk()===nCk, 'phone uploaded its checklist on first sync: '+sheetCk()+' rows');
  const ckRows=env.SS.getSheetByName('Checklist'), H=env.box.TABS.Checklist;
  const r01=ckRows.d.find(r=>r[0]==='ck-01'), r35=ckRows.d.find(r=>r[0]==='ck-35');
  ok(r01 && r01[H.indexOf('done')] && r01[H.indexOf('done_by')]==='Alex', 'the tick made before the upgrade reached the Sheet');
  ok(r35 && r35[H.indexOf('removed')]==='1', 'the delete made before the upgrade reached the Sheet');

  console.log('\n8. another phone ticks something — newest wins');
  const r19=ckRows.d.find(r=>r[0]==='ck-19');
  r19[H.indexOf('done')]='2026-09-25T11:00:00Z'; r19[H.indexOf('done_by')]='Sam'; r19[H.indexOf('updated')]='2099-01-01T00:00:00Z';
  await page.evaluate(()=>store.sync({quiet:true})); await wait(600);
  const l19=await page.evaluate(()=>store.data.checklist.filter(i=>i.id==='ck-19')[0]);
  ok(l19.done && l19.done_by==='Sam', 'phone picked up Sam\'s tick');

  console.log('\n9. day briefings');
  await page.click('nav.tabs button[data-view="days"]'); await wait(150);
  const brief=async d=>{ await page.click('nav.tabs button[data-view="today"]'); await wait(100);
    await page.click('button.daychip[data-date="'+d+'"]'); await wait(200);
    const e=await page.$('#view-today .brief:not(.tomorrow)'); return e ? (await e.innerText()).replace(/\s+/g,' ') : ''; };
  const b21=await brief('2026-10-21'); console.log('       21 Oct: '+b21);
  ok(/Not booked yet/.test(b21) && /Passports/.test(b21), '21 Oct warns the train is unbooked, and passports');
  const b31=await brief('2026-10-31'); console.log('       31 Oct: '+b31);
  ok(/00:50/.test(b31) && /tonight/.test(b31), '31 Oct shows the 00:50 flight as tonight');
  const b28=await brief('2026-10-28');
  ok(!/Test Panda Park tickets on Trip.com/.test(b28), '28 Oct: the Test Panda Park task gone once Sam ticked it');

  console.log('\n10. Tomorrow card, evening before');
  await page.clock.setFixedTime(new Date('2026-10-24T18:30:00+08:00'));
  await page.evaluate(()=>{ ui.day=todayISO(); setView('today'); }); await wait(300);
  const tm=await page.$('#view-today .brief.tomorrow');
  const tmt=tm ? (await tm.innerText()).replace(/\s+/g,' ') : '';
  console.log('       '+tmt);
  ok(/Tomorrow/i.test(tmt) && /Sunday 25 Oct/i.test(tmt) && /Test Sichuan Museum/i.test(tmt), 'tomorrow card appears at 18:30 for the next day');

  console.log('\n11. reset keeps the checklist; guide renders');
  await page.click('#btnSettings'); await wait(200); page.once('dialog',d=>d.accept());
  await page.click('[data-act="reset-local"]'); await wait(900);
  ok(await page.evaluate(()=>store.data.checklist.length)>=nCk, 'checklist survives "Reset this phone"');
  await page.click('nav.tabs button[data-view="prep"]'); await page.click('[data-act="prep-tab"][data-v="guide"]'); await wait(200);
  ok((await page.$$('.guide .card')).length===6, 'guide: 6 sections');
  await page.screenshot({path:env.out('prep-guide.png')});
  await page.click('[data-act="prep-tab"][data-v="checklist"]'); await wait(200);
  await page.screenshot({path:env.out('prep-checklist.png')});
});
