# Greater China 2026 — trip companion

A single-page trip app for **16 Oct – 1 Nov 2026**: Sydney → Hong Kong → Macau → Guangzhou → Foshan → Chongqing → Chengdu → Sydney.

**Live:** https://vlui93.github.io/greater-china-2026/

Vanilla HTML/CSS/JS, no build step, no framework. Data lives in a Google Sheet behind an Apps Script web app. Everything is cached on the phone, so the app works with no signal at all.

**Nothing about the trip is in this repo.** This repository is public and GitHub Pages serves it to anyone who finds the URL, so the page ships empty: no places, no bookings, no schedule. Open it without the API key and all you get is a connect screen. The content lives in the Google Sheet, and on the phones that have connected to it. See [What is and is not in this repo](#11-what-is-and-is-not-in-this-repo).

- 68 locations, every one with both an English and a Chinese name
- Per-day schedule you can reorder, add to and edit on the phone
- One-tap navigation that opens Amap on the mainland and Google Maps in Hong Kong and Macau
- Tour-guide content for every seeded place: background, what to do, what to order, what to buy
- Bookings list with confirmation numbers

---

## 1. Set up the backend (about 10 minutes)

### 1.1 Create the Sheet

1. Go to https://sheets.new — a new blank Google Sheet.
2. Name it something like **Greater China 2026**.
3. **Extensions → Apps Script.** A script editor opens in a new tab.

### 1.2 Paste the script

4. Build a copy with your key and your trip content in it, and put it on the clipboard:

   ```bash
   node src/build-seed.js                # src/seed-*.json -> src/seed.json
   node src/prepare-code.js --generate   # or pass your own key
   ./src/copy-code.sh
   ```

   The committed `Code.gs` has an empty `SEED` — run *that* and you get three empty
   tabs. `prepare-code.js` writes `Code.READY.local.gs`, which is the same script with
   your API key and the content of `src/seed.json` filled in. It is gitignored via
   `*.local.gs`, so neither the key nor the trip reaches this public repo. It prints
   the key — keep it, you'll need it on the phone.

   If `src/seed.json` is not on this machine, pull it back out of the Sheet with
   `node src/sheet.js backup src/seed.json` — see
   [§11](#11-what-is-and-is-not-in-this-repo).

5. In the Apps Script editor: click into `Code.gs`, **⌘A**, **⌘V**, **⌘S**.

> **Do not use plain `pbcopy`.** With no `LC_CTYPE` set, macOS `pbcopy` assumes Mac OS
> Roman and silently mangles every Chinese character (太 becomes `Â§™`). It survives a
> `pbcopy | pbpaste` round trip in the same shell, so it looks fine locally and only
> breaks once the text reaches a UTF-8 app. `copy-code.sh` sets `LC_CTYPE=UTF-8` and
> then verifies the clipboard for mojibake markers before telling you it succeeded.
>
> If it does happen: the data is recoverable without re-running `setup()` — repaste a
> clean script, then `node src/sheet.js push src/seed.json` rewrites every field from
> local source.

### 1.3 Run the one-time setup

7. In the function dropdown at the top of the editor, choose **`setup`**, then press **Run**.
8. Google will ask for authorisation the first time:
   - *Review permissions* → pick your Google account
   - You will see **"Google hasn't verified this app"** — this is expected for your own script. Click **Advanced → Go to \<project name\> (unsafe)**.
   - **Allow.**
9. Run **`setup`** again if the first run stopped at the auth prompt. When it finishes, switch back to the Sheet: you should have three tabs — **Bookings** (10 rows), **Locations** (68 rows), **Schedule** (71 rows).

### 1.4 Deploy as a web app

10. In the Apps Script editor: **Deploy → New deployment**.
11. Click the gear next to *Select type* → **Web app**.
12. Set:
    - **Description:** anything, e.g. `v1`
    - **Execute as:** **Me**
    - **Who has access:** **Anyone**  ← see the note below
13. **Deploy**, authorise again if asked, then **copy the Web app URL**. It looks like
    `https://script.google.com/macros/s/AKfycb..../exec`

### Why "Anyone" and not "Only myself"

"Only myself" and "Anyone with a Google account" both make the endpoint redirect to a Google sign-in page. A `fetch()` from a GitHub Pages origin cannot follow that redirect — the browser blocks it as a cross-origin failure — so the app simply cannot talk to the backend under those settings. There is no workaround from a static site on a different domain.

So access control is the **API key** instead: the script rejects every request that does not carry it, and the key is never in this public repo — you type it into the app once and it stays in your phone's local storage. Anyone who found the URL without the key gets `{"ok":false,"error":"Bad or missing API key."}`.

The key is the only thing standing between the URL and the trip, so treat it like a password. If it ever ends up in a screenshot, a chat or an issue, generate a new one, repaste the script, and reconnect each phone.

This step is not optional any more. The page ships with no content in it, so until it has reached the Sheet once there is nothing for it to show.

### 1.5 Point the app at it

14. Open https://vlui93.github.io/greater-china-2026/ on your phone, **on wifi**. You get a
    connect screen — that is all an empty app can offer.
15. Paste the **Web app URL** and the **API key** → **Connect**.

The trip downloads and the app opens on it. From then on it is cached on that phone and
works with no connection. Every edit writes straight to the Sheet, and you can edit the
Sheet directly too — pull the changes with **Sync**.

The ⚙ gear has the same fields if you ever need to change them.

---

## 2. Add to the iPhone home screen

1. Open **https://vlui93.github.io/greater-china-2026/** in **Safari** (it must be Safari — Chrome on iOS cannot install to the home screen).
2. Tap the **Share** button (square with an up arrow).
3. Scroll down → **Add to Home Screen**.
4. Name it *Greater China* → **Add**.

It launches full screen with no browser chrome, its own icon, and the status bar tinted to match.

**Do this on wifi, and connect it to the Sheet before you go.** The app caches itself and then the trip, and from that point it opens and works with no connection — but the first connect has to reach Google, which you cannot do on the mainland.

Do the same on the other two phones. Each one needs the Web app URL and the API key entered once.

---

## 3. GitHub Pages

Pages is already enabled on this repo, serving `main` / root. Nothing to do.

If you ever need to re-enable it: **Settings → Pages → Source: Deploy from a branch → Branch: `main`, folder `/ (root)` → Save.** It takes a minute or two to build; the URL appears on that same page.

---

## 4. Using it

**Today / All Days.** Today opens on whichever day matches the real date, or Day 1 if you are outside the trip window. Each stop is a card: tap the body for the full guide entry, tap the blue or red arrow to navigate.

**Without the Sheet.** A phone that isn't connected works fully: everything is saved on it, and every add, edit and reorder is queued. The badge says how many — *Local only · 3 to upload* — and they're sent, in order, the first time the phone connects. Before this, a place added on an unconnected phone wasn't queued, and the first sync replaced the phone's list with the Sheet's, so it vanished. Such places are now found by their phone-made ids and queued once when the app opens.

**Reordering.** Each card has a tool strip: drag the `⠿` handle, or use ▲ ▼. **TIME** sets the planned time, **NOTE** sets the one-line summary on the card, **REMOVE** takes it off the day. Every change writes to the Sheet immediately.

**Adding.** *+ Add a stop* picks from the places you already have. *+ New place* creates one — and the quickest way is to paste a map link into the box at the top. In Google Maps or Amap, tap **Share → Copy**, then tap **Paste** in the app. It fills in the name, city, map app, a best guess at the type, the address into notes, and the pin. Pins from the mainland come on the Chinese map grid (GCJ-02) and are moved back to GPS for you — usually 300–700 m. Hong Kong and Macau pins are left as they are. On the mainland, share from Amap rather than Google: Amap gives you the Chinese name, and Google usually only the English one. If the place is already on your list, it says so.

Short links (`maps.app.goo.gl`, `surl.amap.com`) have to be looked up by the backend, since a page can't follow a redirect to another site; that needs the backend update in §9. Full links, and the Chinese name and address in Amap's share text, work without it — and a place with only a Chinese name still navigates, because the map app searches for it.

**Search.** Works on both names, and on partial Chinese — two or three characters of a name is enough to find it, and the romanised English spelling finds it too. No need to type the whole thing either way.

**Navigation.** Every location carries a `nav_app` flag. Mainland places open **Amap 高德**, Hong Kong and Macau open **Google Maps**. The app tries the native URL scheme first and falls back to the web version after 1.4 seconds if the app is not installed — the Amap web fallback offers the App Store, the Google one just works in the browser. The magnifier button next to *Navigate* searches the Chinese name instead of dropping a pin, which is the better option when a coordinate looks off.

**Editing content.** Every field of every location is editable in the app — pencil icon, top right of a location's page. New locations can be created from scratch.

---

## 5. Two things to know before you go

**Google is blocked in mainland China.** Twelve of the seventeen days are in Guangzhou, Foshan, Chongqing and Chengdu. Google Sheets, Apps Script and Google Maps are all unreachable there without a VPN. The app handles this: it caches everything locally, keeps working offline, and queues any edits you make — they send themselves the next time it can reach Google (Hong Kong, or a VPN, or when you get home). The sync badge at the top of each screen tells you where you stand.

Practical consequence: **connect each phone to the Sheet before you leave, and open the app again on wifi in Hong Kong before you cross the border.** A phone that has never connected has an empty app and no way to fill it from the mainland. Also install **Amap 高德地图** on all three phones before you leave — Amap is the only one of the two map apps that works there.

**Coordinates are best-effort.** Major sights are accurate. Some of the restaurants — the ones with several branches, or the dai pai dong — are approximate, and those entries say so in their notes. Use the magnifier/search button for those rather than the pin, or fix the coordinates in the app once you know where you actually ate. Amap is given `dev=1` and the web links `coordinate=wgs84`, so it converts the GPS coordinates to its own grid itself; without that everything in China lands about 500 m off.

---

## 6. Accessibility

Audited against the UX guideline catalogue in [ui-ux-pro-max-skill](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill) (MIT) and fixed:

- Pinch-zoom is enabled (`user-scalable=no` removed — it was a WCAG 1.4.4 failure; inputs are 16px so iOS still won't auto-zoom on focus)
- Every control is at least 44x44pt, using a transparent hit-area expansion where the visual control is deliberately smaller
- Visible keyboard focus ring on every control via `:focus-visible`, which does not fire on touch
- `prefers-reduced-motion` respected — the sheet slide, chevron rotation, toast and press transitions all collapse
- Body and muted text clear 4.5:1 in **both** themes; input borders clear 3:1 as control boundaries
- Dark mode uses a dark ink on the light brand fills rather than white, which failed at 3.29:1
- Pressed feedback on every tappable surface, including the large cards that previously had none
- One icon family throughout: inline SVG, 24px box, 1.8 stroke. No emoji and no font glyphs as icons

The only control under 44px is the inline "Set up the backend" text link inside a sentence, which WCAG 2.5.8 exempts.

## 7. Files

| File | What | |
|---|---|---|
| `index.html` | The whole app — markup, styles and logic, and no trip content | committed |
| `Code.gs` | Apps Script backend: `doGet`/`doPost` JSON API, `setup()`, `resetAndReseed()`. Empty `SEED`, placeholder key | committed |
| `sw.js` | Service worker, caches the app shell so it runs with no connection | committed |
| `manifest.json`, `icons/` | Home-screen icon and standalone display | committed |
| `src/index.template.html` | What `index.html` is built from | committed |
| `src/seed.fixture.json` | Invented stand-in content, so the tests pass on a fresh clone | committed |
| `src/seed.json`, `src/seed-*.json`, `src/schedule.json` | The real trip content, authored split by city, plus `seed-checklist.json` for the checklist and packing lists | **gitignored** |
| `src/build-notes.js` | Builds the file phones import: place notes, checklist, packing | committed |
| `trip-notes.local.json` | Its output | **gitignored** |
| `Code.READY.local.gs` | Code.gs with your key and your content filled in — the file you paste | **gitignored** |
| `.sheet.local.json` | Web app URL + key for the CLI | **gitignored** |

`src/` is only for regenerating the deliverables — the app itself has no build step and no dependencies.

```bash
node src/build-seed.js    # merge + validate the per-city content into src/seed.json
node src/build-code.js    # Code.head.gs + empty seed + Code.tail.gs -> Code.gs
node src/build-html.js    # src/index.template.html -> index.html, verbatim
node src/prepare-code.js --generate   # Code.gs + key + src/seed.json -> Code.READY.local.gs
node src/sheet.js push src/seed.json  # push the content straight to the Sheet instead
```

`build-seed.js` fails loudly if any location is missing a Chinese name, has the wrong map app for its city, or has a restaurant with no dishes listed. `build-code.js` and `build-html.js` refuse to write a file that contains anything from `src/seed.json` — that guard is `src/no-trip-content.js`, and it is what stops the trip drifting back into the repo.

`node src/test-code.js` runs `Code.gs` against a mock of the Apps Script runtime — auth, seeding, idempotent setup, partial updates, day reordering, cascade deletes. It fills the empty `SEED` the same way `prepare-code.js` does, using `src/seed.json` when it is on this machine and `src/seed.fixture.json` when it is not, so it works either way.

---

## 8. API, if you ever want it

`POST` to the web app URL with `Content-Type: text/plain` (this keeps it a CORS simple request; Apps Script cannot answer a preflight):

```json
{ "key": "your-api-key", "action": "all", "payload": null }
```

| Action | Payload | Does |
|---|---|---|
| `ping` | – | connectivity check |
| `all` | – | everything |
| `locations` / `bookings` / `schedule` | – | one tab |
| `saveLocation` | a location object | upsert by `id`, generates one if blank |
| `deleteLocation` | `{id}` | deletes it and any schedule entries using it |
| `saveBooking` / `deleteBooking` | booking / `{id}` | |
| `saveScheduleEntry` / `deleteScheduleEntry` | entry / `{id}` | |
| `setDayOrder` | `{date, ids:[...]}` | rewrites `order_index` for that day |
| `reseed` | – | re-adds any seed rows missing by `id` |

Responses are `{ok:true, data:...}` or `{ok:false, error:"..."}`.

---

## 9. Getting around, and tickets

### On the day view

Under each stop, a line says how to get to the next one. Before the first stop and after the last, there is one from and back to your hotel:

> Then **‹next stop›** · 300 m · walk ~5 min
> Then **‹next stop›** · 3.7 km · DiDi ≈ ¥11–15
> Back to **‹your hotel›** · 4.3 km · MTR, or taxi ≈ HK$50–70 + tunnel toll

These are worked out on the phone from the two places' coordinates, not stored, so they stay right when you reorder a day. The distance is the straight line × 1.35 for streets. The fare is each city's published meter tariff, with a range on top for traffic and waiting time:

| City | Meter | Suggested |
|---|---|---|
| Hong Kong | HK$29 first 2 km, then HK$2.10 per 200 m (HK$1.40 once past HK$102.50) | walk ≤ 1 km, MTR beyond 2 km; harbour tunnels add a toll |
| Macau | MOP 21 first 1.6 km, then MOP 2 per 220 m | walk ≤ 2 km in the old town; taxis are scarce |
| Guangzhou | ¥12 first 3 km, then ¥2.60/km | DiDi up to 5 km, metro beyond |
| Foshan | ¥10 first 2.5 km, then ¥2.80/km | same |
| Chongqing | ¥10 first 3 km, then ¥2/km | same |
| Chengdu | ¥9 first 2 km, then ¥1.90/km | same |

Mainland estimates are shaped for DiDi, which has no "return empty" surcharge; a street taxi on a long ride comes in 20–50% higher. Night surcharges (roughly 23:00–05:00) are not included. Legs over 60 km — the way home from a day trip — point at that place's Getting there instead of quoting a fare.

### Per place

Three fields on each location, editable in the app:

- **Getting there** — nearest station and exit, and when a taxi is better. On every place.
- **Best way to arrive** (`arrive_by`) — one line, only for places reached one particular way: a funicular, a cable car, a train out to a day trip. It replaces the worked-out line on the day view for any leg arriving there.
- **Tickets** — price, where to buy, booking rules, closing days. On every attraction.

`build-seed.js` refuses to build if a place has no Getting there or an attraction has no Tickets.

### Getting the notes onto phones and into the Sheet

The content is trip data, so like everything else it is not in this repo. It comes as a notes file holding only `id` plus those three fields.

**On a phone:** ⚙ → **Import trip notes** → pick the file. A row can name its place (`name_zh` or `name_en`) instead of giving an `id` — that's how details reach a place someone added on their phone, whose id nobody else knows. Background, what to do, dishes and souvenirs only ever fill an empty field, and they're queued for the Sheet; an import never overwrites what someone wrote. Do it once per phone. The notes are kept on that phone, and a sync never blanks them — even against a backend that does not have the columns yet.

**Into the Sheet**, from a laptop, so every phone gets them on sync:

1. Build and paste the new backend, **reusing your existing API key** so the phones keep working:
   `node src/prepare-code.js <your current key>` → `./src/copy-code.sh` → paste into Apps Script.
2. **Deploy → Manage deployments → ✏️ → Version: New version → Deploy.** Not *New deployment* — that gives you a new URL and every phone would need reconnecting. The Locations tab gains its three new columns on its own the first time the script runs. The same update adds the Checklist tab (§10) and lets the app look up short map links (§4).
3. `node src/build-notes.js`, then `node src/sheet.js diff trip-notes.local.json`, then `push`.

Push the notes file, not `src/seed.json`. `push` overwrites every field that differs from the Sheet, and the seed still holds the plan as originally written — pushing it would undo every time, note and reorder you have made in the app since.

---

## 10. Prep: checklist, packing and a guide

The **Prep** tab has three parts.

- **Checklist** — dated tasks for before and during the trip, grouped by section, with the most urgent under *Next up*. Tasks can point at a place; if one isn't ticked by that day, the day's briefing flags it.
- **Packing** — two lists. *Just me* is kept only on that phone and never syncs, since everyone packs differently. *Shared — one of us brings it* is for things the group needs once (adapters, first-aid kit); ticking one records your name, so the others can see it's covered. Set your name in ⚙ Settings.
- **Guide** — general advice for Hong Kong, Macau and the mainland: apps to install, staying connected, paying, getting around, power banks. Nothing in it is specific to this trip, so it ships in the page.

Each day also opens with a short **briefing**: that day's bookings, including any overnight departure before 06:00 the next morning; anything still marked TO BOOK; unticked tasks for that day's stops; and a passport reminder. From 16:00 the Today tab also shows **tomorrow's** briefing, so there's time to sort things out the night before.

### How the shared checklist syncs

It lives in the Sheet's **Checklist** tab. Every item carries an `updated` time, and when two phones disagree, the newer copy wins in either direction. Deleting marks an item `removed` rather than dropping the row, so a phone that still has it can't bring it back.

Until the backend is upgraded (§9), the Sheet has no Checklist tab. Each phone keeps its own copy, and edits the backend doesn't recognise are not queued, so they can't block other edits. On the first sync after the upgrade, each phone uploads what it has — so ticks made in the meantime aren't lost, and there's no need to push the checklist from a laptop.

### The content

The tasks and packing lists are trip data, so they're not in this repo. They're authored in `src/seed-checklist.json` (gitignored), and `node src/build-notes.js` writes them into `trip-notes.local.json` along with the place notes from §9. That's the file phones import. Importing a newer version adds items and updates wording and dates, but never changes whether something is ticked.

---

## 11. What is and is not in this repo

This repository is public and GitHub Pages serves it to anyone who has the URL, so the trip is kept out of it entirely. The split is:

**Not here, and never committed again**

- Every location, with its names, coordinates, blurb and recommendations
- Every booking, and the confirmation numbers (those were never committed)
- The day-by-day schedule
- Getting-there and ticket notes, the checklist and the packing lists
- The API key, and the web app URL

All of that lives in the Google Sheet, which is private to your Google account, and in the cached copy on each phone that has connected.

**Here, because it has to be**

- The app itself: markup, styles, logic, icons, service worker
- The Apps Script backend, with an empty `SEED` and a placeholder key
- The dates and the cities, in the day labels and the map-app routing rule. The route is already in the repository description, and Amap-vs-Google is decided by city, so the app cannot do its job without them.

Two guards keep it that way. `src/no-trip-content.js` runs inside both build scripts and refuses to write `index.html` or `Code.gs` if anything from `src/seed.json` has found its way in, or if either file is suspiciously large. `src/build-seed.js` still rejects any booking carrying a confirmation number or a reference buried in its notes.

### Getting the content onto a new machine

`src/seed.json`, the five `src/seed-loc-*.json`, `src/seed-bookings.json` and `src/schedule.json` are gitignored, and they are not in the history either — it was rewritten to take them out. A fresh clone has none of them, by design.

The Sheet is the live copy, so that is where to get it back:

```bash
node src/sheet.js init "<web app /exec url>" "<api key>"
node src/sheet.js backup src/seed.json
```

That writes the current Bookings, Locations and Schedule into exactly the shape `prepare-code.js` and `sheet.js push` expect, so you can go straight on to building `Code.READY.local.gs`.

The per-city `src/seed-loc-*.json` files are the authoring split, not something the app needs — you only want them back if you intend to re-run `build-seed.js`. They are not in the Sheet and not in the history, so keep your own copy somewhere that is not this repo.
