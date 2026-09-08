# Spec — relay failure diagnostics and reply-loss fixes

Date: 2026-09-08 · Repo: `AgentsUniteDesktop` · Status: **blocked on open questions in §8** · rev 2 (2026-09-08, adds B2 CORRECTION)

## 0. For the implementer — read this first

You are fixing four defects found by direct observation of a live AgentsUniteD
session on 2026-09-08 (macOS 25.6, Gemini.app 1.107.3.828, Claude Code CLI seat).
Every claim below was measured or read from source; where a root cause is not
proven, the confidence level says so explicitly. **Do not treat a MEDIUM-confidence
hypothesis as settled** — §5 lists the questions that must be answered by the repo
owner before the affected fix is written.

You do not need the original session, any particular LLM, or network access.
Everything needed is in this repo plus the field notes at
`docs/field-notes/2026-09-08-company-os-x.md`.

### What is NOT changing — architectural guardrail

This document is a list of fixes and two additions. It is **not** a re-architecture,
and nothing in it licenses one. Confirmed by the repo owner, 2026-09-08:

- **Gemini stays in its native desktop app**, driven over macOS Accessibility.
  B2–B3 harden that path; they do not replace it. Do not propose or build a Gemini
  CLI seat, and do not remove the desktop adapter.
- **Claude stays as the headless terminal CLI seat** (`claude -p`), unchanged in
  kind — B4 only makes its denials legible.
- **Seat-to-seat conversation remains the product.** This is a brainstorming app:
  two models talking to each other. Every change must leave that intact.
- **B6 adds a shared data source, not a participant and not a replacement.** Its
  purpose is that both seats stand on the same facts.

If a proposed change makes the app do less of the above, it is out of scope for this
spec regardless of how much cleaner it looks.

### Ground rules

1. **Never edit `vendor/`.** It is generated from `../AgentsUnite` at the commit
   pinned in `engine.pin.json`, and `test/vendor-drift.test.js` fails if it drifts.
   If an engine change is genuinely required, change it upstream in `../AgentsUnite`,
   re-run `npm run vendor:engine`, and bump `engine.pin.json` in the same commit.
   Every fix in this spec can be made in `src/` alone.
2. **Tests:** `npm test` (`node --test test/*.test.js`). Node >= 20. No network.
   Reuse `test/helpers/fake-helper.js` and the saved AX trees in `test/fixtures/`
   (`gemini-idle.json`, `gemini-streaming.json`, `gemini-done.json`) — do not write
   tests that require a live Gemini.app or Claude CLI.
3. **The running app does not hot-reload.** Node has already loaded these modules.
   Any change requires the operator to quit and relaunch `AgentsUniteD`. Say so in
   your handoff; do not assume a fix is live because the file changed.
4. **Error-catalog discipline.** All user-facing failure text lives in
   `src/shared/errors.js` and nowhere else. Keep it that way.
5. Match surrounding style: ES modules, no TypeScript, no new runtime dependencies,
   comments only where they carry non-obvious intent (see existing files).

---

## 1. Evidence base

Full write-up with timestamps: `docs/field-notes/2026-09-08-company-os-x.md`
(findings F1–F4). Key measurements reproduced here so this spec stands alone.

| Time (local) | Event |
|---|---|
| 16:15:59 | Relay emits `noWindow` for Gemini |
| 16:16:38 | Observer measures Gemini: `windows=1 visible=true frontmost=false fullscreen=false minimized=false` |
| 16:16:34 | User sends `@gemini can you repeat what you just said` |
| 16:20:26 | Relay emits `emptyReply` — elapsed 3m52s |
| 16:21:34 | Observer reads Gemini AX tree: the full answer is present in an `AXStaticText` node, 737 chars, never relayed |

Failure-signature counts for the session: `emptyReply` × 3, `noWindow` × 2.

---

## 2. B1 — `errors.log` is never written, so `/last-error` is always empty

**Priority: do this first.** It is small, it is a prerequisite for diagnosing
B2 and B3 in the field, and today every diagnosis required reading the target
app's accessibility tree from *outside* the app because the relay recorded nothing.

