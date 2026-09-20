/* index.html is the template verbatim. Nothing is injected: the app arrives on
 * the phone empty and fills itself from the Sheet on first connect. */
const fs = require('fs'), path = require('path');
const assertNoTripContent = require('./no-trip-content');
const d = __dirname;
const tpl = fs.readFileSync(path.join(d, 'index.template.html'), 'utf8');
if (tpl.includes('/*__SEED__*/')) throw new Error('template still has the old seed placeholder');
assertNoTripContent(tpl, 'index.template.html');
fs.writeFileSync(path.join(d, '..', 'index.html'), tpl);
console.log('index.html written:', (fs.statSync(path.join(d, '..', 'index.html')).size / 1024).toFixed(0) + 'KB');
