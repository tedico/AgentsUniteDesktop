# Relay Failure Diagnostics Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans (this session: inline — owner said "just go ahead to do build"). Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make degraded seat rounds diagnosable and honest, then add NotebookLM as a shared grounding source — without changing the Gemini-desktop / Claude-CLI / seat-to-seat architecture.

**Architecture:** Catalog errors already become `@seat offline` system lines; they never reach `errors.log` because adapters omit `stderr` and nothing in `src/` calls `appendErrorLog`. A thin `withErrorLog` wrapper (Electron relay + CLI bin) writes machine-state diagnostics. The desktop adapter records per-poll traces it already has in memory. Gemini `isBusy` also watches thinking-panel growth. JXA `windows` reports activate outcome; Node helper can poll to a deadline. Claude CLI captures harness denials. NotebookLM is one `ask` per human submit, injected via the existing preamble.

**Tech Stack:** Node ≥ 20 ESM, `node --test`, no new runtime dependencies. Never edit `vendor/`.

**Spec:** `docs/superpowers/specs/2026-09-08-relay-failure-diagnostics.md`

## Global Constraints

- Never edit `vendor/`. Engine change required → upstream + `npm run vendor:engine` + `engine.pin.json` (not needed here).
- Tests: `npm test` (`node --test test/*.test.js`). No network. Fake helpers and saved AX fixtures only.
- User-facing failure text lives in `src/shared/errors.js` only.
- ES modules, no TypeScript, no new runtime dependencies.
- Gemini stays in Gemini.app over Accessibility. Claude stays `claude -p`. NotebookLM is a source, not a seat.
- The running app does not hot-reload — handoff must say quit and relaunch `AgentsUniteD`.

## Locked decisions (spec §8 — owner said go ahead)

| ID | Decision |
|---|---|
| B2-cause | Thinking-as-busy + clearer empty messages, plus a higher idle-stability threshold (owner, 2026-09-08). |
| B2-thresholds | `pollMs = 1000`, **3 identical idle polls**, existing `timeoutMs` (default 300000). |
| errors-log-content | Machine state only: seat, code, elapsed ms, counts, lengths, busy/via history. **Never** message body text. Chat dirs already self-ignore via `.unite/.gitignore`. No rotation in this pass (blocks stay compact). |
| B4-surface | Capture denials on the adapter result; write `errors.log`; post a system transcript line when denials occur; add one standing sentence to `claudeCliPreamble` (harness gate ≠ macOS permissions). Do not inject denial details into every preamble. |
| B6-shape | Shape 1 — grounding preamble (recommended). |
| B6-preamble-cost | Only when a notebook is bound to the chat. Then **one** `ask` per human submit, same block injected into every seat turn of that round. |
| B6-notebook-binding | Chat-scoped: `.unite/config.json` key `notebookId`. Not the CLI's global current-notebook. |
| B6-auth-policy | Both: preflight if `notebookId` is set; if auth fails mid-round, catalog error as a system line and **still run the seats** (grounding is additive, never a sandbox). |
| B5-retention | Failures always (`errors.log`). Successes too, size-capped (`traces.log`, 256 KiB, drop oldest). Owner, 2026-09-08. |
| B5-idle-trace | Rounds only. |
| B5-content | Full message item text on each poll row (owner, 2026-09-08). |
| error-voice | Catalog carries observed state plus a next-step only for conditions actually detected. |

## File structure

- Create: `src/shared/diagnostics.js` — `formatDiagnostic`, `formatDenials`, `harnessDenialLine`
- Create: `src/main/log-adapter.js` — `withErrorLog` / `withErrorLogs`
- Create: `src/ax/wait.js` — `waitForWindows`
- Create: `src/adapters/notebooklm-cli.js`
- Create: `src/main/notebook.js` — `groundRound`, session file, auth detection
- Create: `test/diagnostics.test.js`, `test/log-adapter.test.js`, `test/wait-windows.test.js`, `test/notebooklm-cli.test.js`, `test/notebook.test.js`
- Modify: `src/main/relay.js`, `bin/unite-desktop.js`, `src/adapters/desktop-adapter.js`, `src/adapters/claude-cli.js`, `src/ax/ax.jxa`, `src/ax/helper.js`, `src/ax/query.js`, `src/selectors/gemini.js`, `src/shared/errors.js`, `src/main/preflight.js`, `src/main/preamble.js`, `src/main/settings.js`, `src/main/main.js`
- Test: existing files listed per task

