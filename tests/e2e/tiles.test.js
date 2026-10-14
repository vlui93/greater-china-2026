/* The service worker keeps the app and the map tiles you have looked at, so the map works with no connection. Run with PW_EXPERIMENTAL_SERVICE_WORKER_NETWORK_EVENTS=1 (the runner sets it). */
const { suite, trip, fixture, fixturePath, swCache } = require('./lib');
const fs = require('fs'), path = require('path');

suite({}, async (env) => {
  const { ok, wait, rows, tab } = env;
  const CACHE = swCache();
  const page = await env.phone({});
  const PNG=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==','base64');
  let tiles=0; await page.ctx.route('**/tile.openstreetmap.org/**', r=>{ tiles++; r.fulfill({status:200,contentType:'image/png',body:PNG}); });
  await page.reload(); await wait(1500);   // the service worker is in charge from here
  ok(await page.evaluate(()=>!!navigator.serviceWorker.controller), 'service worker controls the page');
  await page.evaluate(()=>{ ui.placesMode="map"; setView("places"); }); await wait(2500);
  const n=await page.evaluate(()=>caches.open("gct-tiles").then(c=>c.keys()).then(k=>k.length));
  ok(tiles>0 && n>0, 'viewed tiles fetched ('+tiles+') and kept ('+n+')');
  ok(await page.evaluate(c=>caches.keys().then(k=>k.indexOf(c)>=0), CACHE), 'the app cache ('+CACHE+') exists');
  ok(await page.evaluate(n=>caches.open(n).then(c=>Promise.all(["map.js","vendor/leaflet/leaflet.js","vendor/leaflet/leaflet.css"].map(f=>c.match(new URL(f,location.href).href)))).then(r=>r.every(Boolean)), CACHE), 'map.js and Leaflet saved for offline');
  await page.ctx.setOffline(true); const before=tiles;
  await page.reload(); await wait(1200);
  await page.evaluate(()=>{ ui.placesMode="map"; setView("places"); }); await wait(2500);
  const imgs=await page.$$eval('#placesMap img.leaflet-tile', e=>e.map(x=>x.complete&&x.naturalWidth>0));
  ok(imgs.length>0 && imgs.every(Boolean) && tiles===before, 'offline: the map and its tiles still show, from the phone ('+imgs.length+')');
});
