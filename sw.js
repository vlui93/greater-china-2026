/* Offline shell. Matters more than usual here: Google services are blocked in
   mainland China, and github.io can be slow or unreachable there too. Once the
   app has been opened on wifi it keeps working with no connection at all. */
/* Bumped when the shell changes (v2: no trip content baked in; v3: transport
   legs and ticket notes; v4: Prep tab; v5: add a place from a map link; v6: offline adds survive the first sync; v7: map-link names in both languages; v10: trip overview, Simplified Chinese table; v11: photos and ticket links).
   */
var CACHE = "gct-v12";
var PHOTOS = "gct-photos";   // filled by the page; see "Photos" in index.html
var ASSETS = [
  "./", "./index.html", "./manifest.json", "./t2s.js",
  "./icons/icon-32.png", "./icons/icon-180.png",
  "./icons/icon-192.png", "./icons/icon-512.png"
];

self.addEventListener("install", function (e) {
  e.waitUntil(caches.open(CACHE).then(function (c) { return c.addAll(ASSETS); }).then(function () {
    return self.skipWaiting();
  }));
});

self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys().then(function (keys) {
    // Photos live in their own cache and outlast app updates
    return Promise.all(keys.map(function (k) { return k === CACHE || k === PHOTOS ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var url = new URL(e.request.url);
  // never cache the Apps Script API — it must always hit the network
  if (url.hostname.indexOf("script.google") >= 0 || e.request.method !== "GET") return;
  // Place photos: served from the phone once saved, so they show offline
  // (Wikipedia is blocked on the mainland). Anything not saved goes to the network.
  if (url.origin !== self.location.origin) {
    if (e.request.destination !== "image") return;
    e.respondWith(caches.open(PHOTOS).then(function (c) {
      return c.match(e.request.url).then(function (m) { return m || fetch(e.request); });
    }));
    return;
  }

  // network-first for the page so updates land, cache-first for static assets
  if (e.request.mode === "navigate" || url.pathname.endsWith("index.html")) {
    e.respondWith(
      fetch(e.request).then(function (r) {
        var copy = r.clone();
        caches.open(CACHE).then(function (c) { c.put(e.request, copy); });
        return r;
      }).catch(function () {
        return caches.match(e.request).then(function (m) { return m || caches.match("./index.html"); });
      })
    );
    return;
  }
  e.respondWith(caches.match(e.request).then(function (m) { return m || fetch(e.request); }));
});
