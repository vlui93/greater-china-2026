/* Getting between stops: legs worked out from the pins, getting-there notes
   imported on the phone and kept through syncs with a backend that has no
   columns for them yet, and every travel line on every day free of NaN. */
const { suite, trip, fixture, fixturePath } = require('./lib');
const fs = require('fs');

suite({}, async (env) => {
  const { ok, wait } = env;
  const NEW = ['getting_there', 'arrive_by', 'tickets'];
  // The backend before the new columns existed, and right after: columns there but empty.
  const OLD = trip(); OLD.locations.forEach(l => NEW.forEach(k => delete l[k]));
  const EMPTY = trip(); EMPTY.locations.forEach(l => NEW.forEach(k => l[k] = ''));
  let backend = OLD;
  const page = await env.phone({ static: b => b.action === 'all' ? backend : b.action === 'ping' ? 'pong' : {} });
  const notes = fixture('trip-notes.json');
  const known = new Set(OLD.locations.map(l => l.id));
  const nGT = notes.locations.filter(x => x.id && known.has(x.id) && x.getting_there).length;
  const nBoth = notes.locations.filter(x => x.id && known.has(x.id) && x.getting_there && x.tickets).length;
  const nMatched = notes.locations.filter(x => x.id && known.has(x.id)).length;

  console.log('\n1. before import (old backend, no notes yet)');
  await page.click('button.daychip[data-date="2026-10-19"]'); await wait(250);
  let legs = await page.$$eval('.stop-leg', els => els.map(e => e.innerText.replace(/\s+/g, ' ').trim()));
  ok(legs.length > 0, 'computed legs render (' + legs.length + ' on day 19)');
  ok(legs.some(t => /MTR|walk|taxi/.test(t)), 'legs name a mode');
  ok(!legs.some(t => /cable car/.test(t)), 'no arrival overrides yet (expected — not imported)');

  console.log('\n2. import the notes file on the phone');
  const toastTxt = await env.importFile(page, fixturePath('trip-notes.json'), 500);
  ok(new RegExp('Updated ' + nMatched + ' places').test(toastTxt), 'toast: "' + toastTxt + '"');
  await page.click('nav.tabs button[data-view="today"]'); await wait(150);
  await page.click('button.daychip[data-date="2026-10-19"]'); await wait(250);
  legs = await page.$$eval('.stop-leg', els => els.map(e => e.innerText.replace(/\s+/g, ' ').trim()));
  ok(legs.some(t => /Test Big Buddha.*cable car/.test(t)), 'Test Cable Car → Test Big Buddha now says cable car');

  console.log('\n3. survives a sync against the OLD backend');
  await page.click('[data-act="sync"]'); await wait(700);
  let kept = await page.evaluate(() => store.data.locations.filter(l => l.getting_there && l.tickets).length);
  ok(kept === nBoth, 'places with getting_there+tickets after sync: ' + kept + ' (want ' + nBoth + ')');

  console.log('\n4. survives a sync against an UPGRADED backend that is still empty');
  backend = EMPTY;
  await page.click('[data-act="sync"]'); await wait(700);
  kept = await page.evaluate(() => store.data.locations.filter(l => l.getting_there).length);
  ok(kept === nGT, 'getting_there still on all ' + kept + ' places');

  console.log('\n5. detail view');
  await page.evaluate(() => locationDetail('fx-hk-peak')); await wait(300);
  const det = await page.innerText('#sheetBody');
  ok(/getting there/i.test(det) && /tickets/i.test(det) && det.includes('HK$99'), 'Getting there + Tickets sections render');

  console.log('\n6. editing a place keeps the new fields');
  await page.evaluate(() => locationForm('fx-hk-peak')); await wait(250);
  ok((await page.inputValue('#f_tickets')).includes('HK$99'), 'tickets field is prefilled');
  await page.fill('#f_notes', 'edited in test'); await page.click('[data-act="save-location"]'); await wait(500);
  const after = await page.evaluate(() => store.loc('fx-hk-peak'));
  ok(after.notes === 'edited in test' && after.tickets.includes('HK$99') && after.arrive_by, 'save kept tickets and arrive_by');

  console.log('\n7. reordering still works with legs inside the cards');
  await page.evaluate(() => closeSheet()); await wait(200);
  await page.click('button.daychip[data-date="2026-10-18"]'); await wait(250);
  const before = await page.$$eval('#stopList > .stop', els => els.map(e => e.dataset.sid));
  await page.click('#stopList > .stop [data-act="down"] >> nth=0'); await wait(500);
  const now = await page.$$eval('#stopList > .stop', els => els.map(e => e.dataset.sid));
  ok(now[0] === before[1] && now[1] === before[0] && now.length === before.length, 'first two stops swapped, none lost');
  ok(await page.$$eval('#stopList > *', els => els.every(e => e.classList.contains('stop') || e.classList.contains('tod'))), '#stopList holds only stop cards and time-of-day labels');

  console.log('\n8. every line the app will show, all 17 days');
  const all = [];
  for (const d of await page.$$eval('button.daychip[data-date]', e => e.map(x => x.dataset.date))) {
    await page.click('button.daychip[data-date="' + d + '"]'); await wait(120);
    const lines = await page.$$eval('.hotelleg, .stop-leg', els => els.map(e => e.innerText.replace(/\s+/g, ' ').trim()));
    lines.forEach(t => all.push(d.slice(5) + '  ' + t));
  }
  fs.writeFileSync(env.out('legs.txt'), all.join('\n') + '\n');
  const per = {}; trip().schedule.forEach(s => per[s.date] = (per[s.date] || 0) + 1);
  const pairs = Object.values(per).reduce((n, k) => n + Math.max(0, k - 1), 0);
  ok(all.length >= pairs, all.length + ' travel lines, at least one per pair of stops (' + pairs + ') — tests/e2e/out/legs.txt');
  ok(!all.some(t => /NaN|undefined|Infinity/.test(t)), 'no NaN / undefined in any line');
});
