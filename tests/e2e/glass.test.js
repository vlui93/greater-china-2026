/* The glass layer: a floating capsule tab bar, a header that fades out over
   the page, round glass buttons, sheets with round shoulders. What matters
   more than the look: the tab labels stay readable over anything that scrolls
   under the bar (4.5:1, light and dark), nothing is hidden behind the bar,
   fingers still have 44px to hit, and Reduce Transparency / Increase Contrast
   get solid surfaces. Measured in Chromium; a real iPhone is not checked here. */
const { suite } = require('./lib');

/* Everything measured inside the page */
const probe = () => {
  const rgba = c => { // "rgb(a)(r, g, b[, a])" or "color(srgb r g b [/ a])" -> [r,g,b,a] with r,g,b 0..255
    let m = c.match(/^rgba?\(([^)]+)\)/);
    if (m) { const p = m[1].split(/[,\s\/]+/).filter(Boolean).map(Number); return [p[0], p[1], p[2], p.length > 3 ? p[3] : 1]; }
    m = c.match(/^color\(srgb ([^)]+)\)/);
    if (m) { const p = m[1].split(/[\s\/]+/).filter(Boolean).map(Number); return [p[0] * 255, p[1] * 255, p[2] * 255, p.length > 3 ? p[3] : 1]; }
    throw new Error('colour? ' + c);
  };
  const over = (top, under) => { const a = top[3]; return [0, 1, 2].map(i => top[i] * a + under[i] * (1 - a)).concat(1); };
  const lum = c => { const f = v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); }; return 0.2126 * f(c[0]) + 0.7152 * f(c[1]) + 0.0722 * f(c[2]); };
  const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
  const tmp = document.createElement('i'); document.body.appendChild(tmp);
  const v = name => { tmp.style.color = 'var(' + name + ')'; return rgba(getComputedStyle(tmp).color); };
  const nav = document.querySelector('nav.tabs'), cs = getComputedStyle(nav);
  const sel = nav.querySelector('[aria-selected="true"]'), other = nav.querySelector('[aria-selected="false"]');
  const glass = rgba(cs.backgroundColor), pill = rgba(getComputedStyle(sel).backgroundColor);
  // What can be under the bar: the page, a card, the dark hero, a brand or navigate button, and a photo at either extreme
  const unders = { page: v('--bg'), card: v('--surface'), hero: v('--hero-1'), brand: v('--brand'), navigate: v('--nav-g'), 'a white photo': [255, 255, 255, 1], 'a black photo': [0, 0, 0, 1] };
  const worst = { plain: [99, ''], selected: [99, ''] };
  Object.keys(unders).forEach(k => {
    const bar = over(glass, unders[k]);
    const a = ratio(rgba(getComputedStyle(other).color), bar), b = ratio(rgba(getComputedStyle(sel).color), over(pill, bar));
    if (a < worst.plain[0]) worst.plain = [a, k]; if (b < worst.selected[0]) worst.selected = [b, k];
  });
  tmp.remove();
  const r = nav.getBoundingClientRect(), vw = innerWidth, vh = innerHeight;
  const head = getComputedStyle(document.querySelector('header.top')), fade = getComputedStyle(document.querySelector('header.top'), '::before');
  const btn = document.querySelector('#btnSettings'), bcs = getComputedStyle(btn);   // the header's round button that is always shown
  return {
    alpha: glass[3], pillAlpha: pill[3], worst,
    blur: cs.backdropFilter || cs.webkitBackdropFilter, radius: parseFloat(cs.borderTopLeftRadius), h: r.height,
    left: r.left, right: vw - r.right, bottom: vh - r.bottom, top: r.top,
    tabs: [...nav.querySelectorAll('button')].map(b => { const x = b.getBoundingClientRect(); return [Math.round(x.width), Math.round(x.height)]; }),
    headLine: parseFloat(head.borderBottomWidth), fadeBlur: fade.backdropFilter || fade.webkitBackdropFilter, fadeMask: fade.maskImage || fade.webkitMaskImage,
    btnAlpha: rgba(bcs.backgroundColor)[3], btnBlur: bcs.backdropFilter || bcs.webkitBackdropFilter, btnSize: btn.getBoundingClientRect().width,
    capsule: parseFloat(getComputedStyle(document.querySelector('.btn')).borderTopLeftRadius)
  };
};

