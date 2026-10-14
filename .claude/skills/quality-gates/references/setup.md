# Making the gates enforce themselves in a project

Do this once per project that will see more than a one-off change. Ask before adding files to someone's repo, and show them what you added.

## 1. Copy the scripts

```bash
mkdir -p tools/qa
cp <skill>/scripts/privacy-scan.js <skill>/scripts/sheet-gate.js <skill>/scripts/sheet-plan.js tools/qa/
```

Copy only `privacy-scan.js` if the project never writes to a spreadsheet.

## 2. Keep local QA state out of git

Add to `.gitignore`:

```
# QA: private word lists and local state (reads of live data can hold personal details)
.qa/*.local.*
.qa/state/
```

Then create `.qa/private-words.local.txt` with the names, emails and ids that must never be committed, one per line. If the real data is in a local file that git ignores, list its path in `.qa/private-sources.local.txt`; the scan then checks every value in it.

## 3. One check command

Make one command that runs everything that must pass. Typically:
- the build;
- the unit tests;
- `node tools/qa/privacy-scan.js`;
- a version-bump check if clients cache the app;
- end-to-end tests, run on invented data.

Put it in `package.json` scripts (`"check": "..."`) or a `tools/qa/check.js`. Give it a `--fast` mode without the slow tests. Make it print one line per step and exit non-zero on any failure.

A version-bump check, for a service worker:

```js
const changed = git('diff --name-only HEAD').split('\n').filter(f => /^(index\.html|app\.js|assets\/)/.test(f));
if (changed.length && cacheName('sw.js') === cacheName('HEAD:sw.js')) fail('app changed but the cache name did not');
```

## 4. Git hooks, committed

`.githooks/pre-commit`:

```sh
#!/bin/sh
exec node "$(git rev-parse --show-toplevel)/tools/qa/check.js" --fast --staged
```

`.githooks/pre-push`:

```sh
#!/bin/sh
exec node "$(git rev-parse --show-toplevel)/tools/qa/check.js"
```

Then `chmod +x .githooks/*` and `git config core.hooksPath .githooks`. Git hooks aren't cloned, so set the path from a SessionStart hook (below) and mention it in the README.

## 5. Claude Code hooks: `.claude/settings.json`

Merge these into the existing file; don't replace it.

```json
{
  "hooks": {
    "SessionStart": [
      { "hooks": [ { "type": "command",
        "command": "git -C \"$CLAUDE_PROJECT_DIR\" config core.hooksPath .githooks && echo 'QA gates on — read CLAUDE.md first.'" } ] }
    ],
    "PreToolUse": [
      { "matcher": "mcp__.*[Ss]heets.*__(update_values|append_values|batch_clear_values|update_formulas|insert_dimension|update_spreadsheet)",
        "hooks": [ { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/tools/qa/sheet-gate.js\" pre" } ] }
    ],
    "PostToolUse": [
      { "matcher": "mcp__.*[Ss]heets.*__(update_values|append_values|batch_clear_values|update_formulas|insert_dimension|update_spreadsheet)",
        "hooks": [ { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/tools/qa/sheet-gate.js\" post" } ] },
      { "matcher": "mcp__.*[Ss]heets.*__(get_values|get_spreadsheet)",
        "hooks": [ { "type": "command", "command": "node \"$CLAUDE_PROJECT_DIR/tools/qa/sheet-gate.js\" read" } ] }
    ]
  }
}
```

Check the matcher against the tool names the session actually has; connector prefixes vary. The pattern above matches any `mcp__…Sheets…__write_tool`.

**Prove it fires.** Hooks load when a session starts, or after Claude Code notices the new `.claude/` folder. Make a call that must be blocked and can't do harm, for example `update_values` on a tab name that doesn't exist and hasn't been read. You should see "Sheet gate: read … before writing". Until you've seen it, treat the gate as not running and apply the rules by hand: `node tools/qa/sheet-gate.js pre < call.json`.

## 6. CLAUDE.md

Start from `claude-md-template.md`. Keep only the rules that apply, add the project's own, and tie each rule to its incident in a few words. That's what lets a future session judge the edge cases.

## 7. Test the gates

Add a small test that feeds the gate and the scan their known-bad inputs:
- a write with no backup;
- a write without a fresh read;
- an unprotected long number;
- an itinerary-shaped object;
- an email address.

Have it assert they're refused, and run it in the check. A gate that silently stopped working looks exactly like one that's passing.
