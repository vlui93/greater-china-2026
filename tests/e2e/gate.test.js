/* First run: the app shows nothing until it is connected, and nothing from a
   trip is in the page before then. Then it connects, caches, and works offline. */
const { suite, trip } = require('./lib');

suite({}, async ({ ok, wait, phone }) => {
  const T = trip();
  let calls = 0, reachable = true;
  const page = await phone({ connect: false, static: () => { calls++; return T; } });
  await page.ctx.unroute('**/macros/s/**');
  await page.ctx.route('**/macros/s/**', r => {
    if (!reachable) return r.abort();
    calls++; r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ ok: true, data: T }) });
  });
  const tripWords = new RegExp(T.locations.slice(0, 6).map(l => l.name_en + '|' + l.name_zh).join('|'));

  console.log('\n1. cold open, nothing configured');
  ok(await page.isVisible('#gate'), 'gate is showing');
  ok(!(await page.isVisible('#app')), 'app is hidden');
  ok(!(await page.isVisible('#tabs')), 'tab bar is hidden');
  ok(!tripWords.test(await page.innerText('body')), 'nothing from the trip is rendered');
  ok(!tripWords.test(await page.content()) && !/fx-hk-|fx-bk-/.test(await page.content()), 'no trip data in the page source either');
  ok(await page.textContent('#gateBtn') === 'Connect', 'button says Connect');

  console.log('\n2. connect with a bad URL');
  reachable = false;
  await page.fill('#g_url', 'https://script.google.com/macros/s/BAD/exec'); await page.fill('#g_key', 'k');
  await page.click('#gateBtn'); await wait(500);
  ok(await page.isVisible('#gate'), 'still gated after a failure');
  ok((await page.textContent('#gateErr')).includes('Could not reach'), 'shows the error');
  ok(await page.textContent('#gateBtn') === 'Try again', 'button becomes Try again');

  console.log('\n3. connect for real');
  reachable = true;
  await page.click('#gateBtn'); await wait(700);
  ok(!(await page.isVisible('#gate')), 'gate dismissed');
  ok(await page.isVisible('#app') && await page.isVisible('#tabs'), 'app and tab bar showing');
  ok(calls > 0, 'it actually called the backend (' + calls + ' calls)');

  console.log('\n4. the trip is there now');
  await page.click('nav.tabs button[data-view="days"]'); await wait(250);
  ok((await page.textContent('#view-days')).includes('Hong Kong'), 'All Days lists the itinerary');
  await page.click('nav.tabs button[data-view="places"]'); await wait(250);
  ok((await page.textContent('#view-places')).includes(T.locations[1].name_en), 'Locations lists the places');

  console.log('\n5. reload keeps it (cached on the phone)');
  await page.reload(); await wait(500);
  ok(!(await page.isVisible('#gate')) && await page.isVisible('#app'), 'no gate on reload');

  console.log('\n6. offline reload still works');
  reachable = false;
  await page.reload(); await wait(600);
  ok(!(await page.isVisible('#gate')), 'cached copy survives an unreachable backend');
  const view = await page.innerText('main');
  ok(view.length > 100, 'the current view still renders offline (' + view.length + ' chars)');
});
