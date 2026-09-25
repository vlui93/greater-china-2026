/* Builds the notes file that phones import (⚙ Settings → Import trip notes)
 * and that `node src/sheet.js push` can send to the Sheet:
 *   - each place's getting_there / arrive_by / tickets, and nothing else about it
 *   - the shared checklist and packing items (src/seed-checklist.json)
 *   - the personal packing template, which each phone copies into its own list
 * Only those fields, so importing or pushing it never overwrites your own edits
 * to anything else. Reads gitignored files; writes trip-notes.local.json, which
 * is gitignored too (*.local.json). */
const fs = require('fs'), path = require('path');
const R = f => JSON.parse(fs.readFileSync(path.join(__dirname, f), 'utf8'));
const seed = R('seed.json');
const ck = fs.existsSync(path.join(__dirname, 'seed-checklist.json')) ? R('seed-checklist.json') : { checklist: [], packing: [] };

const out = {
  kind: 'greater-china-trip-notes', version: 2, generated: new Date().toISOString().slice(0, 10),
  note: 'Phone: Settings -> Import trip notes. Laptop: node src/sheet.js push <this file>, after upgrading the backend (README §9).',
  locations: seed.locations.map(l => ({ id: l.id, getting_there: l.getting_there || '', arrive_by: l.arrive_by || '', tickets: l.tickets || '' })),
  checklist: ck.checklist.map(i => ({ id: i.id, kind: i.kind, section: i.section, text: i.text, due: i.due || '',
                                      location_id: i.location_id || '', order_index: i.order_index })),
  packing: ck.packing
};
const dest = path.join(__dirname, '..', 'trip-notes.local.json');
fs.writeFileSync(dest, JSON.stringify(out, null, 1));
console.log(`trip-notes.local.json: ${out.locations.length} places, ${out.checklist.length} checklist items, ${out.packing.length} packing items`);