### Symptom
The UI prints `— /last-error for details` on degraded rounds. `/last-error` then
prints `(no errors logged)`.

### Root cause — CONFIRMED
- `lastError(dir)` reads `<chatdir>/errors.log` — `vendor/agentsunite/lib/transcript.js:34`
- `appendErrorLog(dir, seat, text)` is the only writer — same file, line 29 — and has
  **zero callers** in `src/` or `bin/`
- The only live error path is `appendRoundError(dir, err)` (`src/main/relay.js:70`,
  `bin/unite-desktop.js:144`), which fires only when a round *throws*
- Degraded rounds (`noWindow`, `emptyReply`, `appBusy`, `replyTimedOut`) are handled,
  not thrown, so nothing is ever logged
- Verified on disk: a chat directory after five degraded rounds contained only
  `state.json`, `transcript.jsonl`, `transcript.md`

### Required change
Call `appendErrorLog` wherever a seat round ends in a catalog error. The logged text
must be **machine state, not the user-facing sentence** — the sentence is already in
`transcript.jsonl`. At minimum record: seat, error code, elapsed ms, and the
seat-specific observations named in B2/B3.

### Acceptance criteria
- After any degraded round, `<chatdir>/errors.log` exists and its last block names
  the seat, the error code, and elapsed ms
- `/last-error` prints that block
- A round that succeeds writes nothing
- Unit test: drive a degraded round through `src/main/relay.js` with
  `test/helpers/fake-helper.js` against a temp dir; assert `errors.log` contents

---

## 3. B2 — a produced reply is silently discarded (highest user cost)

### Symptom
`ERRORS.emptyReply` (`src/shared/errors.js:16`): *"Gemini finished but no new text
appeared in the chat."* The reply had in fact been generated and was visible on
screen; it never reached the transcript, the user, or the other seat. Three
occurrences in one session.

### What is CONFIRMED
- The answer existed in Gemini's AX tree as `AXStaticText`, 737 characters,
  68 seconds after the relay declared the round empty
- The selector is **not** at fault: `src/selectors/gemini.js:20` already targets
  `{ role: 'AXStaticText', descriptionEquals: 'text', nameExcludes: 'Show thinking' }`,
  which matches where the answer actually was. Every `AXTextArea` node held
  *thinking traces* ("Refining the Format", "Perfecting the Directory",
  "Finalizing the Output") — Gemini looped through many refinement passes
- Gemini's busy state is **inferred, not read**: `busyWhenSendAbsent: true` with
  `idleButton: { role: 'AXButton', helpIncludes: 'microphone' }`, because live AX
  exposes no Stop string (`src/selectors/gemini.js:13-16`, corroborated by
  `docs/probe/findings.md`)

### Leading hypothesis — MEDIUM confidence (see CORRECTION below before acting)
The error text says *finished*: the adapter believed generation had ended, diffed
the message list via `extractReply` (`src/adapters/reply.js:5`), found nothing new,
and reported an empty reply. If the mic/Send button reappears for even one poll
between Gemini's thinking segments, the inferred idle signal fires early.

### NOT established
Whether the answer node existed at 16:20:26 or appeared during the following 68
seconds. This decides the fix:
- appeared later → the bug is **giving up too early** (fix: idle-stability + timeout)
- already present → the bug is **a diff miss** in `extractReply`/`itemTexts` (fix: extraction)

**Experiment that settles it** (5 minutes, requires a live Gemini round): poll the
`AXStaticText` answer nodes every 2s, timestamp when the answer node first appears,
compare against the moment the relay declares finished. Record the result in the
field notes before implementing. See `[NEEDS CLARIFICATION: B2-cause]` in §8.

### CORRECTION — what already exists (read before writing code)

The adapter **already polls every 1s and already has a stability requirement**.
`src/adapters/desktop-adapter.js:45` `settle()` loops on `pollMs = 1000`, resets
`stable = 0` whenever `isBusy(tree)` is true, and returns done at
`stable >= 1` (line 61) — i.e. the message text was **identical across two
consecutive non-busy polls**. Do not add a stability threshold; one is there.

