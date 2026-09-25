#!/usr/bin/env node
/**
 * CLI for the trip app's Google Sheet backend.
 *
 * Credentials live in .sheet.local.json (gitignored) — never in the repo:
 *   { "url": "https://script.google.com/macros/s/.../exec", "key": "..." }
 *
 *   node src/sheet.js init <url> <key>     save credentials locally
 *   node src/sheet.js ping                 check the connection
 *   node src/sheet.js pull                 print what is in the Sheet
 *   node src/sheet.js backup [file]        save a full JSON snapshot
 *   node src/sheet.js push <file.json>     upsert bookings/locations/schedule
 *   node src/sheet.js diff <file.json>     show what push would change
 */
const fs = require('fs');
const path = require('path');

const CFG = path.join(__dirname, '..', '.sheet.local.json');

function cfg() {
  if (!fs.existsSync(CFG)) {
    die('No credentials yet. Run:\n  node src/sheet.js init "<web app /exec url>" "<api key>"');
  }
  const c = JSON.parse(fs.readFileSync(CFG, 'utf8'));
  if (!c.url || !c.key) die('.sheet.local.json is missing url or key.');
  return c;
}
function die(msg) { console.error('\n' + msg + '\n'); process.exit(1); }

async function call(action, payload) {
  const c = cfg();
  // text/plain keeps this a CORS-simple request, which is what Code.gs expects
  const res = await fetch(c.url, {
    method: 'POST',
    headers: { 'Content-Type': 'text/plain;charset=utf-8' },
    body: JSON.stringify({ key: c.key, action, payload: payload || null }),
    redirect: 'follow'
  });
  const text = await res.text();
  let j;
  try { j = JSON.parse(text); }
  catch {
    die('Backend did not return JSON (HTTP ' + res.status + ').\n' +
        'Usually means the deployment is set to "Only myself" instead of "Anyone",\n' +
        'or the URL is the /dev one rather than /exec.\n\n' + text.slice(0, 300));
  }
  if (!j.ok) die('Backend error: ' + j.error);
  return j.data;
}

const ACTION = { bookings: 'saveBooking', locations: 'saveLocation', schedule: 'saveScheduleEntry',
                 checklist: 'saveChecklistItem' };

async function main() {
  const [cmd, ...args] = process.argv.slice(2);

  if (cmd === 'init') {
    const [url, key] = args;
    if (!url || !key) die('Usage: node src/sheet.js init "<url>" "<key>"');
    if (!/\/exec\/?$/.test(url)) {
      console.warn('! That URL does not end in /exec — the /dev URL will not work from the app.');
    }
    fs.writeFileSync(CFG, JSON.stringify({ url, key }, null, 2) + '\n');
    fs.chmodSync(CFG, 0o600);
    console.log('Saved to .sheet.local.json (gitignored, chmod 600). Now run: node src/sheet.js ping');
    return;
  }

  if (cmd === 'ping') {
    const d = await call('ping');
    const all = await call('all');
    console.log('Connected. Server time ' + d.time);
    console.log(`  bookings  ${all.bookings.length}`);
    console.log(`  locations ${all.locations.length}`);
    console.log(`  schedule  ${all.schedule.length}`);
    return;
  }

  if (cmd === 'pull') {
    const d = await call('all');
    for (const tab of ['bookings', 'locations', 'schedule']) {
      console.log(`\n=== ${tab} (${d[tab].length}) ===`);
      for (const r of d[tab]) {
        console.log('  ' + r.id.padEnd(22) +
          (r.description || [r.name_en, r.name_zh].filter(Boolean).join(' / ') ||
           `${r.date} #${r.order_index} ${r.location_id}`).slice(0, 80));
      }
    }
    return;
  }

  if (cmd === 'backup') {
    const out = args[0] || path.join(__dirname, '..', '..', '..',
      `sheet-backup-${new Date().toISOString().slice(0, 10)}.json`);
    const d = await call('all');
    fs.writeFileSync(out, JSON.stringify(d, null, 1));
    console.log(`Saved ${d.bookings.length} bookings, ${d.locations.length} locations, ` +
                `${d.schedule.length} schedule rows to\n  ${out}`);
    return;
  }

  if (cmd === 'diff' || cmd === 'push') {
    const file = args[0];
    if (!file) die(`Usage: node src/sheet.js ${cmd} <file.json>`);
    const incoming = JSON.parse(fs.readFileSync(file, 'utf8'));
    const live = await call('all');

    let planned = 0;
    const plan = [];
    for (const tab of ['bookings', 'locations', 'schedule', 'checklist']) {
      if (!live[tab]) {
        // A backend from before this tab existed returns nothing for it, and
        // would silently drop every row sent. Stop before sending anything.
        if ((incoming[tab] || []).length) {
          die(`The Sheet backend has no ${tab} tab yet. Paste the new Code.gs and deploy a new ` +
              `version first (README §9), then run this again.`);
        }
        continue;
      }
      for (const row of incoming[tab] || []) {
        // A row that names its place instead of giving an id is for a phone to
        // match by name. Sent from here it would be added as a new, duplicate
        // place, so skip it.
        if (!row.id) { console.log(`skipping a ${tab} row with no id (phone import only): ${row.name_zh || row.name_en || row.text || '?'}`); continue; }
        const existing = row.id && live[tab].find(r => r.id === row.id);
        const changed = existing
          ? Object.keys(row).filter(k => String(row[k] ?? '') !== String(existing[k] ?? ''))
          : null;
        if (existing && !changed.length) continue;
        plan.push({ tab, row, verb: existing ? 'update' : 'add', fields: changed });
        planned++;
      }
    }

    if (!planned) { console.log('Nothing to do — the Sheet already matches.'); return; }

    // Guard: src/seed.json deliberately has blank confirmation numbers because the
    // repo is public. Pushing it over a Sheet that holds the real ones would erase
    // them. Refuse unless explicitly forced.
    const destructive = plan.filter(p =>
      p.verb === 'update' && p.fields && p.fields.includes('confirmation_no') &&
      !String(p.row.confirmation_no || '').trim());
    if (destructive.length && cmd === 'push' && !process.argv.includes('--allow-blanking')) {
      console.error('\nREFUSED: this would blank the confirmation number on ' +
        destructive.length + ' booking(s):');
      for (const p of destructive) console.error('  ' + p.row.id + '  ' + String(p.row.description || '').slice(0, 55));
      console.error('\nThose references live only in the Sheet, not in this public repo.');
      console.error('If you really mean it, re-run with --allow-blanking.\n');
      process.exit(1);
    }
    if (destructive.length && cmd === 'diff') {
      console.log('\n! ' + destructive.length + ' of these would BLANK a confirmation number.');
    }

    for (const p of plan) {
      const label = p.row.description || [p.row.name_en, p.row.name_zh].filter(Boolean).join(' / ') || p.row.id;
      console.log(`  ${p.verb.padEnd(6)} ${p.tab.padEnd(10)} ${String(label).slice(0, 58)}` +
                  (p.fields && p.fields.length ? `   [${p.fields.join(', ')}]` : ''));
    }

    if (cmd === 'diff') { console.log(`\n${planned} change(s). Run push to apply.`); return; }

    let done = 0;
    for (const p of plan) { await call(ACTION[p.tab], p.row); done++; }
    console.log(`\nApplied ${done} change(s).`);
    return;
  }

  console.log(fs.readFileSync(__filename, 'utf8').split('*/')[0].split('/**')[1].replace(/^ ?\* ?/gm, ''));
}

main().catch(e => die(e.message));
