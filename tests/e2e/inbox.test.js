/* The Inbox: links and notes sent in from other apps through an iPhone
   Shortcut (a plain GET to the backend), shown in Places, made into places
   through the map-link reader or dismissed — and gone from every phone either
   way. Plus the set-up screen: the address it gives works, and the key isn't
   shown on screen. */
const { suite, trip } = require('./lib');

suite({}, async (env) => {
  const { ok, wait, rows } = env;
  const T = trip(), box = env.box;
  // What a Shortcut sends: action, key and the shared text, in the address
  const send = (key, text) => JSON.parse(box.doGet({ parameter: { action: 'inboxAdd', key, text } })._t);
  const r1 = send('k', '【高德地图】测试面馆二\nhttps://surl.amap.com/T3st');
  const r2 = send('k', 'Noodle place a friend posted about — worth a look https://example.com/post/77');
  ok(r1.ok && r2.ok && rows('Inbox').length === 2, 'two things sent in the way the Shortcut sends them');
  const page = await env.phone({ clock: '2026-10-18T09:00:00+08:00', clockMode: 'install', context: { permissions: ['clipboard-read', 'clipboard-write'] } });
  await page.evaluate(() => setView('places')); await wait(300);

  console.log('\n1. in Places');
  ok(/Inbox \(2\)/.test(await page.textContent('#view-places .inboxbar')), 'Places shows "Inbox (2)"');
  await page.click('[data-act="inbox"]'); await wait(600);
  const items = await page.$$eval('#sheetBody .inboxitem', e => e.map(x => x.innerText.replace(/\s+/g, ' ')));
  ok(items.length === 2 && items.some(t => t.includes('测试面馆二')) && items.some(t => t.includes('example.com/post/77')), 'the Inbox lists both, as sent');

  console.log('\n2. make one a place');
  const amap = await page.$eval('#sheetBody .inboxitem:has-text("测试面馆二")', e => e.dataset.iid);
  await page.click(`[data-act="inbox-place"][data-iid="${amap}"]`); await wait(1200);
  ok(await page.inputValue('#f_name_zh') === '测试面馆' || /测试面馆/.test(await page.inputValue('#f_name_zh')), 'the new-place form opens with the name read from the link: ' + await page.inputValue('#f_name_zh'));
  ok(await page.inputValue('#f_lat') !== '', 'and the pin, looked up through the backend from the short link');
  await page.click('[data-act="save-location"]'); await wait(900);
  ok(/off the Inbox/.test(await page.textContent('#toast')), 'saved: "' + (await page.textContent('#toast')).trim() + '"');
  ok(rows('Locations').some(l => /测试面馆/.test(l.name_zh)) && String((rows('Inbox').find(i => i.id === amap) || {}).done).length > 0, 'the place is in the Sheet, and the item is marked done there');
  ok(/Inbox \(1\)/.test(await page.textContent('#view-places .inboxbar')), 'Places now shows "Inbox (1)"');

  console.log('\n3. a cancelled one stays');
  await page.click('[data-act="inbox"]'); await wait(500);
  const post = await page.$eval('#sheetBody .inboxitem', e => e.dataset.iid);
  await page.click(`[data-act="inbox-place"][data-iid="${post}"]`); await wait(800);
  await page.evaluate(() => closeSheet()); await wait(200);
  await page.click('[data-act="new-location"]'); await wait(500);
  await page.fill('#f_name_en', 'Test Unrelated Place'); await page.fill('#f_name_zh', '测试无关'); await page.fill('#f_lat', '22.31'); await page.fill('#f_lng', '114.17');
  await page.click('[data-act="save-location"]'); await wait(800);
  ok(!(rows('Inbox').find(i => i.id === post) || {}).done && /Inbox \(1\)/.test(await page.textContent('#view-places .inboxbar')), 'opening one and backing out leaves it in the Inbox; the next new place doesn\'t clear it');

  console.log('\n4. dismiss, and another phone');
  await page.click('[data-act="inbox"]'); await wait(500);
  await page.click(`[data-act="inbox-dismiss"][data-iid="${post}"]`); await wait(800);
  ok(/Dismissed/.test(await page.textContent('#toast')) && !await page.$('#view-places .inboxbar') && !await page.$('#sheet.open'), 'dismissed: the Inbox bar goes and the sheet closes');
  const other = await env.phone({ clock: '2026-10-18T10:00:00+08:00', clockMode: 'install' });
  await other.evaluate(() => setView('places')); await wait(300);
  ok(!await other.$('#view-places .inboxbar'), 'another phone has an empty Inbox too');
  send('k', 'One more https://example.com/x');
  await other.evaluate(() => store.sync({ quiet: true })); await wait(600);
  ok(/Inbox \(1\)/.test(await other.textContent('#view-places .inboxbar')), 'and sees something new after its next sync');

  console.log('\n5. a person\'s own key');
  box.post('saveTrip', { id: 'tz-other', name: 'Test Other Trip', start: '2027-03-01', end: '2027-03-05' });
  const sam = box.post('saveMember', { name: 'Sam', trips: ['gc2026'], role: 'member' }).data.member;
  const vic = box.post('saveMember', { name: 'Vic', trips: ['gc2026'], role: 'viewer' }).data.member;
  const rs = send(sam.key, 'From Sam https://example.com/s');
  ok(rs.ok && rs.data.item.trip_id === 'gc2026' && rs.data.item.by === 'Sam', 'with Sam\'s key it lands in Sam\'s trip, under Sam\'s name');
  ok(/View only/.test(send(vic.key, 'x').error), 'a view-only key can\'t send');
  ok(/Bad or missing API key/.test(send('wrong', 'x').error), 'and a wrong key is refused');

  console.log('\n6. setting up the Shortcut');
  await page.click('#btnSettings'); await wait(600);
  await page.click('[data-act="share-setup"]'); await wait(600);
  const body = await page.textContent('#sheetBody');
  ok(/Show in Share Sheet/.test(body) && /Get Contents of URL/.test(body) && /URL Encode/.test(body) && /couldn’t confirm/.test(body), 'the steps name the actions, and say which name couldn\'t be confirmed');
  ok(!body.includes('key=k') && /action=inboxAdd&key=…/.test(await page.inputValue('#share_addr')), 'the address on screen stops before the key');
  await page.click('[data-act="share-copy"]'); await wait(400);
  const addr = await page.evaluate(() => navigator.clipboard.readText());
  ok(addr === 'https://script.google.com/macros/s/X/exec?action=inboxAdd&key=k&text=', 'Copy gives the whole address, key included: ' + addr.replace(/key=[^&]*/, 'key=…'));
  const q = Object.fromEntries(new URL(addr + encodeURIComponent('Sent the way the steps describe https://example.com/z')).searchParams);
  const viaSteps = JSON.parse(box.doGet({ parameter: q })._t);
  ok(viaSteps.ok && viaSteps.data.item.url === 'https://example.com/z', 'and that address, with encoded text on the end, files an item');
  await page.screenshot({ path: env.out('inbox-setup.png'), fullPage: true });
  await page.evaluate(() => closeSheet());
  const vp = await env.phone({ connect: false });
  await vp.fill('#g_url', 'https://script.google.com/macros/s/X/exec'); await vp.fill('#g_key', vic.key); await vp.click('#gateBtn'); await wait(900);
  await vp.click('#btnSettings'); await wait(600);
  ok(!await vp.$('[data-act="share-setup"]'), 'a view-only phone isn\'t offered the set-up');
  await vp.evaluate(() => { closeSheet(); setView('places'); }); await wait(300);
  await vp.click('[data-act="inbox"]'); await wait(500);
  ok(await vp.$$eval('#sheetBody .inboxitem', e => e.length) > 0 && !await vp.$('[data-act="inbox-place"]') && !await vp.$('[data-act="inbox-dismiss"]'), 'and sees the Inbox without the buttons to change it');
  ok(!page.errs.length && !other.errs.length && !vp.errs.length, 'no JS errors ' + page.errs.concat(other.errs, vp.errs).join('; '));
});
