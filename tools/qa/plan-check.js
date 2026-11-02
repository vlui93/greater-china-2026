#!/usr/bin/env node
/* The QA pass of the trip-prep skill, made mechanical: checks a planned trip
 * against the scheduling rules learned on the first trip, before it goes to
 * the travellers for review. Each rule is a thing that went wrong there:
 *   - a run of heavy days — day trips, early starts, altitude, long transfers.
 *     Four in a row was the low point; 10+ short stops in a walkable city was fine,
 *     so the stop count is only a sanity limit;
 *   - no flex time, so planned stops were dropped to make some;
 *   - a meal slot with nothing planned, or no alternative to switch to;
 *   - spicy food planned for travellers who wanted mild, with no label;
 *   - a place planned on a day its notes say it's closed (a hint to check:
 *     often only part of it closes, so never an error);
 *   - places missing the Chinese name, city or map app the phone needs.
 *
 * Usage:
 *   node tools/qa/plan-check.js <trip.json | sheet-reads-dir> [--trip <trip_id>]
 *        [--max-stops 12] [--flex-every 4] [--no-spice]
 * trip.json is the app's data shape ({locations, schedule, bookings, days});
 * a directory is one saved by the Sheet gate (.qa/state/reads/<sheetId>/),
 * holding Locations.json, Schedule.json and optionally Bookings.json, Days.json.
 * Mark days in the Days tab label with "heavy" or "flex" to override the guess.
 * Prints findings; exits 1 if any are errors. Reads only — changes nothing. */
const fs = require('fs'), path = require('path');

const args = process.argv.slice(2);
const VALUED = ['--trip', '--max-stops', '--flex-every'];
const opt = (k, d) => { const i = args.indexOf(k); return i >= 0 ? args[i + 1] : d; };
const src = args.find((a, i) => !a.startsWith('--') && !VALUED.includes(args[i - 1]));
if (!src) { console.error('usage: plan-check.js <trip.json | sheet-reads-dir> [--trip id] [--max-stops 12] [--flex-every 4] [--no-spice]'); process.exit(2); }
const MAX = +opt('--max-stops', 12), FLEX = +opt('--flex-every', 4), SPICE = !args.includes('--no-spice');
const TRIP = opt('--trip', null);

function rowsOf(file) {
  if (!fs.existsSync(file)) return [];
  const v = JSON.parse(fs.readFileSync(file, 'utf8')).values || [];
  const h = v[0] || [];
  return v.slice(1).filter(r => r && String(r[0] || '').trim())
    .map(r => Object.fromEntries(h.map((k, i) => [k, r[i] == null ? '' : String(r[i])])));
}
function load(p) {
  if (fs.statSync(p).isDirectory()) {
    const t = { locations: rowsOf(path.join(p, 'Locations.json')), schedule: rowsOf(path.join(p, 'Schedule.json')),
                bookings: rowsOf(path.join(p, 'Bookings.json')), days: rowsOf(path.join(p, 'Days.json')) };
    if (!t.locations.length) { console.error('plan-check: no Locations.json in ' + p + ' — read the Locations tab first'); process.exit(2); }
    return t;
  }
  const d = JSON.parse(fs.readFileSync(p, 'utf8'));
  return { locations: d.locations || [], schedule: d.schedule || [], bookings: d.bookings || [], days: d.days || [] };
}
const T = load(src);
const inTrip = r => !TRIP || String(r.trip_id || '') === TRIP || (!r.trip_id && TRIP === 'default');
const loc = Object.fromEntries(T.locations.map(l => [l.id, l]));
const sched = T.schedule.filter(inTrip);
const label = Object.fromEntries(T.days.filter(inTrip).map(d => [d.date, d.label || '']));
const isOpt = s => /^\s*OPTIONAL\b/i.test(s.notes || '');
const DOW = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
const dow = iso => DOW[new Date(iso + 'T12:00:00Z').getUTCDay()];
const MOVE = /^(flight|train|ferry)$/;
const HEAVY_WORDS = /day trip|altitude|full day|all day|early start/i;

const out = []; let errors = 0;
const say = (lvl, where, msg) => { out.push((lvl === 'error' ? 'ERROR ' : 'warn  ') + where + ': ' + msg); if (lvl === 'error') errors++; };

