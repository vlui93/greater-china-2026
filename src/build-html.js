/* index.html is the template with one thing filled in: the names of the
 * functions and actions that live in the on-demand files (prep.js,
 * bookings.js, manage.js, extras.js, more.js), so the page can fetch a file the first
 * time something in it is called. No trip content is injected: the app arrives
 * on the phone empty and fills itself from the Sheet on first connect. */
const fs = require('fs'), path = require('path');
const assertNoTripContent = require('./no-trip-content');
const d = __dirname, root = path.join(d, '..');
const PART_FILES = ['prep', 'bookings', 'manage', 'extras', 'more'];
let tpl = fs.readFileSync(path.join(d, 'index.template.html'), 'utf8');
if (tpl.includes('/*__SEED__*/')) throw new Error('template still has the old seed placeholder');

/* A part's functions are its top-level `function name(` lines (column 0, as
 * the whole app is written); its actions are its onAct("name", ...) calls. */
const parts = {}, acts = {}, owner = {};
const core = new Set((tpl.match(/^(?:async )?function [A-Za-z_$][\w$]*/gm) || []).map(s => s.replace(/^(?:async )?function /, '')));
PART_FILES.forEach(name => {
  const src = fs.readFileSync(path.join(root, name + '.js'), 'utf8');
  parts[name] = (src.match(/^(?:async )?function [A-Za-z_$][\w$]*/gm) || []).map(s => s.replace(/^(?:async )?function /, ''));
  parts[name].forEach(fn => {
    if (core.has(fn)) throw new Error(name + '.js and index.template.html both define ' + fn + '()');
    if (owner[fn]) throw new Error(name + '.js and ' + owner[fn] + '.js both define ' + fn + '()');
    owner[fn] = name;
  });
  (src.match(/^onAct\("[^"]+"/gm) || []).forEach(s => {
    const a = s.slice(7, -1);
    if (acts[a]) throw new Error('action "' + a + '" is registered in both ' + acts[a] + '.js and ' + name + '.js');
    acts[a] = name;
  });
});
['/*__PARTS__*/{}', '/*__PART_ACTS__*/{}'].forEach(ph => { if (tpl.split(ph).length !== 2) throw new Error('template needs exactly one ' + ph); });
tpl = tpl.replace('/*__PARTS__*/{}', JSON.stringify(parts)).replace('/*__PART_ACTS__*/{}', JSON.stringify(acts));
assertNoTripContent(tpl, 'index.html');   // checked as what it becomes, so the size ceiling applies
fs.writeFileSync(path.join(root, 'index.html'), tpl);
console.log('index.html written:', (fs.statSync(path.join(root, 'index.html')).size / 1024).toFixed(0) + 'KB; on demand: ' +
  PART_FILES.map(n => n + '.js ' + (fs.statSync(path.join(root, n + '.js')).size / 1024).toFixed(0) + 'KB (' + parts[n].length + ' functions)').join(', '));
