/* The app in parts. Home and Locations need only index.html; Prep, Bookings
   and the set-up screens each arrive the first time they're opened, and the
   service worker keeps them, so they open with no signal too. A file that
   can't be fetched says so and works on the next try. */
const { suite, trip } = require('./lib');
const fs = require('fs'), path = require('path');

suite({}, async (env) => {
  const { ok, wait } = env;
  const T = trip();
  let block = null;
  const page = await env.phone({});
  // Which parts the page has run. (The service worker fetches all of them in
  // the background to keep for offline, so requests alone don't say.)
  const loaded = async () => (await page.evaluate(() => Object.keys(PARTS).filter(p => !isStub(window[PARTS[p][0]])))).join();
  const tags = () => page.$$eval('head script[src]', e => e.map(x => x.getAttribute('src')).join());

  console.log('\n1. what loads when');
  ok(await loaded() === '' && await tags() === '', 'connecting and showing Home runs none of the parts');
  await page.evaluate(() => setView('places')); await wait(300);
  await page.click('#placeResults .locrow .lb'); await wait(300);
  ok(await page.$('#sheet.open') && await loaded() === '', 'nor does Locations, or opening a place');
  await page.evaluate(() => closeSheet());
  await page.evaluate(() => setView('days')); await wait(300);
  ok(await loaded() === '', 'nor All Days');
  const size = fs.statSync(path.join(__dirname, '..', '..', 'index.html')).size;
  ok(size < 240 * 1024, 'index.html is ' + Math.round(size / 1024) + 'KB (it was 318KB with everything in it)');

  await env.go(page, 'prep'); await wait(500);
  ok(await loaded() === 'prep' && /To do|Packing/.test(await page.textContent('#view-prep')), 'opening Prep loads prep.js and shows the tab');
  ok((await page.textContent('#view-prep .syncbadge')).trim().length > 0, 'with its sync badge filled in');
  await page.click('nav.tabs [data-view="today"]'); await env.go(page, 'prep'); await wait(300);
  ok(await tags() === 'prep.js', 'the second time it is already there (loaded once)');
  await env.go(page, 'bookings'); await wait(500);
  ok(await loaded() === 'prep,bookings' && await page.$$eval('#view-bookings .bk', e => e.length) === T.bookings.length, 'Bookings loads bookings.js and lists the ' + T.bookings.length + ' bookings');
  ok((await page.textContent('#view-bookings .syncbadge')).trim().length > 0, 'and its sync badge is filled in, though the tab was drawn late: "' + (await page.textContent('#view-bookings .syncbadge')).trim() + '"');
  await page.click('#btnSettings'); await wait(500);
  ok(await loaded() === 'prep,bookings,manage' && /Web App URL/.test(await page.textContent('#sheetBody')), 'Settings loads manage.js and opens');
  await page.evaluate(() => closeSheet());
  ok(await tags() === 'prep.js,bookings.js,manage.js', 'extras.js (importers, Plan with AI, People) still hasn\'t been needed');

  console.log('\n2. every function a part promises is really in it');
  await page.evaluate(() => loadPart('extras')); await wait(200);
  const missing = await page.evaluate(() => { const m = []; Object.keys(PARTS).forEach(p => PARTS[p].forEach(f => { if (typeof window[f] !== 'function' || isStub(window[f])) m.push(p + '.' + f); })); return m; });
  ok(missing.length === 0, 'all ' + await page.evaluate(() => Object.keys(PARTS).reduce((n, p) => n + PARTS[p].length, 0)) + ' are the real ones once loaded' + (missing.length ? ': missing ' + missing.join(', ') : ''));

  console.log('\n3. a fresh phone that opens straight onto Prep');
  const p2 = await env.phone({ init: { fn: () => { if (!localStorage.getItem('gct.ui')) localStorage.setItem('gct.ui', JSON.stringify({ view: 'prep' })); } } });
  await wait(400);
  ok(/To do|Packing/.test(await p2.textContent('#view-prep')) && await p2.isVisible('#view-prep'), 'the tab it was left on is drawn once its file arrives');
  const v = await p2.evaluate(() => parseBookingText('Flight CA123 on 2026-10-20 at 09:15'));
  ok(v && typeof v === 'object', 'a part\'s function called before its file has loaded still answers, a moment later');

  console.log('\n4. a part that can\'t be fetched');
  // no service worker here, so the file has to come over the network
  const p3 = await env.phone({ context: { serviceWorkers: 'block' }, before: async ctx => {
    await ctx.route(/\/prep\.js(\?.*)?$/, route => block === 'prep' ? route.abort('internetdisconnected') : route.fallback()); } });
  block = 'prep';
  await env.go(p3, 'prep'); await wait(500);
  ok(/Couldn't load that screen/.test(await p3.textContent('#toast')), 'toast: "' + (await p3.textContent('#toast')).trim() + '"');
  ok(!p3.errs.length, 'and no JS error');
  await p3.click('nav.tabs [data-view="today"]'); await wait(200);
  ok(await p3.isVisible('#view-today') && await p3.$$eval('#view-today *', e => e.length) > 5, 'the rest of the app carries on');
  block = null;
  await env.go(p3, 'prep'); await wait(500);
  ok(/To do|Packing/.test(await p3.textContent('#view-prep')), 'and Prep opens on the next try');

  console.log('\n5. with no signal, from what the service worker kept');
  const p4 = await env.phone({});
  await p4.evaluate(() => navigator.serviceWorker.ready); await p4.reload(); await wait(900);
  ok(await p4.evaluate(() => !!navigator.serviceWorker.controller), 'service worker in charge');
  await p4.ctx.setOffline(true);
  await p4.reload(); await wait(900);
  ok(await p4.evaluate(() => store.data.locations.length) === T.locations.length, 'the app opens offline');
  await env.go(p4, 'prep'); await wait(600);
  ok(/To do|Packing/.test(await p4.textContent('#view-prep')), 'Prep opens offline');
  await env.go(p4, 'bookings'); await wait(600);
  ok(await p4.$$eval('#view-bookings .bk', e => e.length) === T.bookings.length, 'Bookings opens offline');
  await p4.click('#btnSettings'); await wait(600);
  ok(/Web App URL/.test(await p4.textContent('#sheetBody')), 'Settings opens offline');
  await p4.evaluate(() => { closeSheet(); return aiForm(); }); await wait(600);
  ok(await p4.$('#sheet.open') && /AI/.test(await p4.textContent('#sheetTitle')), 'Plan with AI opens offline');
  await p4.ctx.setOffline(false);
  ok(!page.errs.length && !p2.errs.length && !p4.errs.length, 'no JS errors ' + page.errs.concat(p2.errs, p4.errs).join('; '));
});
