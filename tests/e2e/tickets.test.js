/* Adding a ticket from the Tickets row, and an open-return ferry that has no time until you pick a sailing. */
const { suite, trip, fixture, fixturePath, swCache } = require('./lib');
const fs = require('fs'), path = require('path');

suite({}, async (env) => {
  const { ok, wait, rows, tab } = env;
  const page = await env.phone({});
  console.log('\n1. add a ticket from the Tickets row');
  ok(await page.$('.wallet [data-act="bk-new"][data-type="ticket"]')!==null, 'Tickets row ends with + Add a ticket');
  await page.click('.wallet [data-act="bk-new"]'); await wait(200);
  ok(await page.inputValue('#b_type')==='ticket' && !await page.isVisible('#b_number') && !await page.isVisible('#b_arr_date'), 'opens as a ticket: no flight or arrival fields');
  ok(/entry time/i.test(await page.innerText('#b_time_l')), 'time is the entry time');
  await page.fill('#b_description','Test Tower — sunset slot'); await page.fill('#b_date','2026-10-22'); await page.fill('#b_time','17:30');
  await page.fill('#b_confirmation_no','TT123'); await page.fill('#b_ticket_url','https://example.com/t/1');
  await page.click('[data-act="bk-save"]'); await wait(600);
  let r=rows('Bookings').find(b=>b.description==='Test Tower — sunset slot');
  ok(r && r.type==='ticket' && r.time==='17:30' && r.confirmation_no==='TT123', 'saved to the Sheet as a ticket');
  await page.evaluate(()=>{ homeMode="trip"; setView("today"); }); await wait(300);
  ok(/Test Tower/.test(await page.innerText('.wallet')), 'shows on the Tickets row');

  console.log('\n2. an open return ferry');
  await page.click('.wallet [data-act="bk-new"]'); await wait(200);
  await page.selectOption('#b_type','ferry'); await page.dispatchEvent('#b_type','change');
  ok(await page.isVisible('#b_from') && /any sailing/i.test(await page.innerText('#b_open_l')), 'ferry: route fields and "open ticket — any sailing"');
  await page.fill('#b_from','Macau'); await page.fill('#b_to','Hong Kong'); await page.fill('#b_date','2026-10-19');
  await page.check('#b_open'); await page.dispatchEvent('#b_open','change');
  ok(await page.isDisabled('#b_time'), 'time field off when open');
  await page.click('[data-act="bk-save"]'); await wait(600);
  r=rows('Bookings').find(b=>b.from_place==='Macau');
  ok(r && r.time==='open' && r.description==='Macau → Hong Kong' && r.type==='ferry', 'saved: time "open", description from the route');
  await page.evaluate(()=>{ homeMode="trip"; setView("today"); }); await wait(300);
  const tk=await page.evaluate(()=>[...document.querySelectorAll('.wallet .tk')].map(x=>x.innerText.replace(/\s+/g,' ')).find(t=>/Macau → Hong Kong/.test(t))||'');
  ok(/Open/.test(tk) && /\+ Add link/.test(tk), 'Tickets row: "Open", and + Add link for later — '+tk);
  await page.evaluate(()=>setView("bookings")); await wait(200);
  ok(/open — any sailing/i.test(await page.innerText('#view-bookings')), 'Bookings list: open — any sailing');
  await page.evaluate(()=>{ homeMode="day"; ui.day="2026-10-19"; setView("today"); }); await wait(300);
  ok(/Open[\s\S]*Macau → Hong Kong/.test(await page.innerText('.brief')), 'the day briefing lists it as Open');
  ok(await page.$('.travel')===null || !/Macau → Hong Kong/.test(await page.innerText('#view-today .travel').catch(()=>'')), 'no departure card with a made-up time');
  ok(await page.evaluate(()=>{ const b=store.data.bookings.find(x=>x.from_place==="Macau"); return /DTSTART;VALUE=DATE:20261019/.test(buildIcs({days:false,stops:false,bookings:true}).text.split(b.id)[1]||""); }), 'calendar: an all-day event, no invented time');
  await page.evaluate(()=>setView("bookings")); await wait(200);
  const id=await page.evaluate(()=>store.data.bookings.find(x=>x.from_place==="Macau").id);
  await page.click(`.bk[data-bid="${id}"] [data-act="bk"]`); await page.click(`[data-act="bk-edit"][data-bid="${id}"]`); await wait(200);
  ok(await page.isChecked('#b_open') && await page.inputValue('#b_time')==='', 'editing it: Open still ticked');
  await page.uncheck('#b_open'); await page.dispatchEvent('#b_open','change'); await page.fill('#b_time','21:15');
  await page.click('[data-act="bk-save"]'); await wait(500);
  ok(rows('Bookings').find(b=>b.id===id).time==='21:15', 'pick a sailing later: the time replaces "open"');
});
