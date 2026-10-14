# <Project> — working rules

<One paragraph: what this is, where it runs, whether the repo is public, and where the real data lives. Leave the data itself out.>

Each rule below exists because the mistake behind it actually happened. Keep the incident note so edge cases can be judged.

## Before you change anything
- Run `<check command>`; it builds, tests, privacy-scans and <…>. The git hooks run it before commit (fast) and push (full).
- Done means the check passes *and* you have looked at the result the way the person will: <their screen size, their real data, the real flow>.

## Privacy
- No real data in any committed file: no names, emails, ids, references, addresses, or schedules mapped to dates. Use the invented fixtures in `<path>`.
- `tools/qa/privacy-scan.js` checks this. Mark a genuine false positive with `qa-allow` and the reason; never loosen the scan.

## Writing to live data (<Sheet / database>)
- The hook in `.claude/settings.json` blocks a write unless there is a backup from today and a fresh read of the target. Long numbers must go in as text.
- Address rows by id from a fresh read (`tools/qa/sheet-plan.js plan`), never by a remembered row number. After writing, read back and `verify`.
- After a timeout, read the state before retrying.

## Facts
- Every date, address, opening hour, price, phone number or historical claim needs a source you read, or "from the person". Otherwise leave it out or mark it "check". Never invent coordinates, references or hours. Copy names in other scripts; never retype them.

## Tests
- Test against the real reference (documented formats, real-length data, slow network, touch), not against your own assumption.
- Prove a new test fails without the fix. Run new tests twice. A flaky test is a bug.
- Never change an expectation, skip a test, or loosen a check just to pass. Explain any genuine change in the commit.

## Shipping
- <Branch and merge convention>. No force-push; no `--no-verify` without the person's say-so.
- <Version bump that makes clients update.> <Anything the person must deploy by hand, and how to keep the app working until they do.>

## Reporting
- Cover what changed for the person, what you checked and how, what you didn't, and what they need to do. Say plainly when something was skipped or failed.