Two consequences the implementer must reason about:

- **Two seconds of apparent stillness is enough to declare Gemini finished.**
- `items()` (line 30) reads only `selectors.messageItem`, which for Gemini is
  `AXStaticText` — so Gemini's *thinking* panels (`AXTextArea`, "text entry area")
  are invisible to the stability check by design. While Gemini thinks, the message
  list does not change, so `text === last` holds trivially. The **only** thing
  preventing a premature "done" during a long thinking phase is `isBusy`.

Evidence on `isBusy`, tested against the saved fixture: in
`test/fixtures/gemini-streaming.json` (captured while Gemini was generating), no
Send, mic, or Stop button is present, so `isBusy` correctly returns **true**. The
simple version of the premature-finish story therefore does **not** hold for that
captured state. Either Gemini entered a different state during the long
multi-pass thinking observed on 2026-09-08 (one not represented in the fixtures),
or the cause is extraction, not timing. This is precisely why
`[NEEDS CLARIFICATION: B2-cause]` must be resolved before code is written.

### Required change (both branches share this part)
1. Reconsider what counts as a busy signal for Gemini. The thinking panels are
   observable (`AXTextArea` "text entry area", plus a "Show thinking" label) and are
   currently excluded from every check. Growth in those nodes is direct evidence
   that generation is still running, and nothing consults it.
2. When extraction returns empty, distinguish *"still generating"* from *"finished
   with no new text"* in the user-facing message. Today both read as finished.
3. On empty extraction, write to `errors.log` (per B1): the observed message count
   before and after, the length of each candidate node, which selector matched, the
   idle/busy signal history for the round, and elapsed ms. Without this the next
   occurrence is as undiagnosable as this one was.

### Acceptance criteria
- With a fixture where the answer node appears only after several idle-looking
  polls, the adapter waits and returns the answer instead of `emptyReply`
- `emptyReply` is only reachable after the stability threshold is met
- Every `emptyReply` writes a diagnostic block to `errors.log`
- Existing `test/reply.test.js` and `test/desktop-adapter.test.js` still pass

---

## 4. B3 — `noWindow` states three causes, all of them false

### Symptom
*"Gemini is running but macOS reports no readable window. If it is full-screen on
another Space, exit full-screen (⌃⌘F); if it is hidden, show it (⌘Tab to it)."*
(`src/shared/errors.js:14`, fired from `src/main/preflight.js:29`)

Measured state 39 seconds later: **one ordinary window** — `visible=true`,
`fullscreen=false`, `minimized=false`, on the active Space. The only true statement
about it: the app was **not frontmost**. The user acted on this message and went
looking for a Space that did not exist.

### Root cause — mechanism CONFIRMED, trigger MEDIUM
`src/ax/ax.jxa:66` `ensureWindows(proc)`:

```js
function ensureWindows(proc) {
  var wins = proc.windows();
  if (wins.length === 0) {
    try {
      Application(proc.bundleIdentifier()).activate();
      $.NSThread.sleepForTimeInterval(0.3);
      wins = proc.windows();
    } catch (e) {}            // <-- line 73: the diagnosis dies here
  }
  return wins;
}
```

Two known-hostile facts about Gemini, both already recorded in this repo's
`docs/probe/findings.md`: *"Gemini reports `count: 0` windows until the app is
activated"*, and Gemini AX snapshots measured **14–27 seconds**. A fixed 300 ms wait
after `activate()` is optimistic for an app that slow to publish its AX tree.
Whether `activate()` threw or the wait was too short cannot be determined, because
line 73 discards the exception. The app was still not frontmost 40s later, which is
weak evidence that activation never took effect.

### Required change
1. Stop swallowing the exception at `ax.jxa:73`. Return it (or its message) in the
   op result so callers and `errors.log` can see it.
2. Replace the fixed 300 ms sleep with polling to a deadline. Per-app timing;
   Gemini should get the larger budget the probe data implies.
