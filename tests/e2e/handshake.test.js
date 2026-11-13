/* The app and the backend say which version they are. With the current
   backend: a sync that finds nothing new downloads nothing, and changes made
   with no signal go up in one request. With the backend from before versions:
   everything still works the old way, and Settings says Code.gs needs pasting. */
const { suite, trip } = require('./lib');

suite({}, async (env) => {
  const { ok, wait, rows } = env;
  const T = trip(), box = env.box;
  const replies = [];
  let offline = false, slow = 0, tamper = null;
  const page = await env.phone({ filter: (out, body) => { if (tamper) out = tamper(out, body); replies.push({ action: body.action, etag: body.payload && body.payload.etag, len: JSON.stringify(out).length, out }); return out; } });
  await page.ctx.route('**/macros/s/**', async route => { if (offline) return route.abort('internetdisconnected'); if (slow) await wait(slow); return route.fallback(); });
  const last = a => replies.filter(r => r.action === a).pop();
  const sync = async o => { await page.evaluate(o => store.sync(o).catch(() => {}), o || { quiet: true }); await wait(300); };
  const settings = async () => { await page.click('#btnSettings'); await wait(300); const t = await page.textContent('#sheetBody'); await page.evaluate(() => closeSheet()); await wait(150); return t; };

  console.log('\n1. the app knows the backend\'s version');
  ok(await page.evaluate(() => store.v === BACKEND_WANT && +JSON.parse(localStorage.getItem('gct.v')) === BACKEND_WANT), 'read off the first reply, and remembered');
  ok(!/Backend needs updating/.test(await settings()), 'Settings says nothing about updating');

  console.log('\n2. a sync that finds nothing new downloads nothing');
  const first = last('all');
  ok(!first.etag && first.out.data.locations.length === T.locations.length && first.len > 2000, 'the first sync brings the trip (' + Math.round(first.len / 1024) + 'KB)');
  const t0 = await page.evaluate(() => +JSON.parse(localStorage.getItem('gct.synced')));
  await wait(20);
  await page.evaluate(() => store.sync().catch(() => {})); await wait(400);
  const second = last('all');
  ok(second !== first && second.etag === first.out.data.etag && second.out.data.unchanged === true, 'the next one sends the fingerprint back and is told "unchanged"');
  ok(second.len < 200, 'in ' + second.len + ' bytes, not ' + first.len);
  ok(/Synced with the Sheet/.test(await page.textContent('#toast')) && await page.evaluate(t => +JSON.parse(localStorage.getItem('gct.synced')) > t, t0), 'it still counts as a sync: toast, and the last-synced time moves');
  ok(await page.evaluate(() => store.data.locations.length) === T.locations.length && !/Can't sync|Offline/.test(await page.textContent('.syncbadge')), 'the trip is still all there, badge fine');
  const victim = T.locations[0].id;
  box.post('saveLocation', { id: victim, notes: 'changed on another phone' });
  await sync();
  ok(!last('all').out.data.unchanged && await page.evaluate(id => store.loc(id).notes, victim) === 'changed on another phone', 'a change from another phone comes down in full');
  await sync();
  ok(last('all').out.data.unchanged === true, 'and after that it is "unchanged" again');
  const shL = env.tab('Locations'), col = shL.d[0].indexOf('notes'), r = shL.d.findIndex(x => x && x[0] === victim);
  shL.d[r][col] = 'typed into the Sheet';
  await sync();
  ok(await page.evaluate(id => store.loc(id).notes, victim) === 'typed into the Sheet', 'so does a change typed straight into the Sheet');
  await page.click('#btnSettings'); await wait(300);
  await page.click('#sheetBody [data-act="sync"][data-fresh]'); await wait(500);
  ok(!last('all').etag && !last('all').out.data.unchanged, 'Settings › Pull always fetches the whole trip');
  await page.evaluate(() => closeSheet());
  await page.reload(); await wait(700);
  await sync();
  ok(last('all').out.data.unchanged === true, 'the fingerprint survives closing and reopening the app');

  console.log('\n3. changes made with no signal go up together');
  offline = true;
  const [a, b, c] = T.locations.filter(l => l.type !== 'hotel').slice(0, 3).map(l => l.id);
  const stop = T.schedule[0].id;
  await page.evaluate(([a, b, c, stop]) => Promise.all([
    saveLocation(Object.assign({}, store.loc(a), { notes: 'offline one' })),
    saveLocation(Object.assign({}, store.loc(b), { notes: 'offline two' })),
    saveLocation(Object.assign({}, store.loc(c), { notes: 'offline three' })),
    updateStop(stop, { notes: 'offline stop note' }),
    saveChecklistItem({ id: 'ck-offline-1', kind: 'task', text: 'made offline', updated: new Date().toISOString() })]), [a, b, c, stop]); await wait(400);
  await page.evaluate(a => saveLocation(Object.assign({}, store.loc(a), { notes: 'offline one, again' })), a); await wait(300);
  const queued = await page.evaluate(() => store.queue.length);
  ok(queued === 6, queued + ' changes waiting');
  ok(rows('Locations').find(l => l.id === a).notes !== 'offline one, again', 'none in the Sheet yet');
  offline = false;
  const before = page.posted.length;
  await sync();
  const sent = page.posted.slice(before).filter(p => p.action !== 'all');
  ok(sent.length === 1 && sent[0].action === 'batch' && sent[0].payload.jobs.length === 6, 'sent as one request holding all 6 (' + sent.map(p => p.action).join(', ') + ')');
  ok(await page.evaluate(() => store.queue.length) === 0, 'nothing left waiting');
  const L = id => rows('Locations').find(l => l.id === id).notes;
  ok(L(a) === 'offline one, again' && L(b) === 'offline two' && L(c) === 'offline three', 'the places are in the Sheet, the later edit on top of the earlier one');
  ok(rows('Schedule').find(s => s.id === stop).notes === 'offline stop note' && rows('Checklist').some(i => i.id === 'ck-offline-1'), 'and the stop note and the task');
  offline = true;
  await page.evaluate(a => saveLocation(Object.assign({}, store.loc(a), { notes: 'just one' })), a); await wait(300);
  offline = false;
  const b2 = page.posted.length;
  await sync();
  ok(page.posted.slice(b2).filter(p => p.action !== 'all').map(p => p.action).join() === 'saveLocation', 'a single change still goes on its own');

  console.log('\n4. a batch where some changes can\'t be saved');
  offline = true;
  await page.evaluate(([a, b, c]) => Promise.all([
    saveLocation(Object.assign({}, store.loc(a), { notes: 'will be refused' })),
    saveLocation(Object.assign({}, store.loc(b), { notes: 'will fail' })),
    saveLocation(Object.assign({}, store.loc(c), { notes: 'will save' }))]), [a, b, c]); await wait(400);
  offline = false;
  tamper = (out, body) => { if (body.action === 'batch') { out.data.results[0] = { ok: false, error: "This key can't see that trip." }; out.data.results[1] = { ok: false, error: 'Service error: Spreadsheets' }; } return out; };
  await page.evaluate(() => store.sync().catch(() => {})); await wait(500);
  const q = await page.evaluate(() => store.queue.map(j => j.payload.notes));
  ok(q.length === 1 && q[0] === 'will fail', 'the one the backend couldn\'t do stays waiting; the saved and the refused ones don\'t (' + q.join() + ')');
  ok(/Can't sync: the Sheet's script said/.test(await page.textContent('#toast')) && /Spreadsheets/.test(await page.textContent('#toast')), 'the sync says why it stopped: "' + (await page.textContent('#toast')).trim().slice(0, 60) + '…"');
  tamper = null;
  await sync();
  ok(await page.evaluate(() => store.queue.length) === 0 && L(b) === 'will fail', 'it goes on the next sync');

  console.log('\n4b. a batch that is refused outright (a view-only key)');
  // a person's key needs the trip to be in the Trips tab, as it is once a Sheet has people
  box.post('saveTrip', { id: 'gc2026', name: 'Test Trip', start: '2026-10-16', end: '2026-11-01', tz: 'Asia/Shanghai', is_default: '1' });
  const viewer = box.post('saveMember', { name: 'Vic', trips: '*', role: 'viewer' }).data.member;
  const vp = await env.phone({ connect: false });
  await vp.fill('#g_url', 'https://script.google.com/macros/s/X/exec'); await vp.fill('#g_key', viewer.key);
  await vp.click('#gateBtn'); await wait(900);
  ok(await vp.evaluate(() => store.data.locations.length) === T.locations.length && await vp.evaluate(() => whoAmI().role) === 'viewer', 'a view-only phone has the trip');
  await vp.ctx.route('**/macros/s/**', route => offline ? route.abort('internetdisconnected') : route.fallback());
  const sheetA = L(a), sheetB = L(b);
  offline = true;
  await vp.evaluate(([a, b]) => Promise.all([
    saveLocation(Object.assign({}, store.loc(a), { notes: 'a viewer wrote this' })),
    saveLocation(Object.assign({}, store.loc(b), { notes: 'and this' }))]), [a, b]); await wait(400);
  ok(await vp.evaluate(a => store.loc(a).notes, a) === 'a viewer wrote this' && await vp.evaluate(() => store.queue.length) === 2, 'two changes made with no signal are on its screen, waiting');
  offline = false;
  const vb = vp.posted.length;
  await vp.evaluate(() => store.sync().catch(() => {})); await wait(700);
  ok(vp.posted.slice(vb).some(p => p.action === 'batch'), 'they go up as a batch');
  ok(L(a) === sheetA && L(b) === sheetB, 'the Sheet refuses both');
  ok(await vp.evaluate(() => store.queue.length) === 0, 'they are not left waiting to be refused again');
  ok(await vp.evaluate(a => store.loc(a).notes, a) === sheetA && await vp.evaluate(b => store.loc(b).notes, b) === sheetB, 'and the phone is back to what the Sheet holds, though nothing in the Sheet changed');

  console.log('\n5. a change made while a batch is on its way');
  offline = true;
  await page.evaluate(([a, b]) => Promise.all([
    saveLocation(Object.assign({}, store.loc(a), { notes: 'batch A' })),
    saveLocation(Object.assign({}, store.loc(b), { notes: 'batch B' }))]), [a, b]); await wait(300);
  offline = false; slow = 900;
  const flying = page.evaluate(() => store.flush().catch(e => String(e)));
  await wait(250);
  offline = true;   // the new change can't go straight up, so it queues behind the batch
  await page.evaluate(c => saveLocation(Object.assign({}, store.loc(c), { notes: 'made mid-flight' })), c); await wait(100);
  offline = false; slow = 0;
  await flying; await wait(300);
  ok(L(a) === 'batch A' && L(b) === 'batch B', 'the batch landed');
  ok(L(c) === 'made mid-flight' && await page.evaluate(() => store.queue.length) === 0, 'and the change made meanwhile went up after it, not lost');

  console.log('\n6. the backend from before versions: everything the old way, and Settings says so');
  env.deploy('pre2');
  const old = await env.phone({});
  ok(await old.evaluate(() => store.v) === 1, 'no version in its replies counts as version 1');
  ok(await old.evaluate(() => store.data.locations.length) === T.locations.length, 'the trip loads');
  await old.evaluate(() => store.sync({ quiet: true })); await wait(400);
  ok(!old.posted.some(p => p.payload && p.payload.etag), 'it is never sent a fingerprint');
  await old.ctx.route('**/macros/s/**', route => offline ? route.abort('internetdisconnected') : route.fallback());
  offline = true;
  await old.evaluate(([a, b]) => Promise.all([
    saveLocation(Object.assign({}, store.loc(a), { notes: 'old backend one' })),
    saveLocation(Object.assign({}, store.loc(b), { notes: 'old backend two' }))]), [a, b]); await wait(400);
  offline = false;
  const ob = old.posted.length;
  await old.evaluate(() => store.sync({ quiet: true })); await wait(500);
  ok(old.posted.slice(ob).filter(p => p.action !== 'all').map(p => p.action).join() === 'saveLocation,saveLocation', 'waiting changes go one at a time, as before');
  ok(L(a) === 'old backend one' && L(b) === 'old backend two', 'and reach the Sheet');
  await old.click('#btnSettings'); await wait(300);
  const note = await old.$eval('#backendNote', e => e.innerText).catch(() => '');
  ok(/Backend needs updating/.test(note) && /version 1/.test(note) && /built for version 2/.test(note) && /paste the latest Code\.gs/.test(note), 'Settings: "' + note.replace(/\s+/g, ' ').slice(0, 90) + '…"');
  await old.screenshot({ path: env.out('handshake-settings.png') });
  await old.click('#sheetBody [data-act="test-cfg"]'); await wait(500);
  ok(/older version/.test(await old.textContent('#toast')), 'Test says it too');
  await old.evaluate(() => { store.raw.me = { owner: false, role: 'member', name: 'Sam', trips: ['x'] }; settingsForm(); }); await wait(200);
  const mnote = await old.$eval('#backendNote', e => e.innerText).catch(() => '');
  ok(/once the trip owner updates it/.test(mnote) && !/paste/.test(mnote), 'for someone who isn\'t the owner it says to wait for the owner');
  env.deploy();
  await old.evaluate(() => { closeSheet(); return store.sync({ quiet: true }); }); await wait(400);
  await old.click('#btnSettings'); await wait(300);
  ok(await old.evaluate(() => store.v) === 2 && !await old.$('#backendNote'), 'once the backend is updated, the note goes');
  ok(!page.errs.length && !old.errs.length && !vp.errs.length, 'no JS errors ' + page.errs.concat(old.errs, vp.errs).join('; '));
});
