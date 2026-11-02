/**
 * Greater China Trip Companion — Google Apps Script backend
 * Bound to a Google Sheet. Deploy as a Web App.
 *
 * SETUP (full detail in README.md):
 *   1. Create a new Google Sheet, Extensions > Apps Script, paste this file.
 *   2. Edit API_KEY below to a long random string of your own. The first
 *      request with it saves it in the script's own settings (Project
 *      Settings > Script properties), so later versions of this file can be
 *      pasted over it with the placeholder left in and keep working.
 *   3. Run setup() once and authorise it. This creates and seeds the tabs.
 *   4. Deploy > New deployment > Web app.
 *        Execute as: Me
 *        Who has access: Anyone      <-- required, see README "Why 'Anyone'"
 *   5. Copy the /exec URL. Open the app on your phone, paste URL + API key.
 *
 * The API key is the access control. Every request must carry it.
 * It is never committed to the public repo — you paste it into the app once
 * and it is kept in the browser's localStorage on your phone.
 */

// ---------------------------------------------------------------------------
// CHANGE THIS before running setup(). Any long random string. Once it has
// been used, it is remembered (see apiKey_), so pasting a newer Code.gs with
// this line left as it is doesn't lock the phones out.
var API_KEY = 'CHANGE-ME-to-a-long-random-string';
// ---------------------------------------------------------------------------

var TABS = {
  // New columns only ever go on the end: rows already in a Sheet keep their
  // positions, and sheet_() writes the longer header row the first time it
  // meets an older tab, so upgrading is paste-and-redeploy with no data move.
  // ticket_url / photo_url are links only (an e-ticket page, an image) —
  // never the ticket or its QR code itself. A place's visited is when it was
  // ticked off on the trip ("no" once unticked). map_url is a Google Maps or Amap
  // share link that the app's Navigate button opens as it is.
  // trip_id ties a row to a trip in Trips; blank means the default trip, so
  // every row written before trips existed stays where it was. tz is the time
  // zone a booking's time is in (blank: the trip's). A booking runs from
  // date/time (departure, or check-in) to arr_date/arr_time (arrival, or
  // check-out), arr_tz being the arrival's zone; number is the flight, train
  // or sailing, from_place/to_place where it leaves from and goes to.
  Bookings: ['id', 'type', 'date', 'time', 'description', 'confirmation_no', 'details',
             'ticket_url', 'trip_id', 'tz', 'number', 'from_place', 'to_place',
             'arr_date', 'arr_time', 'arr_tz'],
  Locations: ['id', 'name_en', 'name_zh', 'city', 'type', 'lat', 'lng', 'nav_app',
              'history_blurb', 'recommendations', 'dishes_to_order', 'souvenirs', 'notes',
              'getting_there', 'arrive_by', 'tickets', 'photo_url', 'ticket_url', 'trip_id',
              'visited', 'map_url'],
  Schedule: ['id', 'date', 'order_index', 'location_id', 'planned_time', 'notes', 'trip_id'],
  // Pre-trip tasks and the shared packing list. kind is 'task', 'pack' (the group brings one) or 'each' (everyone packs their own; each phone keeps its own ticks); assignee is who is to bring a group item;
  // location_id optionally ties a task to a place, so the day briefing can
  // say "not booked yet". Personal packing never comes here — it stays on
  // each phone. Phones merge by `updated` (newest copy wins), and deleting
  // sets `removed` rather than dropping the row, so a phone that still has
  // the item cannot bring it back.
  Checklist: ['id', 'kind', 'section', 'text', 'due', 'location_id', 'done', 'done_by', 'order_index',
              'updated', 'removed', 'trip_id', 'assignee'],
  // One row per trip. zh_script: 'simplified' shows Chinese in Simplified,
  // 'original' as written. is_default marks the trip that rows with no
  // trip_id belong to.
  Trips: ['id', 'name', 'name_zh', 'start', 'end', 'tz', 'zh_script', 'is_default', 'notes', 'updated', 'archived'],
  // Shared by every trip, matched to places by name. region is cn (mainland
  // China: Amap, shifted map grid), hk, mo or blank. The fare columns are the
  // taxi meter, in the local currency, for the getting-around estimates.
  Cities: ['id', 'name', 'name_zh', 'lat', 'lng', 'tz', 'region', 'map_app',
           'currency', 'round', 'flag', 'flag_km', 'per_km', 'high_at', 'per_km_high', 'transit', 'car'],
  // An optional label per day ("Macau day trip"); without one the app names
  // the day after its cities.
  Days: ['id', 'trip_id', 'date', 'label'],
  // Deleted places, so anyone can put one back: the place and its stops as
  // JSON, as they were when it was deleted. Restoring writes them back and
  // removes the row. The id is made by the phone that deleted it.
  Bin: ['id', 'trip_id', 'deleted_at', 'deleted_by', 'name', 'location', 'stops'],
  // People with their own key (see caller_). trips is a comma list of trip ids,
  // or * for every trip; role is member (sees and changes those trips) or
  // viewer (only looks). revoked, once set, stops the key.
  Members: ['id', 'name', 'key', 'trips', 'role', 'added', 'revoked']
};

