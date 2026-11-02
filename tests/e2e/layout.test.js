/* Nothing runs past the right edge of a narrow phone, on any screen or sheet.
   Date and time boxes once did: the phone draws them and they won't shrink
   below their own width, so two side by side ran into each other — on an
   iPhone at normal widths. Chromium shows the same at 320px, so that's the
   width checked here, with 390 for a common iPhone. Strips meant to scroll
   sideways (day chips, filters, tickets) and maps are left out. */
const { suite, fixturePath } = require('./lib');
const fs = require('fs');

suite({}, async (env) => {
  const { ok } = env;
  const SCROLLERS = '.daystrip, .filters, .wallet, .leaflet-container';
  for (const w of [320, 390]) {
    console.log('\n' + w + 'px');
    const page = await env.phone({ clock: '2026-10-18T09:00:00+08:00', clockMode: 'install', context: { viewport: { width: w, height: 800 } } });
    const check = async (name, setup, arg) => {
      await page.evaluate(setup, arg); await page.waitForTimeout(450);
      const r = await page.evaluate((SC) => {
        const vw = document.documentElement.clientWidth, bad = new Set();
        const root = document.querySelector('#sheet.open') ? document.querySelector('#sheetBody') : document.querySelector('#app');
        root.querySelectorAll('*').forEach(e => {
          if (e.closest(SC) || !e.getClientRects().length) return;
          const b = e.getBoundingClientRect(); if (!b.width) return;
          if (b.right > vw + 1) bad.add((e.id ? '#' + e.id : e.className && String(e.className).split(' ')[0] || e.tagName.toLowerCase()) + ' +' + Math.round(b.right - vw) + 'px');
        });
        const sw = Math.max(document.documentElement.scrollWidth, document.querySelector('#sheet').scrollWidth) - vw;
        return { bad: [...bad].slice(0, 5), sideways: sw > 1 ? sw : 0 };
      }, SCROLLERS);
      ok(!r.bad.length && !r.sideways, name + (r.bad.length || r.sideways ? ': ' + (r.sideways ? 'scrolls sideways ' + r.sideways + 'px; ' : '') + r.bad.join(', ') : ''));
    };
    await check('Home, a day', () => { closeSheet(); homeMode = 'day'; ui.day = '2026-10-18'; setView('today'); });
    await check('Home, trip overview', () => { closeSheet(); homeMode = 'trip'; setView('today'); });
    await check('All Days', () => { closeSheet(); setView('days'); });
    await check('Locations', () => { closeSheet(); setView('places'); });
    await check('Bookings', () => { closeSheet(); setView('bookings'); });
    for (const t of ['checklist', 'packing', 'guide']) await check('Prep, ' + t, t => { closeSheet(); ui.prepTab = t; setView('prep'); }, t);
    await check('Settings', () => { closeSheet(); settingsForm(); });
    await check('A place', () => { closeSheet(); locationDetail(store.data.locations[1].id); });
    await check('Edit place', () => { closeSheet(); locationForm(store.data.locations[1].id); });
    await check('Checklist item', () => { closeSheet(); checklistForm('shared', null, 'task', ''); });
    await check('Booking form (dates and times side by side)', () => { closeSheet(); bookingForm(null, 'flight'); });
    await check('New trip (first and last day side by side)', () => { closeSheet(); tripForm(null); });
    await check('New city', () => { closeSheet(); cityForm(null); });
    await check('Plan with AI (plan from / to side by side)', () => { closeSheet(); setView('days'); document.querySelector('[data-act="ai-plan"]').click(); });
    await page.waitForTimeout(500);
    await check('Plan with AI, the check before importing', t => { document.getElementById('ai_reply').value = t; aiRead(); }, fs.readFileSync(fixturePath('ai-reply.txt'), 'utf8'));
    await check('Recently deleted', () => { closeSheet(); deletePlace(store.data.locations[2].id).then(() => binSheet()); });
    if (w === 390) { await page.evaluate(() => { closeSheet(); setView('days'); document.querySelector('[data-act="ai-plan"]').click(); }); await page.waitForTimeout(500); await page.screenshot({ path: env.out('layout-ai-dates.png') }); }
    ok(!page.errs.length, 'no JS errors ' + page.errs.join('; '));
  }
});
