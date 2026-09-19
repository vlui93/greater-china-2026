/**
 * Greater China Trip Companion — Google Apps Script backend
 * Bound to a Google Sheet. Deploy as a Web App.
 *
 * SETUP (full detail in README.md):
 *   1. Create a new Google Sheet, Extensions > Apps Script, paste this file.
 *   2. Edit API_KEY below to a long random string of your own.
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
// CHANGE THIS before running setup(). Any long random string.
var API_KEY = 'CHANGE-ME-to-a-long-random-string';
// ---------------------------------------------------------------------------

var TABS = {
  Bookings: ['id', 'type', 'date', 'time', 'description', 'confirmation_no', 'details'],
  Locations: ['id', 'name_en', 'name_zh', 'city', 'type', 'lat', 'lng', 'nav_app',
              'history_blurb', 'recommendations', 'dishes_to_order', 'souvenirs', 'notes'],
  Schedule: ['id', 'date', 'order_index', 'location_id', 'planned_time', 'notes']
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

function handle_(e, req) {
  try {
    if (String(API_KEY).indexOf('CHANGE-ME') === 0) {
      return json_({ ok: false, error: 'Server not configured: set API_KEY in Code.gs and redeploy.' });
    }
    if (!req.key || String(req.key) !== String(API_KEY)) {
      return json_({ ok: false, error: 'Bad or missing API key.' });
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

function route_(action, req) {
  var payload = req.payload;
  if (typeof payload === 'string') { try { payload = JSON.parse(payload); } catch (x) {} }

  switch (action) {
    case 'ping':                return { pong: true, time: new Date().toISOString() };
    case 'all':                 return readAll_();
    case 'locations':           return { locations: readTab_('Locations') };
    case 'bookings':            return { bookings: readTab_('Bookings') };
    case 'schedule':            return { schedule: readTab_('Schedule') };

    case 'saveLocation':        return { location: upsert_('Locations', payload, 'loc') };
    case 'deleteLocation':      return deleteLocation_(payload);
    case 'saveBooking':         return { booking: upsert_('Bookings', payload, 'bk') };
    case 'deleteBooking':       return { deleted: remove_('Bookings', payload && payload.id) };

    case 'saveScheduleEntry':   return { entry: upsert_('Schedule', payload, 'sc') };
    case 'deleteScheduleEntry': return { deleted: remove_('Schedule', payload && payload.id) };
    case 'setDayOrder':         return setDayOrder_(payload);

    case 'reseed':              return seedAll_(true);
    case 'setupTabs':           return ensureTabs_();
    default: throw new Error('Unknown action: ' + action);
  }
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
        v = Utilities.formatDate(v, ss_().getSpreadsheetTimeZone(), h === 'planned_time' || h === 'time' ? 'HH:mm' : 'yyyy-MM-dd');
      }
      obj[h] = NUMERIC[h] ? (v === '' || v === null ? '' : Number(v)) : String(v == null ? '' : v);
    }
    out.push(obj);
  }
  return out;
}

function readAll_() {
  return {
    bookings: readTab_('Bookings'),
    locations: readTab_('Locations'),
    schedule: readTab_('Schedule'),
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