suite({}, async (env) => {
  const { ok, wait } = env;
  const open = async (scheme) => env.phone({ clock: '2026-10-18T09:00:00+08:00', clockMode: 'install', context: { colorScheme: scheme, viewport: { width: 390, height: 844 } } });

  for (const scheme of ['light', 'dark']) {
    console.log('\n' + scheme + ': the tab bar');
    const page = await open(scheme);
    await page.evaluate(() => { homeMode = 'day'; setView('today'); }); await wait(300);
    const g = await page.evaluate(probe);
    ok(g.radius >= g.h / 2 - 1 && g.left >= 8 && g.right >= 8 && g.bottom >= 8, 'a capsule, lifted off the edges (' + Math.round(g.left) + 'px sides, ' + Math.round(g.bottom) + 'px above the bottom)');
    ok(g.alpha < 1 && g.alpha >= 0.8 && /blur/.test(g.blur), 'frosted: ' + Math.round(g.alpha * 100) + '% tint over a blur');
    ok(g.pillAlpha > 0, 'the selected tab sits on a pill');
    ok(g.worst.plain[0] >= 4.5, 'tab labels: at least ' + g.worst.plain[0].toFixed(1) + ':1, worst over ' + g.worst.plain[1]);
    ok(g.worst.selected[0] >= 4.5, 'the selected label: at least ' + g.worst.selected[0].toFixed(1) + ':1, worst over ' + g.worst.selected[1]);
    ok(g.tabs.every(t => t[0] >= 44 && t[1] >= 44), 'every tab is at least 44px each way (' + g.tabs.map(t => t.join('×')).join(', ') + ')');

    console.log(scheme + ': nothing hidden behind it');
    for (const view of ['today', 'days', 'places', 'bookings', 'prep']) {
      await page.evaluate(v => setView(v), view); await wait(350);
      await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight)); await wait(150);
      const c = await page.evaluate(v => { const kids = [...document.querySelectorAll('#view-' + v + ' *')].filter(e => e.getClientRects().length && e.getBoundingClientRect().height > 0);
        return { last: Math.max.apply(null, kids.map(e => e.getBoundingClientRect().bottom)), bar: document.querySelector('nav.tabs').getBoundingClientRect().top }; }, view);
      ok(c.last <= c.bar, view + ': scrolled to the end, the last thing ends ' + Math.round(c.bar - c.last) + 'px above the bar');
    }
    await page.evaluate(() => { window.scrollTo(0, 0); setView('today'); toast('Removed from today', 5000, function () {}); }); await wait(350);
    const tb = await page.evaluate(() => ({ toast: document.querySelector('#toast').getBoundingClientRect().bottom, bar: document.querySelector('nav.tabs').getBoundingClientRect().top }));
    ok(tb.toast <= tb.bar, 'a message with Undo sits above the bar, not under it');
    await page.click('#toast .undo'); await wait(200);

    console.log(scheme + ': header, buttons, sheets');
    ok(g.headLine === 0 && /blur/.test(g.fadeBlur) && /gradient/.test(g.fadeMask), 'the header has no hairline; the page blurs and fades out under it');
    ok(g.btnAlpha < 1 && /blur/.test(g.btnBlur) && g.btnSize >= 44, 'the round button is glass, and still ' + Math.round(g.btnSize) + 'px');
    ok(g.capsule >= 20, 'buttons are capsules');
    await page.evaluate(() => { setView('places'); }); await wait(300);
    await page.click('#placeResults .locrow .lb'); await wait(450);
    const s = await page.evaluate(() => { const e = document.querySelector('#sheet'), r = e.getBoundingClientRect(), cs = getComputedStyle(e), b = document.querySelector('#sheetBack').getBoundingClientRect();
      return { top: r.top, bottom: innerHeight - r.bottom, radius: parseFloat(cs.borderTopLeftRadius), dim: cs.boxShadow !== 'none', back: [b.top, b.width, b.height],
        hit: document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2) === document.querySelector('#sheetBack') || document.querySelector('#sheetBack').contains(document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2)) }; });
    ok(s.top >= 8 && s.radius >= 20 && Math.abs(s.bottom) < 1 && s.dim, 'a sheet stops ' + Math.round(s.top) + 'px short of the top with round shoulders, reaches the bottom, and dims the page');
    ok(s.hit && s.back[1] >= 44 && s.back[2] >= 44, 'its Back button is on top and 44px');
    await page.screenshot({ path: env.out('glass-' + scheme + '-sheet.png') });
    await page.click('#sheetBack'); await wait(350);
    ok(!await page.$('#sheet.open'), 'and closes it');
    const under = await page.evaluate(() => { const r = document.querySelector('#placeResults .locrow .lb').getBoundingClientRect(); return document.elementFromPoint(r.left + 10, r.top + 10) !== null && !document.querySelector('#sheet').contains(document.elementFromPoint(r.left + 10, r.top + 10)); });
    ok(under, 'a closed sheet (and its dimming) is out of the way of taps');
    await page.evaluate(() => { homeMode = 'day'; setView('today'); window.scrollTo(0, 380); }); await wait(300);
    await page.screenshot({ path: env.out('glass-' + scheme + '-home.png') });
    ok(!page.errs.length, 'no JS errors ' + page.errs.join('; '));
  }

  for (const [name, feature] of [['Reduce Transparency', { name: 'prefers-reduced-transparency', value: 'reduce' }], ['Increase Contrast', { name: 'prefers-contrast', value: 'more' }]]) {
    console.log('\n' + name);
    const page = await open('light');
    const cdp = await page.ctx.newCDPSession(page);
    await cdp.send('Emulation.setEmulatedMedia', { features: [feature] }); await wait(200);
    ok(await page.evaluate(q => matchMedia(q).matches, '(' + feature.name + ': ' + feature.value + ')'), 'the phone setting is on');
    const g = await page.evaluate(probe);
    ok(g.alpha === 1 && !/blur/.test(g.blur), 'the tab bar is solid');
    ok(g.btnAlpha === 1 && !/blur/.test(g.btnBlur), 'so are the round buttons');
    ok(!/blur/.test(g.fadeBlur) && !/gradient/.test(g.fadeMask), 'and the header, with a line under it');
    ok(g.worst.plain[0] >= 4.5 && g.worst.selected[0] >= 4.5, 'labels ' + g.worst.plain[0].toFixed(1) + ':1 and ' + g.worst.selected[0].toFixed(1) + ':1');
    ok(g.radius >= g.h / 2 - 1 && g.bottom >= 8, 'same shape and place');
    // nothing runs off a narrow screen in this mode either
    await page.setViewportSize({ width: 320, height: 700 });
    for (const view of ['today', 'places', 'prep']) {
      await page.evaluate(v => setView(v), view); await wait(350);
      const wide = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      ok(wide <= 1, view + ' at 320px: nothing past the right edge');
    }
    await page.screenshot({ path: env.out('glass-' + name.toLowerCase().replace(/\s+/g, '-') + '.png') });
    ok(!page.errs.length, 'no JS errors ' + page.errs.join('; '));
  }
});