---

### Task 1: B1 — write `errors.log` on catalog failures

**Files:**
- Create: `src/shared/diagnostics.js`, `src/main/log-adapter.js`, `test/diagnostics.test.js`, `test/log-adapter.test.js`
- Modify: `src/main/relay.js`, `bin/unite-desktop.js`, `test/relay.test.js`

**Interfaces:**
- Consumes: `appendErrorLog`, `appendMessage` from vendored transcript
- Produces: `formatDiagnostic({ seat, code, elapsedMs, extra }) → string`; `withErrorLogs(adapters, dir) → adapters`

- [ ] **Step 1: Write the failing relay test**

```js
test('degraded round writes errors.log so /last-error is not empty', async () => {
  const claude = fakeAdapter('claude', [{
    ok: false, error: ERRORS.emptyReply('Claude'), sessionRef: 'desktop:claude',
  }]);
  const { dir, relay } = setup({ claude, gemini: fakeAdapter('gemini') });
  await relay.submit('@claude go');
  const log = fs.readFileSync(path.join(dir, 'errors.log'), 'utf8');
  assert.match(log, /claude/);
  assert.match(log, /emptyReply|finished but no new text/i);
  assert.match(log, /elapsedMs=/);
  assert.equal(fs.existsSync(path.join(dir, 'errors.log')), true);
});

test('a successful round does not create errors.log', async () => {
  const { dir, relay } = setup({ claude: fakeAdapter('claude'), gemini: fakeAdapter('gemini') });
  await relay.submit('@claude hi');
  assert.equal(fs.existsSync(path.join(dir, 'errors.log')), false);
});
```

- [ ] **Step 2: Run test — expect FAIL** (`errors.log` missing)
- [ ] **Step 3: Implement `formatDiagnostic` + `withErrorLog`; wrap adapters in `makeRelay` and `bin/unite-desktop.js`. Strip `stderr` after logging so the engine does not double-write.**
- [ ] **Step 4: Run tests — expect PASS**
- [ ] **Step 5: Do not commit** (owner did not ask)

---

### Task 2: B5 — per-poll round trace (failures only)

**Files:**
- Modify: `src/adapters/desktop-adapter.js`, `src/ax/query.js`, `src/selectors/gemini.js`, `test/desktop-adapter.test.js`, `test/ax-query.test.js`, `test/helpers/fake-helper.js` (call counter already exists)

**Interfaces:**
- Produces: `thinkingChars(root, sel) → number`; adapter fail `stderr` / `diagnostics.trace` rows: `elapsedMs, busy, via, items, chars, think, stable, phase`

- [ ] **Step 1: Failing tests** — `thinkingChars` on a tree with `AXTextArea` "text entry area"; settle records one row per snapshot poll; failing round includes the trace in `stderr`; successful round has no `stderr`; fake helper snapshot count unchanged vs current happy-path baseline (`['isRunning', 'snapshot', 'setValue', 'snapshot', 'getValue', 'press', 'snapshot', 'snapshot', 'snapshot']`).
- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Record rows inside existing `settle()` / invoke snapshots. `progress(null)` pre-wait still traces as `phase=pre-wait`. Discard trace on success.**
- [ ] **Step 4: Run — expect PASS**

---

### Task 3: B3 — honest `noWindow`

**Files:**
- Create: `src/ax/wait.js`, `test/wait-windows.test.js`
- Modify: `src/ax/ax.jxa`, `src/ax/helper.js`, `src/shared/errors.js`, `src/main/preflight.js`, `src/selectors/gemini.js`, `test/errors.test.js`, `test/preflight.test.js`, `test/ax-helper.test.js`, `test/helpers/fake-helper.js`

