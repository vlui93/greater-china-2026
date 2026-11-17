/* Ask AI about one day: a prompt holding what is left of the day's plan, what
   has been done, the other unvisited places in the same city, and who is
   travelling; the reply read and previewed like any AI plan; stops added to
   that day and nothing removed; no pins taken from the AI. */
const { suite, trip } = require('./lib');

suite({}, async (env) => {
  const { ok, wait, rows } = env;
  const T = trip(), day = '2026-10-18';
  const loc = id => T.locations.find(l => l.id === id);
  const stops = T.schedule.filter(s => s.date === day).sort((a, b) => a.order_index - b.order_index);
  const city = loc(stops[0].location_id).city;
  const doneId = stops[0].location_id;
  env.box.post('saveLocation', { id: doneId, visited: day });
  const onDay = new Set(stops.map(s => s.location_id));
  const others = T.locations.filter(l => l.city === city && !onDay.has(l.id) && l.type !== 'hotel');
  const elsewhere = T.locations.find(l => l.city !== city && l.type !== 'hotel');
  const page = await env.phone({ clock: day + 'T09:00:00+08:00', clockMode: 'install', context: { permissions: ['clipboard-read', 'clipboard-write'] },
    init: { fn: () => { if (!localStorage.getItem('gct.aiprofile')) localStorage.setItem('gct.aiprofile', JSON.stringify({ who: '3 adults', langs: 'English, Mandarin', spice: 'mild', diet: 'no offal' })); } } });
  await page.evaluate(d => { homeMode = 'day'; ui.day = d; setView('today'); }, day); await wait(400);

  console.log('\n1. from the day');
  ok(await page.isVisible('#view-today [data-act="ai-day"]'), 'the day has an Ask AI button');
  await page.click('#view-today [data-act="ai-day"]'); await wait(700);
  ok((await page.textContent('#sheetTitle')).trim() === 'Ask AI · Day 3' && /never removes one/.test(await page.textContent('#sheetBody')), 'it opens for that day, and says a reply only adds');
  ok(new RegExp('\\(' + (stops.length - 1) + ' of ' + stops.length + ' stops\\)').test(await page.textContent('#sheetBody')), 'and how much of the day is left');

  console.log('\n2. what the prompt carries');
  await page.fill('#aid_ask', 'It is raining and we have three hours before dinner. Somewhere indoors.'); await wait(200);
  const P = await page.inputValue('#ai_prompt');
  const part = (a, b) => { const i = P.indexOf(a), j = b ? P.indexOf(b, i) : P.length; return i < 0 ? '' : P.slice(i, j < 0 ? P.length : j); };
  ok(P.includes('Date: ' + day) && P.includes(', in ' + city) && /Time now: 09:00/.test(P), 'the date, the city and the time now');
  ok(P.includes('It is raining and we have three hours before dinner. Somewhere indoors.'), 'what was typed');
  const still = part("STILL ON THE DAY'S PLAN", 'ALREADY DONE TODAY');
  ok(stops.slice(1).every(s => still.includes(loc(s.location_id).name_en) && still.includes(String(s.planned_time).slice(0, 5))) && !still.includes(loc(doneId).name_en), 'the stops still to come, with their times — not the one already visited');
  ok(part('ALREADY DONE TODAY', 'OTHER PLACES').includes(loc(doneId).name_en), 'the one already done, as done');
  const oth = part('OTHER PLACES ON OUR LIST HERE', '\nUS');
  ok(others.length > 0 && others.every(l => oth.includes(l.name_en)) && !oth.includes(elsewhere.name_en) && !T.locations.filter(l => l.type === 'hotel').some(h => oth.includes(h.name_en)), 'the other ' + others.length + ' unvisited places in ' + city + ' — none from other cities, no hotels');
  ok(/Travellers: 3 adults/.test(P) && /Languages we speak: English, Mandarin/.test(P) && /Food: less spicy to non-spicy.*no offal/.test(P), 'who is travelling and how they eat, from the saved profile');
  ok(/- No coordinates\./.test(P) && !/\b(lat|lng)\b/.test(P) && !/\d{2}\.\d{4}/.test(P), 'asks for no coordinates, and sends none');
  const fmt = JSON.parse(P.slice(P.lastIndexOf('{"kind"')));
  ok(fmt.kind === 'trip-ai-plan' && fmt.days[0].date === day && !fmt.tasks, 'ends with the reply format, for this one day');
  await page.click('[data-act="aid-copy"]'); await wait(300);
  ok(await page.evaluate(() => navigator.clipboard.readText()) === await page.inputValue('#ai_prompt') && /Prompt copied/.test(await page.textContent('#toast')), 'Copy puts exactly that on the clipboard');
  await page.screenshot({ path: env.out('asktoday.png'), fullPage: true });

  console.log('\n3. the reply');
  const reuse = others[0];
  const reply = 'Sure! Here is my suggestion:\n```json\n' + JSON.stringify({ kind: 'trip-ai-plan', version: 1,
    places: [{ name_en: 'Test Indoor Gallery', name_zh: '測試室內畫廊', city, type: 'attraction', background: 'An invented gallery, for the test.', source: 'https://example.com/gallery', lat: 22.3, lng: 114.2 }],
    days: [{ date: day, stops: [{ place: reuse.name_en, time: '14:00', note: 'Indoors; instead of the market' },
      { place: 'Test Indoor Gallery', time: '15:30', note: 'Ten minutes away' }, { place: others[1].name_en, time: '16:30', optional: true, note: 'If the rain stops' }] }] }) + '\n```\nEnjoy!';
  await page.fill('#ai_reply', reply); await page.click('[data-act="ai-read"]'); await wait(500);
  ok(/Test Indoor Gallery/.test(await page.textContent('#sheetBody')) && await page.$('[data-act="ai-import"]'), 'the reply is read and shown for checking first');
  await page.click('[data-act="ai-back"]'); await wait(400);
  ok((await page.textContent('#sheetTitle')).trim() === 'Ask AI · Day 3', 'Back returns to this day\'s question, not the whole-trip form');
  await page.fill('#ai_reply', reply); await page.click('[data-act="ai-read"]'); await wait(400);
  const before = await page.evaluate(d => store.dayStops(d).map(s => s.id), day);
  await page.click('[data-act="ai-import"]'); await wait(900);
  const after = await page.evaluate(d => store.dayStops(d).map(s => ({ id: s.id, lid: s.location_id, t: String(s.planned_time).slice(0, 5), notes: s.notes || '' })), day);
  ok(before.every(id => after.some(s => s.id === id)) && after.length === before.length + 3, 'three stops added to the day; every stop that was there is still there');
  const gal = await page.evaluate(() => store.data.locations.find(l => l.name_en === 'Test Indoor Gallery'));
  ok(after.some(s => s.lid === reuse.id && s.t === '14:00') && gal && after.some(s => s.lid === gal.id && s.t === '15:30'), 'a place already on the list is scheduled as itself; the new one is added and scheduled');
  ok(/^OPTIONAL/.test(after.find(s => s.lid === others[1].id && s.t === '16:30').notes), 'the fall-back idea comes in as OPTIONAL');
  ok(gal.lat === '' || gal.lat == null || isNaN(parseFloat(gal.lat)), 'the AI\'s pin for the new place was not taken (' + JSON.stringify(gal.lat) + ')');
  ok(/^AI draft/.test(gal.notes) && /example\.com\/gallery/.test(gal.notes), 'it is marked "AI draft" with its source');
  ok(rows('Schedule').filter(s => s.date === day).length === before.length + 3 && rows('Locations').some(l => l.name_en === 'Test Indoor Gallery' && !l.lat), 'and the Sheet has the same');

  console.log('\n4. a day that isn\'t today');
  await page.evaluate(() => closeSheet());
  await page.evaluate(() => aiDayForm('2026-10-22')); await wait(400);
  const P2 = await page.inputValue('#ai_prompt');
  ok(P2.includes('Date: 2026-10-22') && !/Time now/.test(P2) && JSON.parse(P2.slice(P2.lastIndexOf('{"kind"'))).days[0].date === '2026-10-22', 'the prompt is for that day, with no "time now"');
  await page.evaluate(() => { closeSheet(); setView('days'); document.querySelector('[data-act="ai-plan"]').click(); }); await wait(600);
  await page.fill('#ai_reply', reply); await page.click('[data-act="ai-read"]'); await wait(400);
  await page.click('[data-act="ai-back"]'); await wait(400);
  ok((await page.textContent('#sheetTitle')).trim() === 'Plan with AI', 'and from the whole-trip form, Back still returns there');
  ok(!page.errs.length, 'no JS errors ' + page.errs.join('; '));
});
