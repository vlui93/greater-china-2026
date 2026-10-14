# Trip companion — working rules

A phone PWA for a group trip. **This repo is public and GitHub Pages serves it.** The trip itself — places, bookings, schedule, checklist, day names — lives only in a private Google Sheet ("Greater China 2026 — Trip App Data"; find it by name with the Drive connector). The app pulls it from the Sheet at run time.

Each rule below exists because the mistake behind it actually happened. The same lessons, written for any project, are the `quality-gates` skill in `.claude/skills/` — use it for anything not covered here.

## Before you change anything

- Run `npm run check` (or `node tools/qa/check.js`). It builds, runs the backend tests, the QA tool tests, the privacy scan, the cache-version check and the 21 browser suites. `--fast` skips the browser suites. Git hooks run it for you: the fast check before each commit, the full one before each push. If a hook isn't running, `git config core.hooksPath .githooks`.
- A change is done when the full check passes **and** you have looked at the result the way the person will: a screenshot at phone size, the real flow, long real-world text.

## Privacy (public repo)

- **No trip content in any committed file.** That means:
  - no place or booking names, ids, references, dates mapped to day titles, or addresses;
  - nobody's name or email, including in tests, comments, README examples and commit messages.
  - Tests use the invented trip in `tests/e2e/fixtures/`. *(Day titles once sat in the app code. A real booking reference was once copied into a QA test as an "example". A person's name went into the README.)*
- `tools/qa/trip-scan.js` checks every file git would commit:
  - against the real trip data when `src/seed.json` is present;
  - against `.qa/private-words.local.txt` (gitignored: names, emails);
  - against itinerary shapes, emails and 10+ digit numbers.
  - Mark a genuine false positive with `qa-allow` and the reason on that line. Never loosen the scan to get a pass.
- Never print or log the API key. Never paste a booking reference or a passenger name into a report.

## Writing to the Sheet

- **A hook enforces this**: `.claude/settings.json` runs `tools/qa/sheet-gate.js`. It blocks a write unless:
  - there is a backup tab from today (`duplicateSheet` → `zz backup <Tab> <date>`);
  - the target tab was read with `get_values` in the last 20 minutes;
  - long numbers go in as text (a leading `'`).
  - After writing, it asks for a read-back.
  - *(Once, a row number from an older read overwrote the wrong place. Once, a booking reference became `9.87654E+15`.)*
- **Address rows by id, never by row number.** Read the whole tab from A1, including a few empty rows below the data, then:
  - `node tools/qa/sheet-plan.js plan <sheetId> <Tab> changes.json` gives the exact ranges;
  - write them;
  - read the tab again;
  - `node tools/qa/sheet-plan.js verify <sheetId> <Tab>` proves only the planned cells changed.
- To change existing checklist rows, set `updated` to now. Phones keep whichever copy is newer.
- If a call times out, read the state before retrying (a timed-out backup once had or hadn't happened).
- Don't rename a place whose name carries the person's own note: "(FAR)", "(Optional)", "[to replace]", "(20:30)", "… 晚上".

## Facts

- **Every fact you add needs a source:** a date, an address, opening hours, a phone number, a dish, history or coordinates. That means a link you read, or "from the person". With no source, leave it out, or write it as something to check. Copy Chinese names from the source; never retype them. Never invent coordinates, booking references or opening hours.
  - *(Invented history dates, a station exit, dishes, a wrong character in a name, and a restaurant put in the wrong district with the wrong pin all reached the Sheet before.)*
- Say what you couldn't verify, in the report, in plain words.

## Tests

- **Test against the real thing, not your own assumption.**
  - A map-app link test once passed while the link used the wrong parameter name.
  - Check URL formats against the provider's documented format.
  - Use realistic data: the longest real note, a slow network, a finger instead of a mouse, below the fold.
- **Prove a new test can fail.** Undo the fix, watch the test fail, then put the fix back. *(A sync race only showed up once the network was slowed.)*
- **Run a new or changed suite at least twice.** A flaky test is a bug until shown otherwise. Never use "ignore all clicks for N ms" style fixes: one once ate real taps on Delete.
- **Never change an existing test's expectation, skip a test, or loosen a check (size ceiling, scan, gate) just to get green.** If it's genuinely right to change, say why in the commit and show that what it protected still holds.

## Shipping

- Develop on the session branch, then fast-forward `main` (`git push origin <branch>:main`). No force-push, no `--no-verify` without the person's say-so.
- Bump `CACHE` in `sw.js` with every app change, or phones keep the old app (the check enforces this).
- `Code.gs` changes reach the backend only when the person pastes the new file and deploys a new version. Tell them, and keep the app working against the older backend in the meantime.
- Don't put model names in commits or files.

## Reporting

- **Lead with what changed for the person.** Then list:
  - what you checked, and how;
  - what you didn't check;
  - anything they need to do.
- Say it plainly when a step was skipped or a check failed.