**Interfaces:**
- JXA `windows` / `snapshot` accept `activateWaitMs`. Result adds `frontmost` and `activate: { attempted, succeeded, error }`.
- `ERRORS.noWindow(app, observed)` — observed counts only; no Space/hidden claim unless detected.
- Preflight `windows()` stays fast (default `activateWaitMs=300`) so the 2s GUI tick does not block. Invoke-time snapshots for Gemini pass `activateWaitMs: 30000`.

- [ ] **Step 1: Failing tests** for observed-state copy; `waitForWindows` 0→1; helper passes `activateWaitMs`.
- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: JXA: do not swallow activate errors; poll to `activateWaitMs`; return activate outcome. Rewrite catalog + preflight.**
- [ ] **Step 4: Run — expect PASS**

---

### Task 4: B4 — Claude harness denials

**Files:**
- Modify: `src/adapters/claude-cli.js`, `src/main/log-adapter.js`, `src/main/preamble.js`, `src/shared/errors.js`, `test/claude-cli.test.js`, `test/preamble.test.js`, `test/log-adapter.test.js`

**Interfaces:**
- Produces: `res.denials = [{ tool?, reason }]` from `tool_result` `is_error` / permission-denial content.

- [ ] **Step 1: Failing test** — fixture stream with a Bash tool_result denial → `denials[0].reason` captured; no-denial stream unchanged.
- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Parse in `makeLineSplitter` callback; wrap logs + system line on denials; one preamble sentence.**
- [ ] **Step 4: Run — expect PASS**

---

### Task 5: B2 — do not discard a produced Gemini reply

**Files:**
- Modify: `src/adapters/desktop-adapter.js`, `src/shared/errors.js`, `test/desktop-adapter.test.js`, `test/errors.test.js`

- [ ] **Step 1: Failing test** — idle-looking chrome (mic visible) while thinking `AXTextArea` grows, then answer `AXStaticText` appears → adapter returns the answer, not `emptyReply`. `emptyReply` text distinguishes thinking-present vs truly empty. Existing adapter tests still pass.
- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: `isBusy` or settle: thinkingChars growth resets `stable`. emptyReply catalog includes observed counts.**
- [ ] **Step 4: Run — expect PASS**

---

### Task 6: B6 — NotebookLM grounding preamble

**Files:**
- Create: `src/adapters/notebooklm-cli.js`, `src/main/notebook.js`, `test/notebooklm-cli.test.js`, `test/notebook.test.js`
- Modify: `src/main/preamble.js`, `src/main/relay.js`, `src/main/settings.js`, `src/main/preflight.js`, `src/main/main.js`, `bin/unite-desktop.js`, `src/shared/errors.js`, plus matching tests

**Interfaces:**
- `notebooklmCliAdapter({ binary, notebookId, run, timeoutMs, allowNew }).invoke` → `{ ok, replyText, sessionRef }` or `{ ok:false, error }` with `errorCode: 'notebooklmLogin'` on auth failure.
- CLI: `notebooklm ask --json -n <id> [--conversation-id] [--prompt-file -]`. Never `--new` unless `allowNew === true` (and then also `-y`).
- `groundRound({ question, dir, notebookId, ask })` — one ask, persist `sessionRef` in `<chatdir>/notebook.json`.
- `buildHybridPrompt` / `buildDesktopPrompt` accept `notebookContext` and append a labeled sourced block (citations kept).
- Room config: `notebookId` (optional string).

- [ ] **Step 1: Failing tests** for ask JSON parse, auth error, `--new` guard, preamble injection, relay system line on auth fail without aborting the seat turn.
- [ ] **Step 2: Run — expect FAIL**
- [ ] **Step 3: Implement adapter + groundRound + wire submit paths + preflight if bound.**
- [ ] **Step 4: Run — expect PASS**

---

### Task 7: Verification

- [ ] `npm test` passes
- [ ] `git status --short vendor/` is empty
- [ ] Handoff: quit and relaunch `AgentsUniteD`

## Self-review

- B1–B6 each have a task. Out-of-scope items (write-back to notebook, general artifacts, vendor edits) have no tasks.
- No TBD/placeholder steps.
- `withErrorLogs` is the single B1 writer used by relay and CLI; engine `stderr` is stripped after the wrap to avoid double-log.
