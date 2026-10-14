---
name: quality-gates
description: Quality gates that stop the usual ways a change goes wrong — writing to the wrong row of a spreadsheet, invented facts, tests that only confirm the author's assumption, fixes that break something else, personal or trip data leaking into a public repo, and a backend left behind the app. Use this whenever you change code, a spreadsheet or Google Sheet, a database or shared document through a connector, write factual content (itineraries, places, prices, opening hours, history) that someone will rely on, set up or ship a project, or are asked to QA, test, review, verify or "make sure it works" — even when the request doesn't mention quality. Also use it to set up a new project's CLAUDE.md, hooks and check script so these rules apply automatically.
---

# Quality gates

Telling yourself to "be careful" doesn't carry over to the next session or the next project. Nearly every one of these mistakes happened while the author believed they were being careful. What works is a check that runs whether or not anyone remembers it, or a rule loaded at the start of each session. So this skill does two things:

1. It tells you which checks to apply to the change in front of you (below, by kind of work).
2. It sets the project up so those checks enforce themselves next time ("Make it stick").

Each rule comes from a mistake that really happened. The incident is in brackets so you can judge the edge cases.

## Before any change

- **Find the project's own check and run it first.** That's a `check`/`test` script, CLAUDE.md, CI config or git hooks. Run it again before you say "done". If the project has none and you're doing more than a one-off fix, offer to set one up (see "Make it stick").
- **Know where it will be seen.** Check whether the repo is public (`gh api repos/<owner>/<repo> --jq .private`), whether it's deployed (GitHub Pages, a store) and who reads the data. Public changes the rules: see "Privacy".
- **Decide what "done" means for this person.** It means passing checks *and* having looked at it the way they will. For a UI that's a screenshot at their screen size with their longest real content. For data it's a read-back of what they'll open.

## Changing a spreadsheet, database or shared doc

These go through connectors where a mistake is instantly live for everyone.

1. **Back up first.** Copy the tab or table, e.g. `duplicateSheet` → `zz backup <Tab> <date>`. For one or two cells, keep a local copy of the rows instead. *(Bulk edits once needed an undo.)*
2. **Read immediately before writing, and address rows by id, not row number.** Read the whole tab from the first row, plus a few empty rows below the data. Then find each row by its id in *that* read. *(A row number from an earlier read overwrote a different place: rows had moved.)*
3. **Protect values the store will reinterpret.**
   - Long digit strings (references, phone numbers) go in as text with a leading `'`.
   - Dates, times and leading zeros must keep their formatting.
   - *(A booking reference became `9.87654E+15`.)*
4. **Read back and compare.** After writing:
   - read the range plus the rows either side;
   - check the right row (by id), the right columns and the right types;
   - check nothing else changed.
   - Use `scripts/sheet-plan.js plan` before writing and `verify` after to do the comparison mechanically.
5. **After a timeout, read the state before retrying.** The call may have half-applied, or applied fully.
6. **Sync-aware stores.** If clients merge by timestamp, bump the timestamp on rows you change. Otherwise a client holding an older copy will push it back.
7. **Never rename or "tidy" the person's own notes** inside names or fields (things like "(Optional)" or "(FAR)").

`scripts/sheet-gate.js` enforces 1–4 as a Claude Code hook. Install it with `references/setup.md`.

## Writing facts someone will rely on

- **Every fact needs a source.** That covers dates, addresses, opening hours, prices, phone numbers, dishes, history and coordinates. A source is a page you actually read, or "from the person".
- **No source? Leave it out, or write it as something to check.** For example, "hours not confirmed — check before going". *(Invented history dates, a station exit, dishes, a misdescribed menu item, and a restaurant put in the wrong district with the wrong pin all reached a shared itinerary.)*
- **Copy names in other scripts from the source; never retype them.** *(A Chinese character was mistyped.)* Never invent coordinates, booking references or opening hours.
- **Before writing, reread each sentence and ask where it came from.** Cut anything that came from memory alone.
- **When two sources disagree, say so**, e.g. "one source says 7 days, another 14". Pick the safer reading for anything time-critical.

## Code and tests

- **Test against the real thing, not your assumption of it.**
  - Check URL schemes and API parameters against the provider's documentation, and put the doc link in the test. *(A deep-link test passed for weeks while the app used a parameter name the map app ignores.)*
  - Use realistic data: the longest real text, a slow network, touch rather than mouse, elements below the fold, a stale cached copy, an older backend. *(Notes were clamped to two lines; a save during a slow sync was undone on screen. Both slipped past tests with short data and an instant network.)*
- **Prove each new test can fail.** Undo the fix, run the test and watch it fail, then restore the fix.
- **Run new or changed tests at least twice.** A flaky test is a bug until shown otherwise, in the code or in the test.
  - Avoid fixes that depend on "ignore everything for N ms": one silently ate quick taps.
  - Check that test inputs are actually on screen and reachable.
- **Don't bend a check to get green.** Never skip a test, change an expectation, raise a limit or loosen a scan just to pass. If a change is genuinely right, explain why in the commit, and show that what it protected still holds.
- **Read the whole function before editing it.** *(A helper was shadowed by a local variable of the same name.)*
- **When you change behavior, search the tests for the old behavior too.** *(A leftover "accept the confirm dialog" step in one test fired on a different dialog later.)*

## Privacy, for public repos especially

- **Test data must be invented, clearly fake and structurally different from the real thing.** Copying the real dataset and renaming it still leaks its shape.
- **Scan everything that would be committed before each commit.** Use `scripts/privacy-scan.js`, which checks:
  - a local, gitignored list of private words (names, emails, project-specific ids);
  - personal emails;
  - 10+ digit numbers;
  - date→title maps (itineraries).
  - *(A day-by-day itinerary sat in public code. A real booking reference was pasted into a test as an "example". A person's name went into a README.)*
- **Keep secrets and personal data out of** logs, reports, commit messages and file names.

## Shipping

- **Bump whatever makes clients pick up the new version**: service-worker cache names, asset hashes, app versions. *(Phones kept serving the old app.)*
- **If the backend has to be deployed by the person**, give them the exact file and steps. Keep the client working against the old backend until they do.
- **No force-push, and no `--no-verify` without the person's say-so.**

## Reporting

**Lead with what changed for the person.** Then cover:

- what you checked, and how;
- what you didn't or couldn't check;
- anything they need to do.

If a step was skipped or a check failed, say so plainly. Don't claim a check you didn't run.

## Make it stick

When working in a project for more than a one-off, set it up so the next session gets these gates without remembering them. Follow `references/setup.md`:

1. **A `CLAUDE.md`** with the project's rules, each tied to its incident. Start from `references/claude-md-template.md`.
2. **One check command**: build, tests, `privacy-scan.js`, plus a version-bump check if clients cache.
3. **Git hooks**: the fast check before commit, the full check before push. Point `core.hooksPath` at a committed `.githooks/`, and set it from a SessionStart hook.
4. **Claude Code hooks** in `.claude/settings.json` for connector writes (the Sheet gate).
5. **Tests for the gates themselves**, so a gate can't quietly stop gating.

Hooks in `.claude/settings.json` are picked up when a session starts (or once `.claude/` exists and Claude Code reloads settings). After creating them, prove one fires: make a harmless call that should be blocked, such as a write to a tab that doesn't exist.
