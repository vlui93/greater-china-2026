
// ===========================================================================
// One-time setup and seeding
// ===========================================================================

/**
 * RUN THIS ONCE from the Apps Script editor.
 * Creates the three tabs and fills them with the trip's seed data.
 * Safe to re-run: it will not duplicate rows that already exist by id.
 */
function setup() {
  ensureTabs_();
  var r = seedAll_(false);
  Logger.log('Setup complete. ' + JSON.stringify(r));
  return r;
}

/**
 * Wipes the three tabs and re-seeds from scratch.
 * Use only if you want to throw away in-app edits and start again.
 */
function resetAndReseed() {
  ensureTabs_();
  Object.keys(TABS).forEach(function (name) {
    var sh = sheet_(name);
    if (sh.getLastRow() > 1) sh.deleteRows(2, sh.getLastRow() - 1);
  });
  var r = seedAll_(true);
  Logger.log('Reseed complete. ' + JSON.stringify(r));
  return r;
}

function seedAll_(force) {
  return {
    bookings: seedTab_('Bookings', SEED.bookings, force),
    locations: seedTab_('Locations', SEED.locations, force),
    schedule: seedTab_('Schedule', SEED.schedule, force)
  };
}

function seedTab_(name, rows, force) {
  var sh = sheet_(name);
  var headers = TABS[name];
  var have = {};
  var last = sh.getLastRow();
  if (last >= 2) {
    sh.getRange(2, 1, last - 1, 1).getValues().forEach(function (r) {
      if (String(r[0]).trim()) have[String(r[0])] = true;
    });
  }
  var toAdd = [];
  rows.forEach(function (obj) {
    if (have[String(obj.id)] && !force) return;
    if (have[String(obj.id)] && force) return; // force path is used after a wipe
    toAdd.push(headers.map(function (h) {
      var v = obj[h];
      if (v === undefined || v === null) v = '';
      return NUMERIC[h] ? (v === '' ? '' : Number(v)) : String(v);
    }));
  });
  if (toAdd.length) {
    sh.getRange(sh.getLastRow() + 1, 1, toAdd.length, headers.length).setValues(toAdd);
  }
  // keep date and time columns as plain text so they round-trip unchanged
  if (sh.getLastRow() > 1) {
    headers.forEach(function (h, i) {
      if (h === 'date' || h === 'time' || h === 'planned_time') {
        sh.getRange(2, i + 1, sh.getLastRow() - 1, 1).setNumberFormat('@');
      }
    });
  }
  return { added: toAdd.length, total: sh.getLastRow() - 1 };
}