const dates = [...new Set(sched.map(s => s.date).filter(Boolean))].sort();
const day = {};
dates.forEach(d => {
  const all = sched.filter(s => s.date === d);
  const planned = all.filter(s => !isOpt(s));
  const stops = planned.filter(s => (loc[s.location_id] || {}).type !== 'hotel');
  const meals = planned.filter(s => (loc[s.location_id] || {}).type === 'restaurant');
  const moves = T.bookings.filter(b => inTrip(b) && b.date === d && MOVE.test(b.type || ''));
  // Heavy: the label says so, a move with sightseeing on top, an early start,
  // a long day, or a day trip / altitude / all-day stop.
  const times = planned.map(s => String(s.planned_time || '').slice(0, 5)).filter(t => /^\d\d:\d\d$/.test(t)).sort();
  const span = times.length > 1 ? +times[times.length - 1].slice(0, 2) - +times[0].slice(0, 2) : 0;
  // Strong signals make a run of heavy days an error; a long day alone only
  // warns (long city days with an evening dinner were fine).
  const why = [], weak = [];
  if (/heavy/i.test(label[d] || '')) why.push('labelled heavy');
  if (moves.length && stops.length >= 3) why.push('travel day with sightseeing');
  if (planned.some(s => HEAVY_WORDS.test((s.notes || '') + ' ' + ((loc[s.location_id] || {}).notes || '')))) why.push('day trip, altitude or all-day');
  if (times.length && times[0] < '07:00') weak.push('starts before 07:00');
  if (span >= 13) weak.push(span + ' h from first to last stop');
  const flex = /flex|rest|free/i.test(label[d] || '') || (!why.length && !weak.length && stops.length <= 2);
  const light = /light|flex/i.test(label[d] || '');
  day[d] = { heavy: !light && (why.length + weak.length) > 0, strong: !light && why.length > 0, why: why.concat(weak).join(', '), flex };

  if (stops.length > MAX) say('warn', d, stops.length + ' planned stops (sanity limit ' + MAX + ') — move some to OPTIONAL');
  if (!moves.length && meals.length < 2 && !flex) say('warn', d, 'only ' + meals.length + ' planned meal(s) — plan lunch and dinner');
  if (!all.some(isOpt) && !flex) say('warn', d, 'no OPTIONAL alternative to switch to on the ground');
  all.forEach(s => {
    const l = loc[s.location_id];
    if (!l) { say('error', d, 'stop ' + s.id + ' points at a missing place ' + s.location_id); return; }
    const closed = [l.notes, l.tickets, l.history_blurb].join(' ').match(/closed (?:on )?((?:mon|tues|wednes|thurs|fri|satur|sun)days?)/i);
    if (closed && closed[1].toLowerCase().startsWith(dow(d).slice(0, 3)))
      say('warn', d, (l.name_en || l.id) + ': its notes say "' + closed[0].toLowerCase() + '" and this is a ' + dow(d) + ' — check (often only part of it closes)');
  });
});
// Runs of heavy days, and stretches with no flex
let run = 0, strong = 0, since = 0;
dates.forEach(d => {
  run = day[d].heavy ? run + 1 : 0;
  strong = day[d].strong ? strong + 1 : 0;
  if (run >= 2) say(strong >= 2 ? 'error' : 'warn', d, 'heavy day ' + run + ' in a row (' + day[d].why + ') — put a light day or flex half-day between, or label it "light" in Days if it is');
  since = day[d].flex ? 0 : since + 1;
  if (since === FLEX + 1) say('warn', d, (FLEX + 1) + ' days in a row without a flex half-day');
});
// Places on the plan
const used = new Set(sched.map(s => s.location_id));
T.locations.filter(l => used.has(l.id)).forEach(l => {
  const w = l.name_en || l.id;
  if (!l.name_zh) say('error', w, 'no Chinese/local name — map searches and drivers need it');
  if (!l.city) say('error', w, 'no city');
  if (!l.nav_app) say('warn', w, 'no nav_app (amap on the mainland, google elsewhere)');
  if (!(l.lat && l.lng)) say('warn', w, 'no pin — the app will search the name instead');
  if (SPICE && l.type === 'restaurant' && !/^\s*Spice:\s*\S/im.test(l.notes || ''))
    say('warn', w, 'no "Spice:" line in notes (none / mild options / spicy)');
});

const hv = dates.filter(d => day[d].heavy);
console.log(out.length ? out.join('\n') : 'No findings.');
if (hv.length) console.log('\nheavy days: ' + hv.map(d => d.slice(5) + ' (' + day[d].why + ')').join('; '));
console.log('\nplan-check: ' + dates.length + ' days, ' + sched.length + ' stops, ' + errors + ' error(s), ' +
  out.filter(l => l.startsWith('warn')).length + ' warning(s)');
process.exit(errors ? 1 : 0);
