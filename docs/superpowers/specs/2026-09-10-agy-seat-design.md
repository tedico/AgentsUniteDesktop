# Antigravity CLI as the default `@gemini` seat in the terminal runner

Date: 2026-09-10 · Repo: `AgentsUniteDesktop` · Brainstormed with Ted 2026-09-10 (approach A of 3).
Authors: Ted (decisions), Claude (design). Status: approved in sections; open markers: none.

## 0. Purpose

Ted's requirement, verbatim in spirit: Claude and Gemini converse and brainstorm together
on one designated NotebookLM notebook, and both seats run as CLIs. The Gemini macOS app
is being retired from the terminal runner because it is unstable and because every
accessibility poll costs 4 to 35 seconds; rounds reached 213 seconds at nine replies
(`docs/field-notes/2026-09-08-evening-relay-hardening.md`).

Everything the change needs already exists:

- `agy` 1.2.0 runs headless: `agy --print <prompt> --mode plan --output-format json`
  returns `{ conversation_id, status, response }`; `--conversation <id>` resumes.
- The upstream AgentsUnite repo has a finished headless seat adapter,
  `lib/adapters/agy.js`, with ten tests. This repo never vendored it.
- `bin/unite-desktop.js` already composes a headless Claude seat with a pluggable
  second seat, grounding (`groundRound`), error logs, traces, and 156 tests.
- NotebookLM grounding is CLI-based (`notebooklm ask --json`), not app-based, so the
  new seat receives the same notebook block the desktop seat did.

## 1. Decisions (Ted, 2026-09-10)

| Decision | Choice |
|---|---|
| Where the seat lives | **A.** An option in this repo's terminal runner. The Electron window is untouched. |
| Default seat | **`agy`.** Existing rooms switch on their next launch. `desktop` stays as an explicit opt-in. |
| Gemini model | **Top Pro at high effort, chosen dynamically** from `agy models` at every launch; a room's `models.gemini` overrides; pinned fallback when the list is unavailable. |
| Antigravity mode | **Plan mode, read-only.** The scholar-versus-builder split stays; Claude keeps accept-edits. |
| Notebook access | **Grounding only** in this change. Per-seat NotebookLM tools over MCP are a separate second step (§10). |
| Sequencing | **This change lands before** the Phase 7 seat-exchange plan (`docs/superpowers/plans/2026-09-09-seat-exchange.md`). That plan's wiring task then wraps the seat factory's output instead of `geminiDesktopAdapter` directly; one line changes there. |
| Execution model | **Conductor + Workhorse, division of labor.** Claude Code writes the plan and every task prompt, Antigravity (`agy`, accept-edits) writes tests and code, Claude Code runs the suite, reviews the diff, and commits. §7. |
| Package for NotebookLM | The installed `notebooklm-py` 0.8.1 (`teng-lin`). No second NotebookLM tool is installed. |

Rejected: B, port grounding and the tools-on Claude seat upstream into AgentsUnite (two
repos, a re-port of Phase 5 hardening, same first result); C, a separate `unite-cli.js`
(duplicates the readline loop and round wiring); a local re-implementation of the agy
adapter in the style of `claude-cli.js` (upstream needs no behavior change, and a vendored
copy inherits fixes on the next pin bump); the community Claude Code plugins for `agy`
(one Bash command does the same; they would pass the SkillSpector gate for no gain).

## 2. Architecture

Guardrail, unchanged from the seat-exchange spec: nothing under `vendor/` is edited by
hand; the vendored engine is extended only by listing one more upstream module in
`engine.pin.json` and re-running `npm run vendor:engine`.

```
.unite/config.json ─ geminiSeat: "agy" | "desktop"   models.gemini (optional)
                                 │
bin/unite-desktop.js ────────────┼──────────────────────────────────────────────
  resolveGeminiModel()  ◄── agy models (stdout) ── or config ── or FALLBACK
  seat factory:  agy     → agyAdapter({ binary, model, timeoutMs })     [vendored]
                 desktop → geminiDesktopAdapter({ helper, timeoutMs })  [existing]
  preflight:     agy     → checkAgyCli (binary on PATH)
                 desktop → checkSeat (accessibility tree)               [existing]
  session guard: agy + state.agents.gemini.sessionRef starts "desktop:" → reset
                                 │
                 runRound(adapters, buildHybridPrompt, groundRound)     [unchanged]
```

