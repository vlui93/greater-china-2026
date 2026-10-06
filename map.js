/* Maps, loaded only when one is opened (Leaflet is ~150KB).
   Tiles are OpenStreetMap's, which are plain GPS like the app's own
   coordinates, so pins sit where they should without any shifting. The
   service worker keeps each tile once it has been viewed, so a city you have
   looked at on wifi still shows with no signal; nothing is downloaded ahead.
   The page passes in ready-escaped HTML for labels and popups. */
(function () {
  "use strict";
  var leafletReady = null;

  function load() {
    if (window.L) return Promise.resolve();
    if (leafletReady) return leafletReady;
    leafletReady = new Promise(function (resolve, reject) {
      var css = document.createElement("link");
      css.rel = "stylesheet"; css.href = "vendor/leaflet/leaflet.css";
      document.head.appendChild(css);
      var s = document.createElement("script");
      s.src = "vendor/leaflet/leaflet.js";
      s.onload = function () { resolve(); };
      s.onerror = function () { leafletReady = null; reject(new Error("map-load")); };
      document.head.appendChild(s);
    });
    return leafletReady;
  }

  /**
   * el      container element (sized by the page)
   * pins    [{ lat, lng, label, color, popup, kind }] — kind "stop" | "hotel" | "place"
   * opts    { route: true to join pins in order, dashedEnds: true to dash
   *           the first and last legs (to and from the hotel),
   *           view: {lat, lng, zoom} to open there instead of fitting the pins }
   * Returns the Leaflet map; the page removes it when it's done with it.
   */
  function show(el, pins, opts) {
    opts = opts || {};
    return load().then(function () {
      var L = window.L;
      el.innerHTML = "";
      var map = L.map(el, { zoomControl: true, attributionControl: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>'
      }).addTo(map);

      var pts = [];
      pins.forEach(function (p) {
        var icon = L.divIcon({
          className: "mpin " + (p.kind || "place"),
          html: '<span style="background:' + (p.color || "var(--accent)") + '">' + (p.label || "") + "</span>",
          iconSize: [28, 28], iconAnchor: [14, 14], popupAnchor: [0, -14]
        });
        var m = L.marker([p.lat, p.lng], { icon: icon, keyboard: true, title: p.title || "" }).addTo(map);
        if (p.popup) m.bindPopup(p.popup, { closeButton: true, maxWidth: 260 });
        pts.push([p.lat, p.lng]);
      });

      if (opts.route && pts.length > 1) {
        var n = pts.length;
        for (var i = 1; i < n; i++) {
          var end = opts.dashedEnds && (i === 1 || i === n - 1);
          L.polyline([pts[i - 1], pts[i]], {
            color: "#c2410c", weight: 3, opacity: 0.75, dashArray: end ? "4 7" : null
          }).addTo(map);
        }
      }

      var fit = !opts.view;
      if (opts.view) map.setView([opts.view.lat, opts.view.lng], opts.view.zoom);
      else if (pts.length === 1) map.setView(pts[0], 15);
      else if (pts.length) map.fitBounds(pts, { padding: [36, 36], maxZoom: 16 });
      else map.setView(opts.centre || [22.3, 114.17], opts.centre ? 12 : 3);

      // Where am I: one fix, shown as a dot. Nothing is stored or sent.
      var Locate = L.Control.extend({
        options: { position: "topright" },
        onAdd: function () {
          var b = L.DomUtil.create("button", "mlocate");
          b.type = "button"; b.setAttribute("aria-label", "Show where I am");
          b.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="3.2"/><path d="M12 2.8v3.4M12 17.8v3.4M2.8 12h3.4M17.8 12h3.4"/><circle cx="12" cy="12" r="7"/></svg>';
          L.DomEvent.on(b, "click", function (ev) {
            L.DomEvent.stop(ev);
            if (!navigator.geolocation) return;
            b.classList.add("busy");
            navigator.geolocation.getCurrentPosition(function (pos) {
              b.classList.remove("busy");
              var ll = [pos.coords.latitude, pos.coords.longitude];
              if (map._me) map.removeLayer(map._me);
              map._me = L.circleMarker(ll, { radius: 8, color: "#fff", weight: 3, fillColor: "#1668d6", fillOpacity: 1 }).addTo(map);
              map.setView(ll, Math.max(map.getZoom(), 15));
            }, function () { b.classList.remove("busy"); }, { enableHighAccuracy: true, timeout: 12000, maximumAge: 60000 });
          });
          return b;
        }
      });
      map.addControl(new Locate());

      // The container may still be sliding in (the sheet); measure again once it has
      setTimeout(function () {
        if (!map._loaded || !map.getContainer().isConnected) return;
        map.invalidateSize();
        if (fit && pts.length > 1) map.fitBounds(pts, { padding: [36, 36], maxZoom: 16 });
      }, 320);
      return map;
    });
  }

  window.TripMap = { load: load, show: show };
})();