var NUMERIC = { lat: true, lng: true, order_index: true };

// ===========================================================================
// HTTP entry points
// ===========================================================================

function doGet(e) {
  return handle_(e, (e && e.parameter) || {});
}

function doPost(e) {
  var body = {};
  if (e && e.postData && e.postData.contents) {
    try { body = JSON.parse(e.postData.contents); } catch (err) { body = {}; }
  }
  // query params act as a fallback for the key
  var params = (e && e.parameter) || {};
  if (!body.key && params.key) body.key = params.key;
  if (!body.action && params.action) body.action = params.action;
  return handle_(e, body);
}

/* The key in this file wins; once one has been used it is kept in the
 * script's properties too, and used whenever this file still carries the
 * placeholder — which is what pasting a new version leaves (the last upgrade
 * locked every phone out until the key was typed in again). */
function apiKey_() {
  var props = typeof PropertiesService !== 'undefined' ? PropertiesService.getScriptProperties() : null;
  var mine = String(API_KEY);
  if (mine.indexOf('CHANGE-ME') !== 0) {
    if (props && props.getProperty('API_KEY') !== mine) props.setProperty('API_KEY', mine);
    return mine;
  }
  return (props && props.getProperty('API_KEY')) || '';
}

function handle_(e, req) {
  try {
    var key = apiKey_();
    if (!key) {
      return json_({ ok: false, error: 'Server not configured: set API_KEY in Code.gs and redeploy.' });
    }
    var who = caller_(req.key, key);
    if (!who) return json_({ ok: false, error: 'Bad or missing API key.' });
    if (who.revoked) return json_({ ok: false, error: 'This key has been removed — ask the trip owner for a new invite.' });
    REQ_ = { who: who, dflt: null };

    // Resolving a map link is a slow outbound fetch that touches no rows, so it
    // runs before the lock is taken rather than holding up everyone's edits.
    if (String(req.action) === 'resolvePlace') {
      return json_({ ok: true, action: 'resolvePlace', data: resolvePlace_(req.payload) });
    }

    var lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      var result = route_(String(req.action || 'all'), req);
      return json_({ ok: true, action: req.action || 'all', data: result });
    } finally {
      lock.releaseLock();
    }
  } catch (err) {
    return json_({ ok: false, error: String(err && err.message ? err.message : err) });
  }
}

/* ---------------------------------------------------------------------------
   Who's calling. The owner key (API_KEY, remembered in the script's
   properties) can do anything. Everyone else has a personal key in the
   Members tab, which says which trips they can see and whether they can
   change anything (member) or only look (viewer). Every action checks the
   trips it touches — the trip a row is written to and, for a row that
   already exists, the trip it is in now — so nothing in a trip a key isn't on
   can be read, changed, or moved in or out. Revoking a member stops their key
   at once; nobody else's changes.
   --------------------------------------------------------------------------- */