3. Rewrite `ERRORS.noWindow` to report **observed** state — window count, minimized
   count, frontmost, whether `activate()` was attempted and what it returned or threw
   — instead of naming three guessed causes. Keep a next-step hint only for
   conditions actually detected (a real `AXMinimized` still earns `ERRORS.minimized`).

### Acceptance criteria
- `windows` op result carries the activate outcome (attempted / succeeded / error text)
- With a fake helper that returns 0 windows then 1 after a delay, the op returns 1
- `noWindow` text contains the observed counts and never asserts an undetected cause
- `test/errors.test.js` and `test/preflight.test.js` updated and passing

---

## 5. B4 — the Claude CLI seat cannot distinguish its own harness denial from an OS denial

### Symptom
Asked to read another app's screen, the seat replied that `screencapture` and
`osascript` were denied and that macOS **Screen Recording and Accessibility**
permissions were needed in System Settings. Both denials were in fact from Claude
Code's own permission gate. The user acted on the wrong diagnosis within 3 minutes.

### Root cause — CONFIRMED
- `src/adapters/claude-cli.js:18` spawns
  `claude -p --permission-mode acceptEdits --output-format stream-json --verbose`
- `-p` is headless with the prompt on stdin: no TTY, no approval channel, so a Bash
  call needing approval is denied outright with nobody to ask
- `acceptEdits` auto-approves **file edits only**; `screencapture` and `osascript`
  are Bash calls outside its scope
- Counter-evidence to the OS-permission theory: the Gemini adapter drives Gemini.app
  over JXA/AX from the same process tree and worked throughout the session, so
  Accessibility/Automation were already granted to the host app

### Required change
The adapter already parses the `stream-json` event stream in `makeLineSplitter`
(`src/adapters/claude-cli.js:24-36`) and inspects `system`, `assistant`, `user`, and
`result` events. **Tool-denial events are not inspected.** Capture them, and:
1. Write the denial reason to `errors.log` (per B1)
2. Surface it to the seat so it can say "my own harness denied this" rather than
   inferring an OS cause. See `[NEEDS CLARIFICATION: B4-surface]` in §8.

### Acceptance criteria
- A recorded `stream-json` fixture containing a tool denial produces a captured
  denial reason in the adapter result
- `test/claude-cli.test.js` covers it
- No change in behaviour for rounds with no denials

---

## 6. B5 — round trace (new capability, not a bug fix)

**This is a feature, not a defect.** It exists because every diagnosis on 2026-09-08
required an outside observer reading the target app's accessibility tree directly.
The app had the same access, looked at the same window once per second, and recorded
nothing. B5 makes the next mystery cheap instead of expensive.

### The insight

The adapter is **already polling**. `src/adapters/desktop-adapter.js:45` `settle()`
snapshots the target app's whole AX tree every `pollMs` (1000 ms) for the life of a
round, evaluates `isBusy(tree)`, and computes the message list via `items(tree)` —
then discards all of it, keeping only the final answer. There is also already a
per-poll event channel: `progress(phase, extra)` (line 21) → `onProgress`, consumed
by `makeTracker` (`vendor/agentsunite/lib/progress.js`) to animate the CLI spinner,
then dropped.

So a trace costs **zero additional accessibility calls**. Everything worth recording
is already in memory, once per second, and thrown away.

(Note: `progress()` inside `settle` fires only when `phase` is truthy — the
"already generating" pre-wait passes `null` and is currently silent. The trace must
cover that phase too; that is where an `appBusy` failure originates.)

### Required change

1. Record one row per poll for the duration of a round. Per row, all already
   available from the snapshot in hand:
   - monotonic elapsed ms since round start
   - `isBusy(tree)` result, and which button matched (stop / send / idle / none) —
     this is the single most valuable field, and no current log carries it
   - message item count and total characters from `items(tree)`
   - **thinking-panel size**: character total of the nodes the message selector
     deliberately excludes (for Gemini, `AXTextArea` "text entry area"). Growth here
     is direct evidence generation is still running and nothing consults it today
   - the `stable` counter's current value
   - phase label (pre-wait / pasting / awaiting reply)
