/* Offline shell. Matters more than usual here: Google services are blocked in
   mainland China, and github.io can be slow or unreachable there too. Once the
   app has been opened on wifi it keeps working with no connection at all. */
var CACHE = "gct-v1";
var ASSETS = [
  "./", "./index.html", "./manifest.json",
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
    return Promise.all(keys.map(function (k) { return k === CACHE ? null : caches.delete(k); }));
  }).then(function () { return self.clients.claim(); }));
});

self.addEventListener("fetch", function (e) {
  var url = new URL(e.request.url);
  // never cache the Apps Script API — it must always hit the network
  if (url.hostname.indexOf("script.google") >= 0 || e.request.method !== "GET") return;
  if (url.origin !== self.location.origin) return;

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
