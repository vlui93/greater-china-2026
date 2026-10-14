/* Swiping between days on a phone, the ends of the trip, gestures that are not day swipes, and the arrow keys. */
const { suite, trip, fixture, fixturePath, swCache } = require('./lib');
const fs = require('fs'), path = require('path');

suite({}, async (env) => {
  const { ok, wait, rows, tab } = env;
  const page = await env.phone({ context: { hasTouch: true, isMobile: true } });
  const cdp=await page.ctx.newCDPSession(page);
  const swipe=async(x0,x1,y,steps,ms)=>{ y=y||420; steps=steps||8; ms=ms||25;
    await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:x0,y}]});
    for(let i=1;i<=steps;i++){ await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:x0+(x1-x0)*i/steps,y:y+i}]}); await wait(ms); }
    await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await wait(600); };
  const at=()=>page.evaluate(()=>homeMode==="trip"?"trip":ui.day);
  await page.evaluate(()=>{ homeMode="day"; ui.day="2026-10-18"; setView("today"); }); await wait(300);
  ok(/Swipe left or right/.test(await page.innerText('#toast')), 'first time on a phone: says the days can be swiped');

  console.log('\n1. swipe between days');
  await swipe(300,80); ok(await at()==='2026-10-19', 'swipe left: next day');
  ok(/Day 4/.test(await page.innerText('#viewTitle')), 'title follows');
  await swipe(80,320); ok(await at()==='2026-10-18', 'swipe right: the day before');
  await swipe(300,220,420,8,70); ok(await at()==='2026-10-18', 'a short, slow drag springs back');
  await swipe(300,250,420,2,5); ok(await at()==='2026-10-19', 'a quick flick is enough');
  ok(await page.evaluate(()=>$("#view-today").style.transform===""), 'page settles back in place');

  console.log('\n2. the ends');
  await page.evaluate(()=>{ ui.day="2026-10-16"; render(); }); await wait(200);
  await swipe(80,320); ok(await at()==='trip', 'right from Day 1: the trip overview');
  await swipe(80,320); ok(await at()==='trip', 'nothing before the overview');
  await swipe(300,80); ok(await at()==='2026-10-16', 'left from the overview: Day 1');
  await page.evaluate(()=>{ ui.day="2026-11-01"; render(); }); await wait(200);
  await swipe(300,80); ok(await at()==='2026-11-01', 'nothing after the last day');

  console.log('\n3. gestures that are not day swipes');
  await page.evaluate(()=>{ ui.day="2026-10-20"; render(); }); await wait(200);
  const sy=await page.evaluate(()=>{ const r=$("#view-today .daystrip").getBoundingClientRect(); return r.top+r.height/2; });
  await swipe(300,80,sy); ok(await at()==='2026-10-20', 'dragging the day chips scrolls them, not the day');
  await cdp.send('Input.dispatchTouchEvent',{type:'touchStart',touchPoints:[{x:200,y:600}]});
  for(let i=1;i<=8;i++){ await cdp.send('Input.dispatchTouchEvent',{type:'touchMove',touchPoints:[{x:200+i*6,y:600-i*30}]}); await wait(20); }
  await cdp.send('Input.dispatchTouchEvent',{type:'touchEnd',touchPoints:[]}); await wait(500);
  ok(await at()==='2026-10-20', 'a mostly-vertical drag scrolls, not swipes');
  await page.evaluate(()=>{ ui.day="2026-11-01"; render(); }); await wait(200);
  const chip=await page.evaluate(()=>{ const s=$("#view-today .daystrip"), a=s.querySelector('[aria-current="true"]'); const r=a.getBoundingClientRect(); return r.left>=0 && r.right<=window.innerWidth; });
  ok(chip, 'the open day\'s chip is scrolled into view');
  await page.evaluate(()=>settingsForm()); await wait(300);
  await swipe(300,80); ok(await at()==='2026-11-01', 'no swiping under an open sheet');
  await page.evaluate(()=>closeSheet());

  console.log('\n4. keyboard');
  await page.evaluate(()=>{ ui.day="2026-10-22"; render(); }); await wait(200);
  await page.keyboard.press('ArrowRight'); await wait(200); ok(await at()==='2026-10-23', 'arrow keys on a computer');
  await page.keyboard.press('ArrowLeft'); await wait(200); ok(await at()==='2026-10-22', 'and back');
});
