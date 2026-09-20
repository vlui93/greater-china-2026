/* Tripwire for the two committed artifacts. This repo is public and GitHub
 * Pages serves it to anyone who finds the URL, so index.html and Code.gs must
 * ship with no trip content in them — the Sheet is the only place the itinerary
 * lives. Both build scripts run this before writing.
 *
 * The check is against the real content when it is on this machine: if the
 * gitignored src/seed.json is present, no id and no Chinese name from it may
 * appear in the artifact. On a fresh clone there is nothing to compare with, so
 * the size ceiling is the backstop — the old seeded index.html was 184KB. */
const fs = require('fs'), path = require('path');

const CEILING_KB = { 'index.html': 110, 'Code.gs': 60 };

module.exports = function assertNoTripContent(text, what) {
  const seedPath = path.join(__dirname, 'seed.json');
  if (fs.existsSync(seedPath)) {
    const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));
    const needles = [];
    for (const group of ['bookings', 'locations', 'schedule']) {
      for (const row of seed[group] || []) {
        if (row.id) needles.push(row.id);
        if (row.name_zh) needles.push(row.name_zh);
      }
    }
    const leaked = needles.filter(n => text.includes(n));
    if (leaked.length) {
      throw new Error(what + ' contains trip content from src/seed.json (' +
        leaked.slice(0, 5).join(', ') + (leaked.length > 5 ? ', …' : '') + '). ' +
        'This repo is public — that content belongs in the Sheet only.');
    }
  }
  const kb = Buffer.byteLength(text, 'utf8') / 1024;
  const max = CEILING_KB[path.basename(what)];
  if (max && kb > max) {
    throw new Error(what + ' is ' + kb.toFixed(0) + 'KB, over the ' + max + 'KB ceiling. ' +
      'That usually means trip data has been baked back into a committed file.');
  }
};
