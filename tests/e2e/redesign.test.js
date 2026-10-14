/* The trip overview and day view: route from the hotel stays, countdowns, day
   chips, time-of-day groups, booking labels, Chinese shown in Simplified with
   the data untouched, Nearby links, and where you are during the trip. */
const { suite, trip, fixturePath } = require('./lib');

suite({}, async (env) => {
  const { ok, wait } = env;
  const T = trip();
  const L = id => T.locations.find(l => l.id === id);
  const phone = async (when, tz, blockT2s) => {
    const p = await env.phone({ static: () => T, tz: tz || 'Australia/Sydney', clock: when,
      before: blockT2s ? ctx => ctx.route('**/t2s.js', r => r.fulfill({ status: 404, body: '' })) : null });
    await env.importFile(p, fixturePath('trip-notes.json'), 1500);
    await p.click('nav.tabs button[data-view="today"]'); await wait(300);
    return p;
  };

  console.log('\n1. before the trip: Home is the overview');
  const A = await phone('2026-10-03T20:28:00+10:00');
  ok(await A.$('#view-today .triphero') !== null, 'trip hero shown on Home');
  ok(/Trip/.test(await A.textContent('#viewTitle')), 'title: ' + await A.textContent('#viewTitle'));
  const route = await A.$$eval('.route li', ls => ls.map(l => l.querySelector('.en').firstChild.textContent + '|' + l.querySelector('.zh').textContent + '|' + l.querySelector('.n').textContent));
  ok(route.join(',') === 'Hong Kong|香港|4 nights,Guangzhou|广州|4 nights,Chengdu|成都|7 nights', 'route from the hotel stays: ' + route.join(', '));
  const legs = await A.$$eval('.route .leg', ls => ls.map(l => l.textContent));
  ok(legs.join(',') === '09:00,11:20', 'legs from the bookings: ' + legs.join(', '));
  const hero = await A.textContent('.triphero .c'), cd = await A.textContent('.nextbk .cd');
  ok(/13 days/.test(hero) && /13 days/.test(cd), 'both countdowns agree: "' + hero + '" / "' + cd.replace(/\s+/g, ' ') + '"');
  ok(/香港 · 澳门 · 广州 · 成都/.test(await A.textContent('.triphero .tz')), 'cities in Chinese, in visiting order');
  ok(await A.$eval('.daychip.trip', e => e.getAttribute('aria-current')) === 'true', 'Trip chip selected');
  await A.click('button.daychip[data-date="2026-10-19"]'); await wait(250);
  ok(await A.$('#view-today .triphero') === null && /Day 4 · 第4天/.test(await A.textContent('#viewTitle')), 'day chip opens the day: ' + await A.textContent('#viewTitle'));
  await A.click('nav.tabs button[data-view="prep"]'); await wait(150);
  await A.click('nav.tabs button[data-view="today"]'); await wait(150);
  ok(await A.$('#stopList') !== null, 'Home stays on that day while the app is open');
  await A.click('.daychip.trip'); await wait(200);
  ok(await A.$('#view-today .triphero') !== null, 'Trip chip goes back to the overview');
  await A.click('.tile[data-v="bookings"]'); await wait(200);
  ok(!(await A.$eval('#view-bookings', e => e.hidden)), 'tiles open Bookings');

  console.log('\n2. a day: time-of-day groups, booking labels, reorder still works');
  await A.click('nav.tabs button[data-view="today"]'); await wait(150);
  await A.click('button.daychip[data-date="2026-10-19"]'); await wait(250);
  const tods = await A.$$eval('#stopList > .tod', e => e.map(x => x.textContent));
  ok(tods.join(',') === 'Morning上午,Afternoon下午,Evening晚上', 'labels: ' + tods.join(', '));
  const cable = await A.$eval('.stop[data-lid="fx-hk-cable"] .pill.todo', e => e.textContent).catch(() => null);
  ok(cable === 'To book · 待订', 'Test Cable Car shows "' + cable + '" while its booking task is open');
  await A.evaluate(() => { store.data.checklist.forEach(i => { if (i.location_id === 'fx-hk-cable' && /^Book/.test(i.text)) i.done = '1'; }); render(); });
  ok(await A.$('.stop[data-lid="fx-hk-cable"] .pill.ok') !== null, 'ticking it shows Booked · 已订');
  ok(await A.$('.stop[data-lid="fx-hk-town"] .pill.ok, .stop[data-lid="fx-hk-town"] .pill.todo') === null, 'no label where nothing needs booking');
  const before = await A.evaluate(() => store.dayStops('2026-10-19').map(s => s.location_id));
  await A.click('.stop[data-lid="' + before[2] + '"] [data-act="up"]'); await wait(300);
  const after = await A.evaluate(() => store.dayStops('2026-10-19').map(s => s.location_id));
  ok(after[1] === before[2] && after[2] === before[1] && after.length === before.length, 'Move up still swaps two stops: ' + after.slice(0, 3).join(' > '));

  console.log('\n3. Chinese in Simplified, data untouched');
  await A.click('nav.tabs button[data-view="places"]'); await wait(200);
  await A.fill('#q', '钟楼'); await wait(200);
  const found = await A.$$eval('#placeResults .locrow .zh', e => e.map(x => x.innerHTML));
  ok(found.length === 1 && /测试<mark>钟楼<\/mark>/.test(found[0]), 'Simplified search finds 測試鐘樓, shown as ' + found[0]);
  ok(await A.evaluate(() => store.loc('fx-hk-clock').name_zh) === '測試鐘樓', 'the stored name is unchanged');
  await A.click('#view-places [data-act="open"][data-lid="fx-hk-clock"]'); await wait(400);
  ok(await A.textContent('.readaloud .big') === '测试钟楼', 'Show-this card: ' + await A.textContent('.readaloud .big'));
  await A.evaluate(() => locationForm('fx-hk-clock')); await wait(200);
  ok(await A.inputValue('#f_name_zh') === '測試鐘樓', 'edit form keeps the original');
  await A.evaluate(() => closeSheet());

  console.log('\n4. Nearby');
  const hk = L('fx-hk-clock'), cn = L('fx-cd-hotpot');
  const nb = await A.evaluate(() => ({ g: nearbyUrls(store.loc('fx-hk-clock'), 'wc'), a: nearbyUrls(store.loc('fx-cd-hotpot'), 'coffee') }));
  const at = Number(hk.lat) + ',' + Number(hk.lng);
  ok(nb.g.scheme.includes('comgooglemaps://?q=public%20toilet&center=' + at) && nb.g.web.includes('maps/search/public%20toilet/@' + at + ',16z'), 'Google: ' + nb.g.web);
  ok(nb.a.scheme.includes('iosamap://arroundpoi?') && nb.a.scheme.includes('keywords=%E5%92%96%E5%95%A1&lat=' + Number(cn.lat) + '&lon=' + Number(cn.lng) + '&dev=1'), 'Amap app gets plain GPS with dev=1');
  const c = nb.a.web.match(/center=([\d.]+),([\d.]+)/);
  ok(c && Math.abs(+c[1] - cn.lng) > 0.002 && Math.abs(+c[2] - cn.lat) > 0.001, 'Amap web gets shifted coordinates: ' + (c && c[0]));
  await A.click('nav.tabs button[data-view="places"]'); await wait(150);
  await A.fill('#q', ''); await wait(100);
  await A.click('#view-places [data-act="open"][data-lid="fx-hk-town"]'); await wait(300);
  ok((await A.$$('.nearby button')).length === 3, 'three Nearby buttons on a pinned place');
  await A.evaluate(() => closeSheet());

  console.log('\n5. during the trip');
  const B = await phone('2026-10-22T09:00:00+08:00', 'Asia/Shanghai');
  ok(await B.$('#stopList') !== null && /Today/.test(await B.textContent('#viewTitle')), 'Home opens on today: ' + await B.textContent('#viewTitle'));
  await B.click('.daychip.trip'); await wait(200);
  const here = await B.$$eval('.route li', ls => ls.map(l => l.className));
  ok(here.join(',') === 'past,here,', 'route marks where you are: ' + here.join(','));
  ok(/Day 7 of 17/.test(await B.textContent('.triphero .c')), await B.textContent('.triphero .c'));

  console.log('\n6. without the character table');
  const C = await phone('2026-10-03T20:28:00+10:00', null, true);
  await C.click('nav.tabs button[data-view="places"]'); await wait(200);
  await C.fill('#q', '鐘樓'); await wait(200);
  ok((await C.$$('#placeResults .locrow')).length === 1, 'still works, showing the original characters');
});