Components:

| # | Component | File | Change |
|---|---|---|---|
| 1 | Vendored adapter | `engine.pin.json`, `vendor/agentsunite/lib/adapters/agy.js` | add `lib/adapters/agy.js` to `modules`; re-vendor at the existing pin |
| 2 | Model resolution | new `src/main/gemini-model.js` | parse `agy models`, pick top Pro high, fallback, override |
| 3 | Preflight | `src/main/preflight.js`, `src/shared/errors.js` | `checkAgyCli`; `checkHybrid` gains `geminiSeat` and `geminiBinary`; `ERRORS.agyNotOnPath` |
| 4 | Runner wiring | `bin/unite-desktop.js` | seat key validation; helper only for `desktop`; seat factory; session guard; banner and `/who`; seat-neutral startup lines |
| 5 | Tests | `test/agy-adapter.test.js`, `test/helpers/stub.js`, `test/gemini-model.test.js`, `test/preflight.test.js`, `test/unite-desktop-bin.test.js`, `test/vendor-drift.test.js` | §6 |
| 6 | Docs | `README.md`, `SPRINT.md`, `PROJECT.md` | §3.7 |

## 3. Component design

### 3.1 Seat selection (`bin/unite-desktop.js`)

Room config key `geminiSeat`. Values `"agy"` and `"desktop"`; absent means `"agy"`.
Any other value prints `geminiSeat must be "agy" or "desktop" (got "<value>")` and exits 1
before preflight. The key is read through the existing `loadConfig(root)` spread; the
vendored `DEFAULT_CONFIG` is not touched. The binary is `config.binaries.gemini`, which
the vendored defaults already set to `agy`.

### 3.2 Vendored adapter (`vendor/agentsunite/lib/adapters/agy.js`)

`engine.pin.json` `modules` gains `"lib/adapters/agy.js"`. The pin commit stays
`8f6bb60f95ce01266d6ad6be08503378b059a154`: upstream's only commits after it are docs and
license, and `lib/adapters/agy.js` is byte-identical at pin and at upstream `HEAD`
(`ec07dc0`). The adapter's import closure (`../proc.js`, `../progress.js`) is already
vendored. `vendor/agentsunite/COMMIT` is unchanged.

What the adapter does, for the record: passes the prompt as the value of `--print`
(the CLI parses `-p` greedily, so the prompt must directly follow the flag), `--mode
plan`, `--output-format stream-json`, optional `--model`, optional `--conversation`;
tracks progress from `init`, `step_update`, and `result` events; adds 15 seconds of grace
above `timeoutMs` so `agy`'s own `--print-timeout` diagnostic wins the race; returns
`{ ok, replyText, sessionRef }` or the same failure shapes as the Claude seat
(`timeout`, `binary not found`, `exit N` with `sessionLost` when a session was passed,
`bad json`, `empty reply`, `error result`).

Upstream's `test/adapter-agy.test.js` and `test/helpers/stub.js` are copied into this
repo's `test/` with the import path changed to the vendored module. Test code is not
vendored and is not covered by the vendor-drift test.

### 3.3 Model resolution (`src/main/gemini-model.js`)

```js
export const FALLBACK_GEMINI_MODEL = 'gemini-3.1-pro-high';
export function pickTopGeminiModel(stdout)                       // → id | null
export async function resolveGeminiModel({ configured, binary = 'agy', run = runHeadless, timeoutMs = 15000 })
  // → { model, source: 'config' | 'agy models' | 'fallback' }
```

`agy models` prints `Fetching available models...` on stderr and one `id<TAB>label` line
per model on stdout (verified 2026-09-10). `pickTopGeminiModel` reads stdout only:

1. Split each stdout line on its first tab; the id is the first field. Keep ids matching `^gemini-(\d+)\.(\d+)-pro-high$`.
2. Return the id with the greatest `(major, minor)`. Ties cannot occur; the list has one
   id per tier, version, and effort.