2. Record round-level fields: seat, start and end timestamps, outcome (ok or the
   `ERRORS` key), prompt length, and final reply length.
3. On a round that ends in any catalog error, write the trace to `errors.log` via
   B1's writer. On success, discard it unless retention is enabled
   (see `[NEEDS CLARIFICATION: B5-retention]`).
4. Keep the row format compact and one line per poll — a 5-minute round at 1 Hz is
   ~300 rows.

### Why this ordering matters

B5 built before B2 turns `[NEEDS CLARIFICATION: B2-cause]` into a question the app
answers by itself: the trace shows, second by second, whether the answer text
appeared before or after the adapter declared the round finished. That is exactly
the experiment described in §3, performed automatically on every failure, for free,
forever — instead of once, by hand, by an outside observer who happened to be
watching.

### Acceptance criteria

- A round driven through `test/helpers/fake-helper.js` produces a trace whose row
  count matches the number of polls, in order, with monotonic elapsed values
- Every row carries the busy verdict and which selector produced it
- A failing round writes the trace to `errors.log`; a successful one does not
  (absent retention config)
- Thinking-panel size is present and non-zero for a fixture where those nodes exist
  (`test/fixtures/gemini-streaming.json` has 8 `AXTextArea` nodes)
- No new call to `helper.snapshot`, `helper.getValue`, or any other AX op is added.
  Assert this: the fake helper counts calls, and the count must be unchanged from
  the pre-B5 baseline for an identical round
- Adds no runtime dependency

---

## 7. B6 — NotebookLM as a first-class source (feature request, verified feasible)

**Requested by the repo owner, 2026-09-08.** This is the highest-leverage item in
the document: it routes around the entire failure class that B2 and B3 belong to,
and it eliminates the most-repeated user action observed in the session.

### Stated purpose (owner, 2026-09-08)

> "The reason why I want Claude to access NotebookLM via CLI in the AgentsUniteDesktop
> app is so that Claude also has the same data as Gemini (since Gemini is accessing a
> particular NotebookLM notebook)."

The goal is **symmetric grounding**: both seats reasoning from the same source of
truth, rather than one seat narrating it to the other. That reframes B6 — it is not
"add a NotebookLM seat", it is "stop the seats from having different worlds."

### Product intent (owner, 2026-09-08) — read this before designing anything

> "I still want Claude and Gemini to be able to converse because the whole point of
> this app is for them to brainstorm together. NotebookLM is just kind of like a
> mutual data source that they can use. It's not exclusive. It's just an option.
> It's kind of like their primary data harness, but they can still use the internet
> to grab outside sources."

Three constraints follow, and every design decision in B6 must respect them:

1. **The seat-to-seat conversation is the product.** NotebookLM is infrastructure
   underneath it, never a participant in it. Any design where the human ends up
   relaying between a notebook and a seat has failed.
2. **Grounding is additive, never a sandbox.** The seats keep their own tools and
   their own reach — web search, their own reasoning. Notebook context is added to
   what a seat can draw on; it does not replace or fence it.
3. **Same floor, different minds.** Both seats standing on the same facts is what
   makes the brainstorm worth having: they diverge on reasoning and tools, not on
   what is true. That is the whole argument for shape 1 below.

### Consequence: provenance is a requirement, not a nicety

If notebook material is injected into both seats every round, each seat must be able
to tell *this came from Ted's notebook* apart from *this came from the web* and *this
is my own inference* — otherwise a brainstorm quietly blends sourced fact with
speculation, and neither seat nor the owner can tell which is which afterwards.

This is cheap to honour and the pieces already exist: `notebooklm ask --json` returns
source IDs per reference and the answers carry inline `[1]`, `[2]` citations, and the
repo already has citation handling (`src/adapters/citations.js`, `stripCitations` in
`src/selectors/gemini.js:10`). Injected context must be labelled as notebook-sourced
and keep its citations. Do not strip them on the way in.

### What parity actually means here — read before promising it