var REQ_ = null;
var DENIED = "This key can't see that trip.";
function caller_(given, ownerKey) {
  given = String(given || '');
  if (!given) return null;
  if (given === ownerKey) return { owner: true, role: 'owner', name: '', trips: '*' };
  var m = readTab_('Members').filter(function (x) { return x.key && x.key === given; })[0];
  if (!m) return null;
  if (String(m.revoked || '').trim()) return { revoked: true };
  var t = String(m.trips || '').trim();
  return { owner: false, id: m.id, name: m.name, role: m.role === 'viewer' ? 'viewer' : 'member',
           trips: t === '*' ? '*' : t.split(/\s*,\s*/).filter(Boolean) };
}
/** The trip that rows with a blank trip_id belong to — as the app works it out. */
function defaultTrip_() {
  var ok = /^\d{4}-\d{2}-\d{2}$/;
  var t = readTab_('Trips').filter(function (x) { return x.id && ok.test(x.start) && ok.test(x.end); });
  var d = t.filter(function (x) { var v = String(x.is_default || '').trim().toLowerCase(); return v && v !== '0' && v !== 'false'; })[0] || t[0];
  return d ? d.id : '';
}
function dflt_() { if (REQ_.dflt === null) REQ_.dflt = defaultTrip_(); return REQ_.dflt; }
function allowed_(tripId) {
  var w = REQ_.who;
  if (w.owner || w.trips === '*') return true;
  var t = String(tripId || '') || dflt_();
  return !!t && w.trips.indexOf(t) >= 0;
}
function mineOnly_(rows) { return REQ_.who.owner ? rows : rows.filter(function (r) { return allowed_(r.trip_id); }); }
function ownerOnly_() { if (!REQ_.who.owner) throw new Error('Only the trip owner can do that.'); }
function noViewer_() { if (REQ_.who.role === 'viewer') throw new Error("View only: this key can't make changes."); }
/** The trip an existing row is in, or null when there's no such row. */
function rowTrip_(name, id) {
  if (!id) return null;
  var r = rowIndexById_(name, id);
  if (r < 0) return null;
  return String(sheet_(name).getRange(r, TABS[name].indexOf('trip_id') + 1, 1, 1).getValues()[0][0] || '');
}
/** A write to a row of `name`: allowed only inside the caller's trips — both
 *  where the row is now and where it would end up. */
function canWrite_(name, payload) {
  noViewer_();
  var w = REQ_.who;
  if (w.owner || w.trips === '*') return;
  var p = payload || {}, cur = rowTrip_(name, p.id);
  if (cur !== null && !allowed_(cur)) throw new Error(DENIED);
  var target = Object.prototype.hasOwnProperty.call(p, 'trip_id') ? p.trip_id : (cur !== null ? cur : '');
  if (!allowed_(target)) throw new Error(DENIED);
}
function newKey_() {
  var u = function () { return Utilities.getUuid().replace(/-/g, ''); };
  return 'm-' + u() + u();
}
/** Add or change a person (owner only). A new person gets a key, returned once
 *  here and in the owner's members list; changing trips or role keeps it. */
function saveMember_(p) {
  if (!p || !String(p.name || '').trim()) throw new Error('A person needs a name.');
  var trips = Array.isArray(p.trips) ? p.trips.join(',') : String(p.trips || '');
  var row = { id: p.id || '', name: String(p.name).trim(), trips: trips, role: p.role === 'viewer' ? 'viewer' : 'member' };
  if (!row.id || rowIndexById_('Members', row.id) < 0) { row.key = newKey_(); row.added = new Date().toISOString(); row.revoked = ''; }
  return upsert_('Members', row, 'mem');
}

