/* Code.gs is head + an empty seed + tail. The trip content is deliberately not
 * in it: this repo is public. src/prepare-code.js builds the copy you paste
 * into Apps Script, with your API key and your seed content filled in. */
const fs = require('fs'), path = require('path');
const assertNoTripContent = require('./no-trip-content');
const { PLACEHOLDER_END } = require('./seed-inject');
const d = __dirname;
const head = fs.readFileSync(path.join(d, 'Code.head.gs'), 'utf8');
const tail = fs.readFileSync(path.join(d, 'Code.tail.gs'), 'utf8');

const seedBlock = '\n// ===========================================================================\n' +
  '// SEED DATA — not in this repo.\n' +
  '//\n' +
  '// Pasting this file into Apps Script and running setup() creates the three\n' +
  '// tabs and leaves them empty. To get the trip into them, build the local copy\n' +
  '// instead:  node src/prepare-code.js --generate  &&  ./src/copy-code.sh\n' +
  '// That copy carries your API key and your seed content and is gitignored.\n' +
  '// ===========================================================================\n\n' +
  'var SEED = { bookings: [], locations: [], schedule: [] }; ' + PLACEHOLDER_END + '\n';

const out = head + seedBlock + tail;
assertNoTripContent(out, 'Code.gs');
fs.writeFileSync(path.join(d, '..', 'Code.gs'), out);
console.log('Code.gs written:', (fs.statSync(path.join(d, '..', 'Code.gs')).size / 1024).toFixed(0) + 'KB');