The the source notebook's sources were inspected on 2026-09-08:
`notebooklm source list -n <notebook-id>` returns YouTube sources, a web page, and
**image sources** (`IMG_2026-09-08T…`, the handwritten pages).

`notebooklm source fulltext` on an image source does **not** return OCR text. It
returns a `lh3.googleusercontent.com/notebooklm/…` URL for the image itself (224
characters for the source tested). So this CLI gives a seat:

- **grounded answers** about the sources, via `ask` — CONFIRMED working, and
  sufficient in practice: a single `ask` reproduced the exact directory structure the
  owner had spent ~50 minutes relaying by hand
- **not** the raw handwriting as text, and not the images as pixels

Whether Gemini Desktop genuinely "sees" the page images or is likewise answering
from the notebook is **unverified** — the observer could not inspect Gemini's
internal grounding. Do not claim pixel-level parity in the UI or the docs. Claim
what is true: **same notebook, same source of truth, same grounded answers.**

### The problem it solves

Field-notes observation O1: in one 50-minute session the owner hand-relayed content
between seats **five times** — asking Gemini to re-narrate for Claude, asking Claude
to read Gemini's screen — because the bridge passes text lines only and the source
material (a NotebookLM notebook, the source notebook, holding five pages of handwritten notes)
was reachable only through Gemini Desktop's window. Every one of those relays paid
the full AX-scraping tax, and three of them failed outright (B2, B3).

The source material does not need a window. It has a CLI.

### Verified on this machine, 2026-09-08 — all CONFIRMED by execution

- `notebooklm` v0.8.1 (`notebooklm-py`), at `~/.local/bin/notebooklm`
  → `~/.local/share/uv/tools/notebooklm-py/bin/notebooklm`
- Authenticated: `~/.notebooklm/profiles/default/storage_state.json` (browser
  session state), valid — `notebooklm list` returned 18 notebooks live
- The target notebook exists: **the source notebook**, id `<notebook-id>`, owner
- End-to-end proof: a single headless `ask` against that notebook returned the exact
  `the project's directory structure` directory tree the owner had spent ~50 minutes trying to move
  between seats by hand, and printed `Resumed conversation: <conversation-id>`

### Why it fits this codebase almost exactly

The `ask` command's flags line up with the existing seat contract
(`invoke({ prompt, sessionRef, signal, onProgress }) → { ok, replyText, sessionRef }`)
nearly one-to-one — compare `src/adapters/claude-cli.js`:

| Seat contract | `claude` CLI | `notebooklm` CLI |
|---|---|---|
| prompt | `-p` / stdin | positional, or `--prompt-file -` (stdin) |
| structured output | `--output-format stream-json` | `--json` (answers carry source IDs) |
| sessionRef | `--resume <session-id>` | `-c/--conversation-id <id>`; returns the id |
| target | `--model` | `-n/--notebook <id>` (also env `NOTEBOOKLM_NOTEBOOK`) |
| fresh session | — | `--new` (**destructive**: deletes the server-side conversation; requires `-y`) |

A `src/adapters/notebooklm-cli.js` modelled on `claude-cli.js` is the obvious shape.
No accessibility API, no window, no Space, no button heuristics, no `isBusy`
inference — i.e. none of B2, B3, or their causes apply to this transport.

### Risks — state these plainly, do not bury them

1. **Unofficial.** `notebooklm-py` is a community tool driving NotebookLM through a
   saved **browser session**, not an official Google API. Google can break it
   without notice, and the owner should satisfy themselves about terms of service.
2. **Auth expires.** `storage_state.json` is browser session state (last written
   2026-09-04). When it lapses, `notebooklm login` needs a **human at a browser** —
   a headless seat cannot recover on its own. The adapter must detect the auth
   failure and say so precisely rather than reporting it as an empty or failed
   round. This is the same class of mistake as B4.
3. **Latency.** Calls go through browser automation; budget seconds, not
   milliseconds, and set the timeout deliberately.
4. **`--new` is destructive** — it deletes the notebook's server-side conversation
   irrecoverably. If the adapter ever passes it, it must also pass `-y`, and that
   combination should require an explicit, deliberate opt-in.
