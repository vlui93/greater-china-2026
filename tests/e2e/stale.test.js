/* A phone that hasn't reached the Sheet for over 12 hours says so, under the
   sync badge: its saved copy may miss changes the others made, and "Offline"
   alone doesn't say for how long. Time is moved on with the page clock; the
   app is brought back to the front the way a phone does it (visibilitychange). */
const { suite } = require('./lib');

suite({}, async (env) => {
  const { ok, wait } = env;
  let offline = false;
  const page = await env.phone({ context: { hasTouch: true, isMobile: true } });
  await page.ctx.route('**/macros/s/**', route => offline ? route.abort('internetdisconnected') : route.fallback());
  const H = 3600000;
  const bar = async (sel) => page.evaluate(s => { const b = document.querySelector(s || '#view-today .stalebar'); return b && !b.hidden && getComputedStyle(b).display !== 'none' ? b.innerText.trim() : ''; }, sel);
  const backAt = async (ms) => { await page.clock.setSystemTime(new Date(ms)); await page.evaluate(() => document.dispatchEvent(new Event('visibilitychange'))); await wait(700); };

  console.log('\n1. just synced');
  const t0 = await page.evaluate(() => JSON.parse(localStorage.getItem('gct.synced') || '0'));
  const now = await page.evaluate(() => Date.now());
  ok(t0 > 0 && Math.abs(now - t0) < 60000, 'a successful sync records its time on the phone');
  ok(await bar() === '', 'no banner right after a sync');

  console.log('\n2. no signal for a while');
  offline = true;
  await backAt(t0 + 1 * H);
  { const bd=(await page.textContent('#view-today .syncbadge')).trim(); ok(/Offline/.test(bd), 'an hour later, no signal: badge says Offline (' + bd + ')'); }
  ok(await bar() === '', 'no banner after an hour');
  await backAt(t0 + 13 * H);
  const b13 = await bar();
  ok(/^Last synced with the Sheet 13 h ago — changes the others made since then aren't on this phone\./.test(b13), 'after 13 hours: "' + b13 + '"');
  ok(/Sync now/.test(b13), 'with a Sync now button');
  await page.screenshot({ path: env.out('stale.png') });
  await page.click('[data-view="prep"]'); await wait(300);
  ok(/13 h ago/.test(await bar('#view-prep .stalebar')), 'the other tabs show it too');
  await page.click('[data-view="today"]'); await wait(300);
  await backAt(t0 + 74 * H);
  ok(/Last synced with the Sheet 3 days ago/.test(await bar()), 'counts in days once it is over two');

  console.log('\n3. a phone with no record yet');
  await page.evaluate(() => { window.__keep = localStorage.getItem('gct.synced'); localStorage.removeItem('gct.synced'); updateStatus(); });
  ok(await bar() === '', 'no banner until this phone has synced once with this version');
  await page.evaluate(() => { localStorage.setItem('gct.synced', window.__keep); updateStatus(); });

  console.log('\n4. back online');
  offline = false;
  await page.click('#view-today .stalebar [data-act="sync"]'); await wait(900);
  ok(await bar() === '', 'Sync now clears it');
  ok(/^Synced$/.test((await page.textContent('#view-today .syncbadge')).trim()), 'badge: Synced');
  ok(!page.errs.length, 'no JS errors ' + page.errs.join('; '));
});