3. No match → `null`.

Flash tiers, Claude and GPT-OSS ids, and Pro ids at medium or low effort are never
selected. If Google ships a new Pro without a `-high` variant, the fallback applies until
Ted sets `models.gemini` or updates the constant.

`resolveGeminiModel`:

- `configured` non-empty → `{ model: configured, source: 'config' }`, no subprocess.
- Else run `agy models` with `timeoutMs` 15 s. Exit 0 and a pick → `source: 'agy models'`.
- Spawn error, non-zero exit, timeout, or `null` pick → `{ model: FALLBACK_GEMINI_MODEL, source: 'fallback' }`.
- Runs once per launch, before preflight, only when `geminiSeat === 'agy'`. Never throws.

The runner prints the outcome on its own line so Ted always sees what is live:
`@gemini model: gemini-3.1-pro-high (agy models)` or `(config)` or
`(fallback — agy models unavailable)`.

### 3.4 Preflight (`src/main/preflight.js`, `src/shared/errors.js`)

```js
export async function checkAgyCli({ which = defaultWhich, binary = 'agy' } = {})
// → { seat: 'gemini', appName: 'Antigravity', ready, message }
```

Mirrors `checkClaudeCli`: resolved path → `ready: true`, message `Antigravity CLI: <path>`;
not found → `ERRORS.agyNotOnPath()`, whose text is:

> agy is not on PATH. Install the Antigravity CLI and make sure `agy` is on your PATH, then run again.

`checkHybrid` gains `geminiSeat = 'agy'` and `geminiBinary = 'agy'`. For `agy` it calls
`checkAgyCli` and never touches `helper` or `geminiSelectors`; for `desktop` it calls
`checkSeat` as today. `ready` stays `claude.ready && gemini.ready`; the NotebookLM check is
unchanged. The runner's exit rule is unchanged: only a missing Claude CLI exits; a missing
`agy` prints `!!` and the runner continues, and each round then logs the seat error.

### 3.5 Runner wiring (`bin/unite-desktop.js`)

- `makeAxHelper()` is constructed only when `geminiSeat === 'desktop'`. An `agy` room
  never spawns `osascript` and never needs Accessibility permission.
- Adapter factory as in §2. `timeoutMs` is the room's `config.timeoutMs` for both seats.
- **Session guard.** After `ensureChat` and before the first round: if `geminiSeat ===
  'agy'` and `loadState(dir, roster).agents.gemini.sessionRef` starts with `desktop:`, set
  that seat's `sessionRef` to `null` and `cursor` to `0`, `saveState`, and print
  `(@gemini switched to Antigravity — its session was reset; the preamble and the full
  transcript are re-sent on its next turn)`. This mirrors the engine's own self-heal
  (`engine.js` line 75). It is needed because `agy --conversation desktop:gemini` does
  not fail: it warns on stderr, starts a fresh conversation, and exits 0 (verified), so
  without the guard the engine would keep `firstTurn` false and the new seat would never
  receive the preamble.
- Banner: `@claude (CLI, tools on) · @gemini (agy · plan · <model>)`, or
  `@gemini (Desktop)`. `/who` prints the same. The startup joke lines drop `Gemini.app`
  wording and say `@gemini`.
- Everything else, including grounding, `/plan`, `^C` handling, and `withErrorLogs`, is
  untouched.

### 3.6 Prompt and preamble (`src/main/preamble.js`)

No change. `desktopPreamble` carries no app-specific text. Verified live 2026-09-10
through the upstream adapter with `buildHybridPrompt` and a synthetic notebook block on
`gemini-3.1-pro-high`: turn one (25 s) kept all three `[N]` citations, added no speaker
label, and handed off with `@claude`; turn two (15 s) resumed by `--conversation` from a
delta-only prompt, recalled the notebook block from turn one, and used the yield phrase
`Ted, we need you to make a decision on …`. The Phase 7 preamble rewrite applies to
whichever adapter sits in the seat.

### 3.7 Docs