function route_(action, req) {
  var payload = req.payload;
  if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch (x) {} }

  switch (action) {
    case 'ping':                return { pong: true, time: new Date().toISOString() };
    case 'whoami':              return me_();
    case 'all':                 return readAll_(payload);
    case 'locations':           return { locations: mineOnly_(readTab_('Locations')) };
    case 'bookings':            return { bookings: mineOnly_(readTab_('Bookings')) };
    case 'schedule':            return { schedule: mineOnly_(readTab_('Schedule')) };

    case 'saveLocation':        canWrite_('Locations', payload); return { location: upsert_('Locations', payload, 'loc') };
    case 'deleteLocation':      canWrite_('Locations', { id: payload && payload.id }); return deleteLocation_(payload);
    case 'restoreLocation':     canWrite_('Bin', { id: payload && payload.id }); return restoreLocation_(payload);
    case 'deleteBinItem':       canWrite_('Bin', { id: payload && payload.id }); return { deleted: remove_('Bin', payload && payload.id) };
    case 'saveBooking':         canWrite_('Bookings', payload); return { booking: upsert_('Bookings', payload, 'bk') };
    case 'deleteBooking':       canWrite_('Bookings', { id: payload && payload.id }); return { deleted: remove_('Bookings', payload && payload.id) };

    case 'saveScheduleEntry':   canWrite_('Schedule', payload); return { entry: upsert_('Schedule', payload, 'sc') };
    case 'deleteScheduleEntry': canWrite_('Schedule', { id: payload && payload.id }); return { deleted: remove_('Schedule', payload && payload.id) };
    case 'setDayOrder':
      noViewer_();
      ((payload && payload.ids) || []).forEach(function (id) { var t = rowTrip_('Schedule', id); if (t !== null && !allowed_(t)) throw new Error(DENIED); });
      return setDayOrder_(payload);

    case 'checklist':           return { checklist: mineOnly_(readTab_('Checklist')) };
    case 'saveChecklistItem':   canWrite_('Checklist', payload); return { item: upsert_('Checklist', payload, 'ck') };
    case 'deleteChecklistItem': canWrite_('Checklist', { id: payload && payload.id }); return { deleted: remove_('Checklist', payload && payload.id) };

    case 'trips':               return { trips: REQ_.who.owner ? readTab_('Trips') : readTab_('Trips').filter(function (t) { return allowed_(t.id); }) };
    case 'saveTrip':            ownerOnly_(); return { trip: upsert_('Trips', payload, 'trip') };
    case 'deleteTrip':          ownerOnly_(); return deleteTrip_(payload);
    case 'saveCity':            noViewer_(); return { city: upsert_('Cities', payload, 'city') };
    case 'deleteCity':          ownerOnly_(); return { deleted: remove_('Cities', payload && payload.id) };
    case 'saveDay':             canWrite_('Days', payload); return { day: upsert_('Days', payload, 'day') };
    case 'deleteDay':           canWrite_('Days', { id: payload && payload.id }); return { deleted: remove_('Days', payload && payload.id) };

    case 'members':             ownerOnly_(); return { members: readTab_('Members') };
    case 'saveMember':          ownerOnly_(); return { member: saveMember_(payload) };
    case 'revokeMember':        ownerOnly_(); return { member: upsert_('Members', { id: payload && payload.id, revoked: new Date().toISOString() }, 'mem') };

    case 'reseed':              ownerOnly_(); return seedAll_(true);
    case 'setupTabs':           ownerOnly_(); return ensureTabs_();
    default: throw new Error('Unknown action: ' + action);
  }
}

// ---------------------------------------------------------------------------
// Map links. The phone can't follow a short link itself: the redirect goes to
// another site, and a browser won't let a page read where it ends up. This
// follows it server side and hands back the final URL, the page title, and
// any coordinate-looking text on the page; the phone does the parsing.
// Only Google Maps and Amap hosts are followed, so this can't be used to fetch
// arbitrary pages.
// ---------------------------------------------------------------------------
var PLACE_HOSTS = /(^|\.)(goo\.gl|google\.[a-z]{2,3}(\.[a-z]{2})?|amap\.com|autonavi\.com)$/i;

