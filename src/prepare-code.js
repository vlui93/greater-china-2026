#!/usr/bin/env node
/**
 * Writes Code.READY.local.gs — a copy of Code.gs with the API key filled in.
 * Gitignored via *.local.gs, so the key never reaches the public repo.
 *
 *   node src/prepare-code.js <api-key>
 *   node src/prepare-code.js --generate     make a key up for you
 */
const fs = require('fs'), path = require('path'), crypto = require('crypto');
const root = path.join(__dirname, '..');

let key = process.argv[2];
if (!key) { console.error('Usage: node src/prepare-code.js <api-key> | --generate'); process.exit(1); }
if (key === '--generate') {
  const a = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  key = 'gc26-' + Array.from(crypto.randomBytes(28)).map(b => a[b % a.length]).join('');
}
if (key.length < 16) { console.error('Key is too short — use at least 16 characters.'); process.exit(1); }

const src = fs.readFileSync(path.join(root, 'Code.gs'), 'utf8');
const placeholder = "var API_KEY = 'CHANGE-ME-to-a-long-random-string';";
if (!src.includes(placeholder)) { console.error('Placeholder not found in Code.gs'); process.exit(1); }

const out = src
  .replace(placeholder, `var API_KEY = '${key}';`)
  .replace(' *   2. Edit API_KEY below to a long random string of your own.\n',
           ' *   2. API_KEY is already filled in for you in this copy.\n');

const dest = path.join(root, 'Code.READY.local.gs');
fs.writeFileSync(dest, out, 'utf8');
fs.chmodSync(dest, 0o600);
console.log('Wrote Code.READY.local.gs (gitignored, chmod 600)');
console.log('API key: ' + key);
console.log('\nNow run:  ./src/copy-code.sh');