- `README.md`: prerequisites add the Antigravity CLI; the config section documents
  `geminiSeat` and `models.gemini`; the architecture table gains a row for the terminal
  runner's `agy` seat; "Why does AgentsUniteDesktop exist?" gains a paragraph saying the
  terminal runner now defaults to `agy` and the accessibility bridge remains for the
  Electron window and the `desktop` opt-in.
- `SPRINT.md`: new phase for this change; Phase 6 re-labelled as applying to the
  `desktop` seat only; `Next:` and `Human:` updated at session end.
- `PROJECT.md`: current focus and status.

## 4. Evidence (2026-09-10 probes, nothing kept)

| Probe | Result |
|---|---|
| `agy --print … --output-format json` | JSON with `conversation_id`, `status`, `response`; 8 s on Flash |
| Two-turn round via upstream adapter, Pro high | citations kept, no label, hand-off, resume, yield phrase; 25 s + 15 s |
| `--model gemini-3.1-pro-high` | accepted; the CLI log records the id 12 times for the run |
| `agy models` | list on stdout, status line on stderr |
| `--conversation desktop:gemini` | `warning: conversation "desktop:gemini" not found` on stderr, fresh conversation, exit 0 |
| accept-edits, file task with a relative location | wrote into an unrelated empty folder after 51 searches; 152 s; 314k tokens; said "done" |
| accept-edits, same task with an absolute path | one tool call; correct file; 15 s; 30k tokens |

The last two rows shape §7.

## 5. Edge cases

- `agy` missing: preflight `!!` line; runner continues; each round logs `binary not found`.
- `agy models` offline, slow, or empty: fallback constant, banner says so, startup delay
  capped at 15 s.
- Unknown `geminiSeat` value: exit 1 with the message in §3.1. Fail loud, never guess.
- Stale `desktop:` session: §3.5 guard. Switching a room back to `desktop`: the desktop
  adapter ignores the incoming `sessionRef` and returns `desktop:gemini`; no guard needed.
- Timeouts: the adapter's 15 s grace above `timeoutMs`; a Pro turn measured 25 s.
- Warnings on stderr with exit 0 are ignored by the adapter, as verified with the stale id.
- Prompt on `argv`: macOS `ARG_MAX` is 1 MiB, far above any round; the text is visible
  in `ps` for the turn's duration. Accepted, as upstream does.
- `--disable-slash-commands` conflicts with `--mode plan` in `agy` (upstream comment);
  the adapter never passes it.
- The `main` room's stale `cursor` seat entry in `state.json` is ignored by the roster
  `['claude', 'gemini']`, as today.

## 6. Testing

TDD; existing patterns only. Per §7, Antigravity writes each test and its implementation
in one task; Claude Code runs `npm test` and confirms the test failed against the
previous commit where the plan says so.

- **`test/agy-adapter.test.js`** — upstream's ten tests, import path changed: argument
  order, plan mode, stream-json; progress phases; `--conversation` on later turns;
  `sessionLost` on non-zero exit with a session; stdout diagnostic preserved; empty and
  `is_error` results; leading JSON notice; flat json-mode fallback; 15 s grace.
- **`test/helpers/stub.js`** — copied verbatim.
- **`test/gemini-model.test.js`** — `pickTopGeminiModel` on the captured 2026-09-10
  list → `gemini-3.1-pro-high`; a list with `gemini-4.0-pro-high` added → that id; a list
  with only Flash → `null`; garbage → `null`. `resolveGeminiModel`: configured wins with
  no subprocess; `agy models` pick; spawn error, non-zero exit, timeout, and `null` each →
  fallback with `source: 'fallback'`.
- **`test/preflight.test.js`** — `checkAgyCli` found and not found; `checkHybrid` with
  `geminiSeat: 'agy'` and a helper whose every method throws → gemini seat ready, helper
  never called; `geminiSeat: 'desktop'` still runs `checkSeat`.
- **`test/unite-desktop-bin.test.js`** — source contains `agyAdapter`, `geminiSeat`,
  `resolveGeminiModel`, `checkAgyCli`; still contains `geminiDesktopAdapter`.
