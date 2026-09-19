const fs = require('fs'), path = require('path');
const d = __dirname;
const seed = JSON.parse(fs.readFileSync(path.join(d, 'seed.json'), 'utf8'));
const head = fs.readFileSync(path.join(d, 'Code.head.gs'), 'utf8');
const tail = fs.readFileSync(path.join(d, 'Code.tail.gs'), 'utf8');

const seedBlock = '\n// ===========================================================================\n' +
  '// SEED DATA — the trip as originally planned. Edited copies live in the Sheet.\n' +
  '// ===========================================================================\n\n' +
  'var SEED = ' + JSON.stringify(seed, null, 1) + ';\n';

fs.writeFileSync(path.join(d, '..', 'Code.gs'), head + seedBlock + tail);
console.log('Code.gs written:', (fs.statSync(path.join(d, '..', 'Code.gs')).size / 1024).toFixed(0) + 'KB');
