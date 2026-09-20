#!/usr/bin/env node
/**
 * Writes Code.READY.local.gs — the copy you actually paste into Apps Script.
 * It is the committed Code.gs with two things filled in that never go near git:
 * your API key, and the trip content from src/seed.json.
 *
 *   node src/prepare-code.js <api-key>
 *   node src/prepare-code.js --generate     make a key up for you
 *
 * Gitignored via *.local.gs.
 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const { injectSeed } = require('./seed-inject');
const root = path.join(__dirname, '..');

let key = process.argv[2];
if (!key) { console.error('Usage: node src/prepare-code.js <api-key> | --generate'); process.exit(1); }
if (key === '--generate') {
  const a = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  key = 'gc26-' + Array.from(crypto.randomBytes(28)).map(b => a[b % a.length]).join('');
}
if (key.length < 16) { console.error('Key is too short — use at least 16 characters.'); process.exit(1); }

const seedPath = path.join(__dirname, 'seed.json');
if (!fs.existsSync(seedPath)) {
  console.error('src/seed.json is missing. It is gitignored, so a fresh clone does not have it.');
  console.error('Build it from the per-city files with:  node src/build-seed.js');
  console.error('If you no longer have those either, recover them from git history — see the README.');
  process.exit(1);
}
const seed = JSON.parse(fs.readFileSync(seedPath, 'utf8'));

const src = fs.readFileSync(path.join(root, 'Code.gs'), 'utf8');
const placeholder = "var API_KEY = 'CHANGE-ME-to-a-long-random-string';";
if (!src.includes(placeholder)) { console.error('Placeholder not found in Code.gs'); process.exit(1); }

const out = injectSeed(
  src.replace(placeholder, `var API_KEY = '${key}';`)
     .replace(' *   2. Edit API_KEY below to a long random string of your own.\n',
              ' *   2. API_KEY is already filled in for you in this copy.\n'),
  seed);

const dest = path.join(root, 'Code.READY.local.gs');
fs.writeFileSync(dest, out, 'utf8');
fs.chmodSync(dest, 0o600);
console.log('Wrote Code.READY.local.gs (gitignored, chmod 600)');
console.log('  ' + seed.locations.length + ' locations, ' + seed.bookings.length +
            ' bookings, ' + seed.schedule.length + ' scheduled stops baked in');
console.log('API key: ' + key);
console.log('\nNow run:  ./src/copy-code.sh');
