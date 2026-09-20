const fs = require('fs');
const path = require('path');
const R = f => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));

const bookings = R('seed-bookings.json');
const locations = [].concat(R('seed-loc-hk.json'), R('seed-loc-mo.json'), R('seed-loc-gz.json'), R('seed-loc-cq.json'), R('seed-loc-cd.json'));
const sched = R('schedule.json');

const ids = new Set(locations.map(l => l.id));
const schedule = [];
let n = 0;
for (const date of Object.keys(sched).sort()) {
  sched[date].forEach(([location_id, planned_time, notes], i) => {
    if (!ids.has(location_id)) throw new Error('unknown location in schedule: ' + location_id);
    schedule.push({ id: 'sc-' + String(++n).padStart(3, '0'), date, order_index: i + 1, location_id, planned_time, notes: notes || '' });
  });
}

// validation
const required = ['id','name_en','name_zh','city','type','lat','lng','nav_app','history_blurb','recommendations','dishes_to_order','souvenirs','notes'];
const problems = [];
for (const l of locations) {
  for (const k of required) if (!(k in l)) problems.push(`${l.id} missing ${k}`);
  if (!l.name_zh || !/[㐀-鿿]/.test(l.name_zh)) problems.push(`${l.id} name_zh not Chinese: ${l.name_zh}`);
  if (!l.name_en) problems.push(`${l.id} missing name_en`);
  const expected = (l.city === 'Hong Kong' || l.city === 'Macau') ? 'google' : 'amap';
  if (l.nav_app !== expected) problems.push(`${l.id} nav_app ${l.nav_app} should be ${expected}`);
  if (!l.history_blurb || l.history_blurb.length < 80) problems.push(`${l.id} thin history_blurb`);
  if (!l.recommendations) problems.push(`${l.id} no recommendations`);
  if (l.type === 'restaurant' && !l.dishes_to_order) problems.push(`${l.id} restaurant with no dishes`);
  if (typeof l.lat !== 'number' || typeof l.lng !== 'number') problems.push(`${l.id} bad coords`);
}
// This repo is public. Real confirmation numbers belong in the Google Sheet,
// never in seed data — the Sheet is private to the owner's Google account.
for (const b of bookings) {
  if (String(b.confirmation_no || '').trim()) {
    problems.push(`${b.id} has a confirmation_no in seed data — put it in the Sheet, not the repo`);
  }
  // case-sensitive on purpose: a real reference is upper-case alnum, prose is not
  const leak = String(b.details || '')
    .match(/\b(?:PNR|Booking No\.?|Confirmation No\.?|Ref\.?)\s*:?\s*([A-Z0-9]{6,})\b/);
  if (leak) problems.push(`${b.id} details look like they contain a booking reference: "${leak[0]}"`);
}

const dupes = locations.map(l=>l.id).filter((v,i,a)=>a.indexOf(v)!==i);
if (dupes.length) problems.push('duplicate ids: ' + dupes.join(','));

if (problems.length) { console.error('VALIDATION FAILED:\n' + problems.join('\n')); process.exit(1); }

const out = { bookings, locations, schedule };
fs.writeFileSync(path.join(__dirname, 'seed.json'), JSON.stringify(out, null, 1));
const byCity = {};
locations.forEach(l => byCity[l.city] = (byCity[l.city]||0)+1);
console.log('OK  locations:', locations.length, JSON.stringify(byCity));
console.log('    bookings:', bookings.length, ' schedule rows:', schedule.length, ' days:', Object.keys(sched).length);
const unsched = locations.filter(l => !schedule.some(s => s.location_id === l.id));
console.log('    unscheduled locations:', unsched.length ? unsched.map(l=>l.id).join(', ') : 'none');
