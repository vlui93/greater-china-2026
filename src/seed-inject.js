/* Puts trip content back into a copy of Code.gs.
 *
 * The committed Code.gs carries an empty SEED. The copy you actually paste into
 * Apps Script — Code.READY.local.gs — is built locally and gitignored, and this
 * is what fills it in. The tests use the same function so they exercise the
 * seeding path without that content ever being committed. */
const PLACEHOLDER_END = '// __SEED__';

function injectSeed(code, seed) {
  const line = code.split('\n').find(l => l.trimEnd().endsWith(PLACEHOLDER_END));
  if (!line) throw new Error('no "' + PLACEHOLDER_END + '" line in Code.gs — nothing to fill in');
  return code.replace(line, 'var SEED = ' + JSON.stringify(seed, null, 1) + ';');
}

module.exports = { injectSeed, PLACEHOLDER_END };