function resolvePlace_(payload) {
  if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch (x) {} }
  var url = String(payload && payload.url || '').trim();
  if (!/^https?:\/\//i.test(url)) throw new Error('That is not a link.');
  var chain = [url], title = '', hints = [];
  for (var hop = 0; hop < 6; hop++) {
    var host = url.replace(/^https?:\/\/([^\/?#:]+).*$/i, '$1');
    if (!PLACE_HOSTS.test(host)) throw new Error('Only Google Maps and Amap links can be looked up.');
    // Ask for Chinese: an app set to English shares an English name, and the
    // Chinese one — which the app needs — is what the landing page can supply.
    var res = UrlFetchApp.fetch(url, { followRedirects: false, muteHttpExceptions: true,
                                       headers: { 'Accept-Language': 'zh-CN,zh;q=0.9,en;q=0.8' } });
    var code = res.getResponseCode(), h = res.getHeaders() || {};
    var loc = h.Location || h.location;
    if (code >= 300 && code < 400 && loc) { url = absoluteUrl_(loc, url); chain.push(url); continue; }
    var body = code === 200 ? String(res.getContentText() || '') : '';
    var t = body.match(/<title[^>]*>([^<]*)<\/title>/i);
    if (t) title = t[1].replace(/\s+/g, ' ').trim();
    // some share pages hop on with a meta refresh or a script instead of a 30x
    var next = body.match(/http-equiv=["']?refresh["']?[^>]*url=([^"'>\s]+)/i) ||
               body.match(/location\.(?:href\s*=|replace\()\s*['"](https?:[^'"]+)['"]/i);
    if (next && next[1] !== url) { url = absoluteUrl_(next[1], url); chain.push(url); continue; }
    hints = (body.match(/[^\s"'<>]{0,30}\d{2,3}\.\d{4,}\s*[,，|]\s*\d{2,3}\.\d{4,}/g) || []).slice(0, 12);
    break;
  }
  return { final_url: url, chain: chain, title: title, hints: hints };
}

function absoluteUrl_(loc, base) {
  loc = String(loc);
  if (/^https?:\/\//i.test(loc)) return loc;
  if (loc.indexOf('//') === 0) return 'https:' + loc;
  var origin = base.replace(/^(https?:\/\/[^\/?#]+).*$/i, '$1');
  return loc.charAt(0) === '/' ? origin + loc : origin + '/' + loc;
}

function json_(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===========================================================================
// Sheet helpers
// ===========================================================================

function ss_() { return SpreadsheetApp.getActive(); }

function ensureTabs_() {
  var s = ss_(), made = [];
  Object.keys(TABS).forEach(function (name) {
    var sh = s.getSheetByName(name);
    if (!sh) { sh = s.insertSheet(name); made.push(name); }
    var headers = TABS[name];
    var existing = sh.getLastColumn() ? sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0] : [];
    if (existing.join('|') !== headers.join('|')) {
      sh.getRange(1, 1, 1, headers.length).setValues([headers]);
      sh.setFrozenRows(1);
      sh.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    }
  });
  var def = s.getSheetByName('Sheet1');
  if (def && def.getLastRow() === 0 && s.getSheets().length > 1) s.deleteSheet(def);
  return { created: made, tabs: Object.keys(TABS) };
}

function sheet_(name) {
  var sh = ss_().getSheetByName(name);
  if (!sh) { ensureTabs_(); sh = ss_().getSheetByName(name); }
  if (!sh) throw new Error('Missing tab: ' + name);
  var headers = TABS[name];
  if (sh.getLastColumn() < headers.length) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]).setFontWeight('bold');
  }
  return sh;
}

function readTab_(name) {
  var sh = sheet_(name);
  var headers = TABS[name];
  var last = sh.getLastRow();
  if (last < 2) return [];
  var values = sh.getRange(2, 1, last - 1, headers.length).getValues();
  var out = [];
  for (var i = 0; i < values.length; i++) {
    var row = values[i];
    if (!String(row[0]).trim()) continue;
    var obj = {};
    for (var c = 0; c < headers.length; c++) {
      var h = headers[c], v = row[c];
      if (v instanceof Date) {
        v = Utilities.formatDate(v, ss_().getSpreadsheetTimeZone(), /time$/.test(h) ? 'HH:mm' : 'yyyy-MM-dd');
      }
      obj[h] = NUMERIC[h] ? (v === '' || v === null ? '' : Number(v)) : String(v == null ? '' : v);
    }
    out.push(obj);
  }
  return out;
}

/* Everything a phone needs. A phone that names its open trip ({trip,
 * is_default}) gets only that trip's rows — so what each sync sends, and what
 * each phone keeps offline, stays one trip's size however many trips the
 * Sheet holds — plus every trip's name and a count of its places. A blank
 * trip_id is the default trip's, so those rows come with is_default. A phone
 * that names no trip (an older app) gets everything, as before. */
/** Who this key is, for the app: never the key itself. */
function me_() {
  var w = REQ_.who;
  return { owner: !!w.owner, role: w.role, name: w.name || '', trips: w.trips };
}
function readAll_(scope) {
  var trip = scope && scope.trip ? String(scope.trip) : '';
  var dflt = !!(scope && scope.is_default);
  var allTrips = readTab_('Trips');
  if (!REQ_.who.owner) {
    // A member always gets one trip they're on: the one asked for if allowed,
    // else the default trip, else their first. Which trip blank rows belong to
    // is worked out here, never taken from the phone.
    var onTrips = allTrips.filter(function (t) { return allowed_(t.id); });
    if (!trip || !allowed_(trip)) trip = allowed_('') && dflt_() ? dflt_() : (onTrips[0] && onTrips[0].id) || '';
    if (!trip) throw new Error("This key isn't on any trip yet — ask the trip owner.");
    dflt = trip === dflt_();
    allTrips = onTrips;
  }
  var mine = function (rows) {
    if (!trip) return rows;
    return rows.filter(function (r) { var t = String(r.trip_id || ''); return t === trip || (!t && dflt); });
  };
  var locations = readTab_('Locations'), index = {};
  locations.forEach(function (l) { var t = String(l.trip_id || ''); if (allowed_(t)) index[t] = (index[t] || 0) + 1; });
  return {
    bookings: mine(readTab_('Bookings')),
    locations: mine(locations),
    schedule: mine(readTab_('Schedule')),
    checklist: mine(readTab_('Checklist')),
    trips: allTrips,
    cities: readTab_('Cities'),
    days: mine(readTab_('Days')),
    bin: mine(readTab_('Bin')),
    scope: trip ? { trip: trip, is_default: dflt } : null,
    places_per_trip: index,
    me: me_(),
    default_trip: dflt_(),
    fetched_at: new Date().toISOString()
  };
}

function rowIndexById_(name, id) {
  var sh = sheet_(name);
  var last = sh.getLastRow();
  if (last < 2) return -1;
  var ids = sh.getRange(2, 1, last - 1, 1).getValues();
  for (var i = 0; i < ids.length; i++) if (String(ids[i][0]) === String(id)) return i + 2;
  return -1;
}

function newId_(prefix) {
  return prefix + '-' + Date.now().toString(36) + Math.floor(Math.random() * 1296).toString(36);
}

function upsert_(name, obj, prefix) {
  if (!obj || typeof obj !== 'object') throw new Error('Nothing to save.');
  var headers = TABS[name];
  var sh = sheet_(name);
  var id = String(obj.id || '').trim();
  if (!id) { id = newId_(prefix); obj.id = id; }

  var existingRow = rowIndexById_(name, id);
  var current = {};
  if (existingRow > 0) {
    var vals = sh.getRange(existingRow, 1, 1, headers.length).getValues()[0];
    for (var c = 0; c < headers.length; c++) current[headers[c]] = vals[c];
  }

  var row = headers.map(function (h) {
    var v = Object.prototype.hasOwnProperty.call(obj, h) ? obj[h] : current[h];
    if (v === undefined || v === null) v = '';
    if (NUMERIC[h]) return v === '' ? '' : Number(v);
    return String(v);
  });
  row[0] = id;

  if (existingRow > 0) sh.getRange(existingRow, 1, 1, headers.length).setValues([row]);
  else sh.appendRow(row);

  var saved = {};
  headers.forEach(function (h, i) { saved[h] = row[i]; });
  return saved;
}

function remove_(name, id) {
  if (!id) throw new Error('No id supplied.');
  var r = rowIndexById_(name, id);
  if (r < 0) return { id: id, removed: false };
  sheet_(name).deleteRow(r);
  return { id: id, removed: true };
}

function deleteLocation_(payload) {
  var id = payload && payload.id;
  if (!id) throw new Error('No id supplied.');
  // Into the bin first, with its stops, so it can be put back on the same days
  var loc = readTab_('Locations').filter(function (l) { return l.id === String(id); })[0];
  if (loc) {
    var stops = readTab_('Schedule').filter(function (s) { return s.location_id === String(id); });
    upsert_('Bin', { id: (payload.bin_id && String(payload.bin_id)) || '', trip_id: loc.trip_id || '',
      deleted_at: new Date().toISOString(), deleted_by: payload.by || '', name: loc.name_en || loc.name_zh || id,
      location: JSON.stringify(loc), stops: JSON.stringify(stops) }, 'bin');
  }
  // remove any schedule entries pointing at it, bottom-up so indices stay valid
  var sh = sheet_('Schedule');
  var last = sh.getLastRow();
  var removedEntries = 0;
  if (last >= 2) {
    var rows = sh.getRange(2, 1, last - 1, TABS.Schedule.length).getValues();
    for (var i = rows.length - 1; i >= 0; i--) {
      if (String(rows[i][3]) === String(id)) { sh.deleteRow(i + 2); removedEntries++; }
    }
  }
  var res = remove_('Locations', id);
  res.schedule_entries_removed = removedEntries;
  return res;
}

/** Put a binned place back, with its stops, and empty its bin row. */
function restoreLocation_(payload) {
  var id = payload && payload.id;
  if (!id) throw new Error('No id supplied.');
  var row = readTab_('Bin').filter(function (b) { return b.id === String(id); })[0];
  if (!row) return { id: id, restored: false };
  var loc = JSON.parse(row.location), stops = JSON.parse(row.stops || '[]');
  upsert_('Locations', loc, 'loc');
  stops.forEach(function (s) { upsert_('Schedule', s, 'sc'); });
  remove_('Bin', id);
  return { id: id, restored: true, location: loc.id, stops: stops.length };
}

function setDayOrder_(payload) {
  if (!payload || !payload.date || !payload.ids || !payload.ids.length) {
    throw new Error('setDayOrder needs {date, ids:[...]}');
  }
  var sh = sheet_('Schedule');
  var last = sh.getLastRow();
  if (last < 2) return { date: payload.date, updated: 0 };
  var idCol = sh.getRange(2, 1, last - 1, 1).getValues();
  var pos = {};
  payload.ids.forEach(function (id, i) { pos[String(id)] = i + 1; });
  var updated = 0;
  for (var i = 0; i < idCol.length; i++) {
    var id = String(idCol[i][0]);
    if (pos[id]) { sh.getRange(i + 2, 3).setValue(pos[id]); updated++; }
  }
  return { date: payload.date, updated: updated };
}

/** Deletes a trip and every row that belongs to it. The default trip can't
 *  be deleted: rows with no trip_id belong to it, and there would be nowhere
 *  for them to go. */
function deleteTrip_(payload) {
  var id = String(payload && payload.id || '');
  if (!id) throw new Error('No id supplied.');
  var r = rowIndexById_('Trips', id);
  if (r < 0) return { id: id, removed: false };
  var t = sheet_('Trips').getRange(r, 1, 1, TABS.Trips.length).getValues()[0];
  var dflt = String(t[TABS.Trips.indexOf('is_default')]).trim().toLowerCase();
  if (dflt && dflt !== '0' && dflt !== 'false') throw new Error('The default trip cannot be deleted.');
  var counts = {};
  ['Bookings', 'Locations', 'Schedule', 'Checklist', 'Days'].forEach(function (name) {
    var sh = sheet_(name), col = TABS[name].indexOf('trip_id') + 1, last = sh.getLastRow(), n = 0;
    if (last >= 2) {
      var v = sh.getRange(2, col, last - 1, 1).getValues();
      for (var i = v.length - 1; i >= 0; i--) if (String(v[i][0]) === id) { sh.deleteRow(i + 2); n++; }
    }
    counts[name] = n;
  });
  sheet_('Trips').deleteRow(r);
  return { id: id, removed: true, rows_removed: counts };
}
