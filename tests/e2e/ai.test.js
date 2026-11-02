/* Plan with any AI: a form writes the prompt, any AI app answers, the reply
   is pasted back, previewed and imported. The reply here is invented and
   untidy on purpose — chat around it, a code fence, a trailing comma, a place
   that's already in the trip, a stop at a place that isn't anywhere, a day
   outside the trip, coordinates (which are never taken). */
const { suite, fixturePath } = require('./lib');
const fs = require('fs');

suite({}, async (env) => {
  const { ok, wait, rows } = env;
  const page = await env.phone({ context: { permissions: ['clipboard-read', 'clipboard-write'] } });
  const prompt = () => page.inputValue('#ai_prompt');
  await page.evaluate(() => setView('days')); await wait(300);

  console.log('\n1. the form writes the prompt');
  await page.click('[data-act="ai-plan"]'); await wait(800);
  await page.screenshot({ path: env.out('ai-form.png') });
  let p = await prompt();
  ok(/Dates: 2026-10-16 to 2026-11-01/.test(p) && /Hong Kong — /.test(p), 'prompt has the trip\'s dates and, as a start, its cities from the plan');
  ok(/Test Peak \(測試山頂\) — Hong Kong/.test(p), 'and the places already in the plan, so they aren\'t suggested again');
  ok(/"kind":"trip-ai-plan"/.test(p) && /JSON only/.test(p) && /No coordinates/.test(p) && /source/.test(p), 'and the format, JSON only, sources, no coordinates');
  await page.fill('#ai_who', '3 adults'); await page.fill('#ai_langs', 'English, Cantonese');
  await page.selectOption('#ai_spice', 'mild'); await page.uncheck('#ai_inc_tasks'); await wait(200);
  p = await prompt();
  ok(/Travellers: 3 adults/.test(p) && /less spicy to non-spicy/.test(p) && /English, Cantonese \(no translation help/.test(p), 'what you type goes into the prompt as you type');
  ok(!/"tasks"/.test(p) && !/- tasks:/.test(p), 'unticking a section takes it out of the prompt');
  await page.check('#ai_inc_tasks'); await wait(100);
  await page.click('[data-act="ai-copy"]'); await wait(400);
  ok(await page.evaluate(() => navigator.clipboard.readText()) === await prompt(), 'Copy puts the prompt on the clipboard');
  await page.evaluate(() => closeSheet()); await page.click('[data-act="ai-plan"]'); await wait(400);
  ok(await page.inputValue('#ai_who') === '3 adults' && await page.inputValue('#ai_spice') === 'mild', 'the form remembers what you typed');

  console.log('\n2. replies that aren\'t usable say why');
  await page.fill('#ai_reply', 'Sorry, I can\'t help with that.'); await page.click('[data-act="ai-read"]'); await wait(200);
  ok(/no data in that reply/.test(await page.textContent('#ai_err')), 'no data: says so');
  await page.fill('#ai_reply', '{"kind":"trip-ai-plan","places":[{"name_en":"Half'); await page.click('[data-act="ai-read"]'); await wait(200);
  ok(/cut off/.test(await page.textContent('#ai_err')), 'cut off half-way: says so');

  console.log('\n3. preview');
  await page.fill('#ai_reply', fs.readFileSync(fixturePath('ai-reply.txt'), 'utf8')); await page.click('[data-act="ai-read"]'); await wait(400);
  const pv = await page.textContent('#sheetBody');
  ok(/Places · 3 new, 1 already here/.test(pv), 'counts new places and spots one already in the trip');
  ok(/Test Mountain Town[^·]*· attraction · new city/.test(pv), 'flags a city the trip doesn\'t have');
  ok(/Test Hotpot Garden[\s\S]*?Chengdu · restaurant · Mild options · no source/.test(pv), '"Food" read as a restaurant, MILD as Mild options, and the missing source shown');
  ok(/outside this trip's dates, left out/.test(pv) && /Nowhere Cafe — not in the list, left out/.test(pv), 'a day outside the trip and a stop at an unknown place are left out');
  ok(/Checklist · 2/.test(pv), 'two tasks');
  await page.uncheck('#sheetBody input[data-k="p:3"]');
  ok(await page.$eval('#sheetBody input[data-np="3"]', c => !c.checked && c.disabled), 'unticking a new place unticks its stops on screen');
  await page.check('#sheetBody input[data-k="p:3"]');
  ok(await page.$eval('#sheetBody input[data-np="3"]', c => c.checked && !c.disabled), 'and ticking it back restores them');
  await page.uncheck('#sheetBody input[data-k="p:3"]');
  await page.screenshot({ path: env.out('ai-preview.png') });

  console.log('\n4. import');
  await page.click('[data-act="ai-import"]'); await wait(800);
  const t = await page.textContent('#toast');
  ok(/^Imported 2 places, 3 stops, 2 tasks, 2 day names$/.test(t.trim()), 'toast: "' + t + '"');
  const L = await page.evaluate(() => store.data.locations.filter(l => /^Test (Harbour Noodles|Hotpot Garden|Tea Village)$/.test(l.name_en)).map(l => ({ n: l.name_en, type: l.type, notes: l.notes, dish: l.dishes_to_order, lat: l.lat })));
  const nood = L.find(l => l.n === 'Test Harbour Noodles'), hot = L.find(l => l.n === 'Test Hotpot Garden');
  ok(L.length === 2 && !L.some(l => l.n === 'Test Tea Village'), 'the unticked place stayed out');
  ok(/^AI draft — check/.test(nood.notes) && /Spice: none/.test(nood.notes) && /Source: https:\/\/example.com\/test-noodles/.test(nood.notes) && /Hours: check/.test(nood.notes), 'notes: AI draft, spice, hours, source');
  ok(nood.dish === 'Wonton noodles\nBeef brisket', 'what to order, one per line');
  ok(hot.type === 'restaurant' && /Spice: mild options — clear-broth pot, steamed fish/.test(hot.notes) && /Source: none given/.test(hot.notes), 'mild dishes named; no source is said plainly');
  ok(L.every(l => l.lat === ''), 'no pins taken from the AI');
  const S = await page.evaluate(() => store.data.schedule.filter(s => s.date === '2026-10-18' || s.date === '2026-10-28').map(s => ({ d: s.date, lid: s.location_id, t: s.planned_time, n: s.notes })));
  ok(S.some(s => s.d === '2026-10-18' && s.lid === 'fx-hk-peak' && s.t === '09:00' && s.n === 'early'), 'a stop at the place already here, time tidied to 09:00');
  ok(S.some(s => s.d === '2026-10-28' && /^OPTIONAL — mild alternative$/.test(s.n)), 'an optional stop becomes an OPTIONAL alternative');
  ok((rows('Days').find(d => d.date === '2026-10-18') || {}).label === 'Kowloon food day · light' && (rows('Days').find(d => d.date === '2026-10-28') || {}).label === 'heavy', 'day names, with light/heavy, in the Sheet');
  ok(rows('Locations').some(l => l.name_en === 'Test Harbour Noodles') && rows('Schedule').filter(s => /^sc-/.test(s.id) && (s.date === '2026-10-18' || s.date === '2026-10-28')).length >= 3, 'places and stops reached the Sheet');
  const tk = rows('Checklist').filter(c => /test cable car|tea village opening/.test(c.text));
  ok(tk.length === 2 && tk.some(c => c.due === '2026-10-10') && tk.some(c => c.due === ''), 'tasks in the checklist, a bad date left blank');
  await page.evaluate(() => setView('places')); await wait(300);
  ok(/AI draft/.test(await page.$eval('#placeResults .locwrap:has([data-lid^="loc-"]) .mt', e => e.textContent)), 'Locations marks it AI draft');
  ok(!page.errs.length, 'no JS errors ' + page.errs.join('; '));
});