- **`test/vendor-drift.test.js`** — `vendor/agentsunite/lib/adapters/agy.js` exports
  `agyAdapter`.
- **`test/errors.test.js`** — `agyNotOnPath` message names the binary and PATH.

Live, after merge, in a room with `notebookId` bound: `@gemini <notebook question>` →
one turn with citations; `@claude <question that hands off to @gemini>` → two turns;
`/who` and the banner show the resolved model; `errors.log` empty; timings recorded in a
field note. Then one launch with an existing room to see the session-guard line and a
preamble-bearing first turn.

## 7. Execution model — Conductor + Workhorse

Roles: Claude Code (this session) is the conductor; Antigravity `agy` is the workhorse.
Source: Ted's pattern note, applied with the guardrails the §4 probes demanded.

- Branch `feat/agy-seat` off `feat/relay-failure-diagnostics`. The plan is written with
  the writing-plans skill after Ted approves this spec; one commit per task.
- For each task the conductor runs, from the repo root:
  `agy --print "<task text>" --mode accept-edits --output-format json --print-timeout 10m`.
  Print mode enables Antigravity's terminal sandbox by itself.
- Every task prompt states the repo root and uses absolute paths for every file it
  names. No "current directory". Each task is a fresh conversation carrying the full task
  text; a failing task is re-sent to the same conversation with `--conversation <id>` and
  the test output pasted in.
- The workhorse writes tests and implementation. It does not run the suite, commit, or
  touch git. The conductor runs `git status --short`, reads the diff, runs `npm test`,
  and checks `git status --short vendor/` is empty except for the one re-vendored file.
- "done" from the workhorse is never accepted as evidence. The diff and the suite are.
- If the auto-mode classifier denies an `agy` launch inside the repo, the conductor
  implements that task itself and says so in the commit body. No workaround of the gate.
- Commits: `Co-Authored-By: ✦ Gemini (Antigravity) <noreply@google.com>` on every commit
  whose code Antigravity wrote, plus the conductor's own trailer, per Ted's attribution
  rule. Commit bodies carry status signal.

## 8. Rollout

1. Merge `feat/agy-seat` into `feat/relay-failure-diagnostics` (fast-forward), `npm test`
   green.
2. `/quit`, relaunch `AgentsUniteD`. Existing rooms switch to `agy` on launch; the
   session guard resets Gemini's seat and re-sends the preamble with the full transcript.
   A new chat avoids the replay and is the cheaper first run.
3. Bind a notebook (`notebookId` in the room's `.unite/config.json`) and run the live
   checks in §6.
4. Phase 6 becomes `desktop`-seat-only work. Phase 7 proceeds with its one-line wiring
   adjustment.

## 9. Open markers

None. Resolved with Ted 2026-09-10: `top-model-rule` (Pro high, dynamic), `sequencing`
(this change first), `execution-permissions` (division of labor; no new Bash rule).

## 10. Out of scope

- Per-seat NotebookLM tools over MCP for `agy` and Claude. Prerequisites, all verified
  2026-09-10: reinstall `notebooklm-py` with its `mcp` extra (the installed copy lacks
  `fastmcp`, so `notebooklm-mcp` does not start); `agy mcp add notebooklm notebooklm-mcp`;
  probe whether plan mode permits MCP tool calls; guard or disable `notebook_delete` and
  `source_delete` before an autonomous seat gets the server. Separate bounded step.
- The Electron window and its two accessibility adapters.
- Phase 6 poll cost.
- Any hand edit under `vendor/`; any change to the upstream AgentsUnite engine.
- The `cursor` seat.
- Antigravity running the test suite itself.

## 11. Verification before handoff

- `npm test` green; each new test shown failing first where the plan says so.
- `git status --short vendor/` shows only `vendor/agentsunite/lib/adapters/agy.js` added.
- `node bin/unite-desktop.js` in a scratch room prints the model line, the banner with
  `agy · plan · <model>`, and no Accessibility prompt.
- Handoff note states: relaunch required; existing rooms will replay once; bind a
  notebook for the live checks.
