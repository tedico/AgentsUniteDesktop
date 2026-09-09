# Field notes — 2026-09-08 evening · live workspace

Observer: Claude Fable 5.1, separate interactive CLI session in the same workspace
(`<workspace>`), watching `<workspace>/.unite/chats/<chat>/{errors,traces}.log` live via
`tail -F` (per-poll `t=` rows filtered out of the notification stream, read from the
file on each event). Ted drives `AgentsUniteD` in a second terminal; seats are
`@claude` (CLI, acceptEdits) and `@gemini` (Desktop) on a shared NotebookLM notebook.

Three bridge processes over the evening: pre-fix, first four fixes, all seven.
Times below are local (UTC-4); logs store UTC.

Companion to `2026-09-08-company-os-x.md` (the afternoon).

Outcome: before the fixes, 1 of 5 Gemini rounds delivered a reply; after, 10 of 10
(21:45–23:21), and the `@claude` seat committed to the workspace under a narrow git
allowlist. Seven commits on `feat/relay-failure-diagnostics` (a963599 → 79693a6),
suite 148 → 156.

## Findings

### F1 · Denial detector flagged successful tool results that merely contained the word "permission"
Severity: high (false error lines injected into the transcript; notebook text written to `errors.log`)

`src/adapters/claude-cli.js:41` tested `/denied|permission/i` against tool-result
*content*. At 23:55 the seat searched the notebook, whose sources quote the chat house
rules ("…grant a high-stakes permission…"): three false denials, one real one,
notebook content in `errors.log`, and a false "harness denied a tool" system line in
the transcript — which then fed later rounds. The fixture at
`test/claude-cli.test.js:35` already showed real denials carry `is_error: true`; the
23:01 "was blocked" denial contained neither word and was caught by `is_error` alone.
Fix: `e5c9e4c` — `is_error` only, two regression tests. Confirmed live 21:19 against
the same notebook: zero denials.

### F2 · An empty conversation read counted as "stable" — the adapter declared rounds finished it never saw
Severity: high

`settle()` compared `""` to `""` twice and returned ok (23:41: twelve polls at
`items=0 chars=0`, mic showing idle → `emptyReply`). It cannot distinguish "stopped
changing" from "cannot be seen". Fix: `02dbf7f` — an empty read resets the stability
counter like a busy signal. Consequence: such rounds then waited the full 300 s (F5).

### F3 · The trace recorded no timing, ignored the truncation flag, and could not fit two rounds
Severity: medium

`ax.jxa:119` returned `truncated` on every snapshot; nothing read it. Nothing recorded
where poll time went. One 8-poll round wrote 104 KB against a 256 KB cap because every
row repeated the full conversation text; `rotateTraceLog` chopped bytes off the front
of an oversized block, losing the header that names the seat and verdict. Fix:
`06b6b1b` — rows carry `snap=<ms>` and `trunc=<bool>`, text only where it changed
(contract change for Ted to ratify), blocks never split. Rotation fired cleanly at
23:21 with headers intact. `9c0e645` synced the lockfile's `bin` field.

### F4 · Root cause of the empty Gemini replies: the reply was an `AXButton` value, and an empty node hid the fallback
Severity: critical — this was the failing product

Live snapshot at 21:29, taken while Gemini's full 781-char reply was on screen and the
adapter had just timed out after 59 polls at `items=0`: 50 nodes, `trunc=false`,
exactly one window. The reply sat in an `AXButton` (description "button") with the
text in `.value`. `messageItem` matched only `AXStaticText desc="text"`, which by then
meant the "Show thinking" label (excluded by name) and one **empty** window-level
node — and that empty match made `findAll` non-empty, which suppressed the
whole-container fallback in `itemTexts`. Result: `items=0 chars=0`, 59 times.

Earlier rounds (23:56, 00:01) read replies as `AXStaticText` fine; at 21:45 both
shapes were in the window at once (old reply `AXButton` 781, new reply `AXStaticText`
386) — Gemini replies *transition* from static text to button over their lifetime.
Ruled out with evidence: node-budget truncation, multiple windows, and Chromium's
basic-a11y mode (`AXManualAccessibility` does not exist on Gemini: "Can't get object").

Fix: `c04cdf2` — `findAll`/`itemTexts` accept a list of selectors; Gemini lists both
shapes; the fallback fires when matches yield no *readable* text. Fixture:
`test/fixtures/gemini-reply-as-button.json` (the 21:29 tree). Verified 21:45: first
poll read the previously invisible reply (`items=1 chars=781`); the new reply landed
in the terminal.

### F5 · An unreadable conversation cost 300 s of waiting
Severity: medium (user-visible; Ted: "ridiculously long")

After F2, an idle app with an unreadable chat waited the full timeout. Fix:
`79693a6` — after `UNREADABLE_IDLE_POLLS = 5` consecutive idle+empty polls the round
fails as `conversationUnreadable`, naming `src/selectors/gemini.js` and the
thinking-panel size; applies to the pre-send wait too. ~25 s instead of 5 min.