5. **It is a source, not a peer.** NotebookLM answers questions grounded in the
   notebook's sources. It is not a tool-using agent like the `@claude` seat, and
   should not be presented to the user as one.

### Required change

Design decision first — see `[NEEDS CLARIFICATION: B6-shape]` — then implement the
chosen shape as an adapter alongside the existing ones, with its own test file
modelled on `test/claude-cli.test.js` using a faked `run` (no live network in tests).

### Acceptance criteria

- A seat or tool backed by `notebooklm ask` returns grounded answers with the
  conversation id round-tripped as `sessionRef`
- An expired/invalid session produces a distinct, accurate error naming
  `notebooklm login` as the fix — never a generic empty-reply
- `--new` is not reachable without explicit configuration
- Tests use a fake `run`; `npm test` needs no network and no NotebookLM auth

---

## 8. Open questions — resolve with the repo owner before implementing

Per project spec protocol, no implementation plan is finalized while these remain.

- `[NEEDS CLARIFICATION: B2-cause]` Run the 5-minute timing experiment in §3 first,
  or implement both the stability-threshold and the extraction hardening blind?
  The experiment needs a live Gemini round; the owner may not want to spend one.
- `[NEEDS CLARIFICATION: B2-thresholds]` What are the acceptable numbers? Idle-stability
  poll count N, poll interval, and the per-seat maximum wait before `replyTimedOut`.
  Gemini AX reads alone measured 14–27s, so a generous ceiling costs real wall-clock
  on every failed round. Owner's tolerance, not an implementation detail.
- `[NEEDS CLARIFICATION: errors-log-content]` `errors.log` will contain fragments of
  conversation content (message lengths at minimum; candidate node text if we log it).
  How much content is acceptable, and does the file need a size cap, rotation, or a
  gitignore entry? Chat directories currently self-ignore via `.unite/.gitignore`.
- `[NEEDS CLARIFICATION: B4-surface]` How should the denial reason reach the seat —
  injected into the prompt preamble (`src/main/preamble.js`), returned as a system
  line in the transcript, or logged only? Preamble changes what the model is told
  about itself every round and deserves a deliberate decision.
- `[NEEDS CLARIFICATION: B6-shape]` **Partially resolved** by the owner's stated
  purpose above: the goal is symmetric grounding, not a new conversational
  participant. That rules out the plain `@notebook` seat as the *primary* shape.
  Three implementations remain, and the owner must pick:
  1. **Grounding preamble (recommended — cheapest, fits the stated goal exactly).**
     Before dispatching a round, the app runs one `notebooklm ask` with the user's
     message and injects the grounded answer into the seat prompt as context, via the
     existing `src/main/preamble.js`. Both seats then see the same notebook-derived
     material on every turn. No tool-calling machinery, no new roster concepts, one
     extra CLI call per round. Costs latency on **every** round, including ones that
     do not need the notebook.
  2. **Retrieval tool the seat calls when it needs it.** Strictly better grounding —
     the seat asks only when relevant, and can ask follow-ups — but the bridge has no
     tool-calling mechanism today. Substantially larger change.
  3. **Seat (`@notebook`)** — smallest change of all, but it leaves the owner
     brokering between seats, which is the exact behaviour (O1) this is meant to end.
  A pragmatic path is 1 now, 2 later; 3 only if the notebook should also be directly
  addressable by the human. Note that the product intent above makes 3 actively
  wrong as the *primary* shape — it preserves the human-as-relay that this exists to
  remove — though it could coexist harmlessly with 1 or 2 as a convenience.
- `[NEEDS CLARIFICATION: B6-preamble-cost]` If shape 1 is chosen: run the grounding
  query on **every** round, or only when the message looks notebook-relevant (and by
  what rule)? Every round is simple and predictable but adds seconds to turns that do
  not need it. This interacts with B5's trace, which will show what the real cost is.
