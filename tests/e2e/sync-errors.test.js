/* When a sync fails, the phone says why. Every failure used to read "Offline",
   so after pasting a new Code.gs a missing API key, a deployment not open to
   Anyone and having no signal all looked the same. Edits stay queued whatever
   the reason, and go up once the Sheet answers again. */
const { suite } = require('./lib');

suite({}, async (env) => {
  const { ok, wait } = env;
  let mode = 'ok';
  const page = await env.phone({ filter: out =>
    mode === 'badkey' ? { ok: false, error: 'Bad or missing API key.' } :
    mode === 'nokey'  ? { ok: false, error: 'Server not configured: set API_KEY in Code.gs and redeploy.' } :
    mode === 'boom'   ? { ok: false, error: 'Exception: Range not found' } : out });
  // Replies the backend mock can't give: a web page, a reply the browser won't
  // hand over (Google's sign-in page, no CORS), and no connection at all.
  await page.ctx.route('**/macros/s/**', route => {
    const post = route.request().method() === 'POST';
    if (mode === 'html') return route.fulfill({ status: 200, contentType: 'text/html', body: '<!doctype html><title>Sign in</title><p>Sign in to continue</p>' });
    if (mode === 'blocked') return post ? route.abort('failed') : route.fulfill({ status: 200, contentType: 'text/html', body: '' });
    if (mode === 'net') return route.abort('internetdisconnected');
    return route.fallback();
  });
  const badge = async () => (await page.textContent('#view-today .syncbadge')).trim();
  const sync = async () => { await page.click('#view-today [data-act="sync"]'); await wait(900); return { badge: await badge(), toast: await page.textContent('#toast'), q: await page.evaluate(() => store.queue.length) }; };

  console.log('\n1. connected');
  ok(/^Synced$/.test(await badge()), 'badge: Synced');
  const lid = await page.evaluate(() => store.data.locations[0].id);

  console.log('\n2. an edit while the key is wrong stays queued');
  mode = 'badkey';
  await page.evaluate(id => saveLocation(Object.assign({}, store.loc(id), { notes: 'Queued while the key was wrong' })), lid);
  await wait(600);
  let r = await sync();
  ok(r.q === 1, 'the edit is still queued');
  ok(/^Can't sync · 1 waiting$/.test(r.badge), 'badge says it can\'t sync, not Offline: "' + r.badge + '"');
  ok(/API key in ⚙ Settings doesn't match the one in Code\.gs/.test(r.toast), 'toast names the key: "' + r.toast + '"');

  console.log('\n3. each cause, in words');
  mode = 'nokey'; r = await sync();
  ok(/Code\.gs has no API key\. Put yours back on the API_KEY line/.test(r.toast) && /New version/.test(r.toast), 'placeholder key: says to put the key back and deploy a new version');
  mode = 'html'; r = await sync();
  ok(/answered, but not with the trip/.test(r.toast) && /“Anyone”/.test(r.toast) && /^Can't sync/.test(r.badge), 'a web page instead of data: points at the deployment\'s access and URL');
  mode = 'blocked'; r = await sync();
  ok(/answered, but not with the trip/.test(r.toast) && /^Can't sync/.test(r.badge), 'a reply the browser won\'t read (sign-in page) is not taken for no signal');
  mode = 'boom'; r = await sync();
  ok(/the Sheet's script said “Exception: Range not found”/.test(r.toast), 'the script\'s own error is quoted');
  mode = 'net'; r = await sync();
  ok(/Offline — using saved copy/.test(r.toast) && /^1 waiting to send$/.test(r.badge), 'no connection at all: still "Offline", ' + r.badge);
  ok(r.q === 1, 'the edit is still queued after every kind of failure');

  console.log('\n4. Settings');
  mode = 'badkey'; await sync();
  await page.click('#btnSettings'); await wait(300);
  ok(/Last sync[\s\S]*doesn't match the one in Code\.gs/.test(await page.textContent('#sheetBody')), 'Settings shows why the last sync failed');
  await page.screenshot({ path: env.out('sync-errors-settings.png') });
  await page.click('[data-act="test-cfg"]'); await wait(900);
  ok(/doesn't match the one in Code\.gs/.test(await page.textContent('#toast')), 'Test says why too');
  await page.evaluate(() => closeSheet()); await wait(200);

  console.log('\n5. fixed');
  mode = 'ok'; r = await sync();
  ok(/^Synced$/.test(r.badge) && r.q === 0, 'badge back to Synced, queue empty');
  ok(env.rows('Locations').some(l => l.id === lid && l.notes === 'Queued while the key was wrong'), 'the queued edit reached the Sheet');
  await page.click('#btnSettings'); await wait(300);
  ok(!/Last sync/.test(await page.textContent('#sheetBody')), 'no leftover warning in Settings');
  await page.screenshot({ path: env.out('sync-errors.png') });
  ok(!page.errs.length, 'no JS errors ' + page.errs.join('; '));
});