### F6 · Poll cost grows with the conversation — measured
Severity: high (open; Phase 6)

`pollMs=1000` is a sleep *between* snapshots. Each snapshot walks the whole AX tree
through one `osascript` process, ~9 Apple events per parent node (`ax.jxa:140`).
Measured per snapshot / time to first poll / replies in window, one chat:

| 21:29 | 4.0 s | 10 s | 0 |
| 21:45 | 5.3 s | 15 s | 1 |
| 21:56 | 8.2 s | 21 s | 2 |
| 22:01 | 10.8 s | 29 s | 3 |
| 22:17 | 16.6 s | 38 s | 5 |
| 22:27 | 22.6 s | 60 s | 6 — reply complete before the first look; all 106 s overhead |
| 22:37 | 27.0 s | 74 s | 7 |
| 22:45 | 31.1 s | 92 s | 8 |
| 22:52 | 35.0 s | 99 s | 9 |
| 23:21 | — | — | 213 s round, 3 polls, against a 300 s timeout |

Per-node cost also rises: ~70 ms/node at 50 nodes, ~184 ms/node at 186 nodes. Live
tree geometry for the design: conversation scroll area at `[0,0,0,0,4]`; composer,
model button, mic at `[0,0,0,0,{1,2,3}]`; replies are `AXRow` → `AXCell` → `AXGroup`.
Not yet fixed; workaround is a fresh Gemini chat. Design needs Ted's decisions (see
`SPRINT.md` `Next`).

### F7 · Numbers and formulas Gemini renders as inline widgets arrive as U+FFFC
Severity: high (open) — the seats called it "a firewall"; it ate one threshold figure four times

Count of `￼` per Gemini reply as Claude received it: 13, 9, 6, 31, 18, 30, 2, then the
very figures requested as proof of reading (23:15). Probe at 22:58 (186-node tree):
every `￼`-bearing node has zero children; no `AXImage`, no MathML/annotation node, no
alt text. The widgets are opaque; `￼` also stands for citation chips ("+3 sources").
Reading smarter cannot fix it. Options: (1) mark them `[inline element unreadable by
relay]`; (2) preamble rule "plain text or backticks for numbers, never math"; (3)
Gemini's per-response Copy button + clipboard. Gemini agreed in chat (23:21) to use
plain digits.

### F8 · A seat claimed to have read a file it was only told about — and the notebook path fixed it
Severity: high (product) — Ted: "the whole reason why this whole brainstorming app exists"

22:52: Gemini announced it was "looking at Claude's Rev 2 spec" and praised three
design points. All three were lifted from Claude's 1,613-char status summary in the
1,987-char paste; the 14 KB spec file was never pasted. Ted spotted it. Gemini has no
file access — it sees pasted text only; B6 grounding injects a NotebookLM *answer*,
not source text.

23:11: `@claude` ran `notebooklm source add` on the spec (38 s, no denial; the
`--title` flag is ignored for file sources — the filename becomes the title). Gemini's
already-open notebook view saw it **without a refresh** and at 23:15 cited seven
strings that exist only in the file (`ratings.csv`, `manifest.yaml`, the rubric path,
the scripts path, a `[NEEDS CLARIFICATION]` marker name, "half the spread before
weights", shortlist of three). Its paraphrase still mislabeled four criteria (Claude
caught it; Gemini conceded). Claude had proposed the same verification test
unprompted.

23:27 Ted: remove the notebook copy; the workspace file is the single source of truth.
Claude also found re-uploading a revision **adds a second source rather than
replacing**. Phase 7 shape: one-off review upload + cleanup, never mirroring.

### F9 · Permissions as observed
Severity: informational

`acceptEdits` auto-approves file edits only; every Bash call is gated. Allowlist
additions (`.claude/settings.local.json`) take effect on the next round, no relaunch
(`notebooklm` at 21:19, `git` at 23:32). Prefix rules match the command start:
`git -C <path> add` is not covered by `Bash(git add:*)` — the seat's first commit was
denied for that, and succeeded with plain `git add`. Denied `WebSearch`, the seat
retried four times in one round. Asked whether it could commit, the seat noted it
*could* add the rule itself (a file edit) and declined without Ted's say-so.
Working-directory scope blocked `ls` of the parent folder (needs
`additionalDirectories`, not a Bash rule).

## Observations

- O1 · Ted, 22:50: the seats should address each other directly, as they do in the
  CLI version, where it reads like a natural chat. Likely lever: the desktop preamble
  versus the CLI engine's.
- O2 · A PreToolUse hook that reads HEAD from the harness cwd denies a read-only
  `git merge-base` issued from a repo on `main` on the word alone; `git -C <repo> …`
  targets the right repo and does not trip it.

## Session-end state

Seven commits on `feat/relay-failure-diagnostics` (a963599 → 79693a6), never pushed;
`dist/` predates all of it. The workspace received one commit from the `@claude` seat
(company map, `SPRINT.md`, spec rev 2).