- `[NEEDS CLARIFICATION: B6-notebook-binding]` Is the notebook fixed per chat
  (config), per message (`@notebook:<name> ...`), or does it follow the CLI's own
  "current notebook" context? The CLI's context is global to the machine, so a
  chat-scoped binding is safer, but that is a decision, not a default.
- `[NEEDS CLARIFICATION: B6-auth-policy]` When the browser session expires mid-round,
  the seat cannot self-heal — `notebooklm login` needs a human at a browser. Should
  the app preflight the session at startup (one extra call per launch), fail the
  round with a specific message, or both?

- `[NEEDS CLARIFICATION: B5-retention]` Keep traces for successful rounds too, or
  only failures? Successful traces are what establish a baseline for "normal", but
  they accumulate: ~300 rows per round, every round. Ring buffer of the last N, a
  size cap, or failures only?
- `[NEEDS CLARIFICATION: B5-idle-trace]` The original request was for the app to
  "spin up a monitor and a poller at init". §6 as written traces **rounds only**.
  Tracing *between* rounds means reviving a repeating preflight in the terminal
  runner — `bin/unite-desktop.js` runs preflight exactly once at startup, while the
  Electron GUI already ticks every 2s (`src/main/main.js:19,90`). That is a real
  behaviour change with a real cost: `runJxa` spawns **one `osascript` process per
  call** (`src/ax/jxa.js:12`), so a 2s tick across two seats is a process spawn per
  second, indefinitely, whether or not anyone is using the app. Decide explicitly:
  rounds only (recommended), or idle tracing too and accept that cost?
- `[NEEDS CLARIFICATION: B5-content]` The trace as specified records **sizes and
  counts, never message text**. Confirm that is what is wanted — text would make
  diagnosis easier and would put conversation content into a plaintext file on disk.

- `[NEEDS CLARIFICATION: error-voice]` The `ERRORS` catalog is written as
  instructions ("do X, then send again"). B3 asks for observed-state reporting, which
  is a different voice. Confirm the catalog should carry both, or whether observed
  state belongs solely in `errors.log` with the user-facing text kept short.

---

## 9. Suggested order

1. **B1** — unblocks field diagnosis of everything else; smallest change
2. **B5** — the trace. Do it *before* B2, not after: it converts B2's open question
   from "run a live experiment and hope it reproduces" into "read the trace from the
   next failure". Cheap, additive, and it cannot break a working round because it
   adds no AX calls
3. **B3** — small, self-contained, removes an actively misleading message
4. **B4** — isolated to one adapter and its test
5. **B2** — largest, and its shape depends on `[NEEDS CLARIFICATION: B2-cause]`,
   which B5 is designed to answer. If B5 ships first, wait for one real failure
   trace before writing B2's fix
6. **B6** — independent of all of the above and can be built in parallel by someone
   else. Sequenced last only because B1–B5 keep the current transport honest; if the
   owner's priority is getting notebook content to the seats rather than hardening
   the Gemini path, B6 moves to the front

Each is independently shippable. Do not bundle them into one commit; the project's
commit rule (`build-briefing/docs/commit-rule.md`) requires each commit to carry
status signal for what it changed and where it leaves the project.

## 10. Out of scope

- The general shared-artifact/context gap between seats (observation O1): passing
  images, files, and screens between seats. **B6 addresses the specific case that
  caused every observed instance** — notebook content — but the general mechanism
  (arbitrary artifacts moving seat to seat) still needs its own design.
- **Writing back to the notebook.** The CLI can create notes
  (`notebooklm note create`), so a brainstorm's conclusions could accumulate into the
  shared harness over time. That is a natural extension of the owner's "primary data
  harness" framing and probably the right long-term shape, but it is a write path
  into the owner's account with its own failure modes and needs its own design. Not
  in this spec.
- Any change to `vendor/` or the upstream AgentsUnite engine.
- Gemini's own behaviour (long thinking loops). We can only observe it.

## 11. Verification before handoff

- `npm test` passes
- New tests fail against the unfixed code (prove they test something)
- No `vendor/` file modified: `git status --short vendor/` is empty
- Handoff note states that the operator must quit and relaunch `AgentsUniteD`
