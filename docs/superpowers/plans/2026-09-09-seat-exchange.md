# Seat Exchange Implementation Plan

> **For Cursor Agent:** Execute the tasks in order. Each task is one commit and ends
> with a passing test run. Follow the steps literally — write the failing test, run it
> and confirm it fails for the stated reason, write the minimal code, run it again,
> commit. Do not skip the failing run. Do not refactor beyond what a task asks. If a
> step's expected output does not match, stop and report rather than improvising.

**Goal:** Make a round a short, bounded exchange between the seats — the addressed seat answers and may hand off, the peer responds once, the addressed seat closes — instead of one seat answering Ted.

**Architecture:** Four desktop-side changes, vendored engine untouched: (1) the preamble stops telling seats not to @mention each other and gives them turn-taking rules; (2) the existing prompt builder appends a one-line close instruction when a seat is taking its second turn of a round after a peer replied; (3) a decorator around the Gemini seat appends a visible hand-back (`— over to @claude`) when Gemini answered a hand-off and named nobody, so the engine queues Claude's close; (4) the turn cap defaults to 4 instead of 8.

**Tech Stack:** Node ≥ 20, ES modules, `node:test` + `node:assert/strict`. No new dependencies.

**Spec:** `docs/superpowers/specs/2026-09-09-seat-exchange-design.md` — read it first; this plan implements it section by section.

## Global Constraints

- **Never edit anything under `vendor/`.** `git status --short vendor/` must print nothing at every commit.
- **Branch from `feat/relay-failure-diagnostics`; never merge into `main`.** Ted merges. Stop when the branch is green; do not merge or push.
- **The app may be running** (`AgentsUniteD`). It loads `.js` modules at start and re-reads only `src/ax/ax.jxa` from disk; this plan never touches that file, so editing is safe. **Do not relaunch the app** — Ted does that.
- **Use a worktree**, not the main checkout (Task 0).
- **One commit per task**, message with status signal (what changed + where it leaves the project), ending with exactly these two trailer lines:
  ```
  Co-Authored-By: 🤖 Cursor Agent 🤖 <noreply@cursor.com>
  ```
  (one blank line before the trailer).
- **Tests:** `npm test` runs everything; `node --test test/<file>.test.js` runs one file. Baseline is 156 passing, 0 failing.
- **Prose rules for preamble text** (an existing test enforces this on `desktopPreamble`): the new lines must not contain the words `tool`, `CLI`, `terminal`, `read-only`, `plan mode`, or `@cursor` (case-insensitive). The exact strings in Task 2 comply — copy them verbatim.
- **Exact strings:** the close line and the hand-back line are contracts other tasks assert on. Copy them from Task 3 and Task 4 verbatim, including the em dash `—`.

---

## File map

| File | Responsibility | Task |
|---|---|---|
| `src/main/round.js` (new) | Pure helpers over a transcript array: current round, last seat turn, seat-turn count | 1 |
| `src/main/preamble.js` (modify) | Preamble text; `CLOSE_LINE` + `closeLine()`; both prompt builders append it | 2, 3 |
| `src/main/handback-adapter.js` (new) | `withHandBack` / `withHandBacks` decorators | 4 |
| `src/main/settings.js` (modify) | `DESKTOP_TURN_CAP = 4` used by `readRoomConfig` | 5 |
| `src/cli/desktop-config.js` (new) | `desktopConfig(root)` for the terminal runner | 5 |
| `bin/unite-desktop.js` (modify) | use `desktopConfig`; wrap the Gemini seat | 5, 6 |
| `src/main/relay.js` (modify) | wrap the Gemini seat for the GUI | 6 |
| `test/round.test.js`, `test/handback-adapter.test.js`, `test/desktop-config.test.js`, `test/seat-exchange.test.js` (new); `test/preamble.test.js`, `test/settings.test.js`, `test/unite-desktop-bin.test.js`, `test/relay.test.js` (modify) | | 1–7 |
| `SPRINT.md` (modify) | Phase 7a status line | 8 |

---

### Task 0: Worktree and baseline

**Files:** none changed.

- [ ] **Step 1: Create the worktree on a new branch off the base branch**

Run from the repo root `~/Projekts/AgentsUniteDesktop`:

```bash
git worktree add ../AgentsUniteDesktop-worktrees/seat-exchange -b feat/seat-exchange feat/relay-failure-diagnostics
cd ../AgentsUniteDesktop-worktrees/seat-exchange
npm install
```

Expected: `HEAD is now at 978c910 docs(spec): seat exchange …` (or a later commit on that branch). All later steps run inside this worktree.

- [ ] **Step 2: Confirm the baseline is green**

Run: `npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"`
Expected:
```
ℹ tests 156
ℹ pass 156
ℹ fail 0
```

If not green, stop and report.

---

### Task 1: Round helpers

**Files:**
- Create: `src/main/round.js`
- Test: `test/round.test.js`

**Interfaces:**
- Produces:
  - `currentRound(messages)` → `messages` after the last `{ from: 'ted' }` entry (empty array if none, or if Ted's message is last).
  - `lastSeatTurn(round, roster)` → the last message in `round` whose `from` is in `roster`, skipping `from: 'system'`; `null` if none.
  - `seatTurnCount(round, roster)` → number of messages in `round` whose `from` is in `roster`.
  - `tedMessage(messages)` → the last `{ from: 'ted' }` message, or `null`.
- Message shape (from `vendor/agentsunite/lib/transcript.js`): `{ ts, from, text, mentions }`.

- [ ] **Step 1: Write the failing test**

Create `test/round.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentRound, lastSeatTurn, seatTurnCount, tedMessage } from '../src/main/round.js';

const ROSTER = ['claude', 'gemini'];
const m = (from, text, mentions = []) => ({ ts: 't', from, text, mentions });

test('currentRound: messages after the last ted message; empty when ted is last or absent', () => {
  const msgs = [m('ted', 'a', ['claude']), m('claude', 'b'), m('ted', 'c', ['claude']), m('claude', 'd', ['gemini']), m('gemini', 'e')];
  assert.deepEqual(currentRound(msgs).map((x) => x.text), ['d', 'e']);
  assert.deepEqual(currentRound([m('ted', 'a')]), []);
  assert.deepEqual(currentRound([]), []);
  assert.deepEqual(currentRound([m('claude', 'x')]).map((x) => x.text), ['x']);
});

test('lastSeatTurn skips system lines and ignores non-roster speakers', () => {
  const round = [m('claude', 'd', ['gemini']), m('system', 'harness denied a tool'), m('cursor', 'z')];
  assert.equal(lastSeatTurn(round, ROSTER).from, 'claude');
  assert.equal(lastSeatTurn([m('system', 's')], ROSTER), null);
  assert.equal(lastSeatTurn([], ROSTER), null);
});

test('seatTurnCount counts only roster seats', () => {
  const round = [m('claude', 'd'), m('system', 's'), m('gemini', 'e'), m('claude', 'f')];
  assert.equal(seatTurnCount(round, ROSTER), 3);
  assert.equal(seatTurnCount([], ROSTER), 0);
});

test('tedMessage returns the last ted message or null', () => {
  const msgs = [m('ted', 'a', ['claude']), m('claude', 'b'), m('ted', 'c', ['gemini'])];
  assert.deepEqual(tedMessage(msgs).mentions, ['gemini']);
  assert.equal(tedMessage([m('claude', 'b')]), null);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/round.test.js`
Expected: FAIL — `Cannot find module '../src/main/round.js'` (the whole file fails to load).

- [ ] **Step 3: Write the minimal implementation**

Create `src/main/round.js`:

```js
// Pure helpers over a transcript array ({ ts, from, text, mentions }[]).
// A "round" is everything since Ted's most recent message.

export function tedMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].from === 'ted') return messages[i];
  return null;
}

export function currentRound(messages) {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].from === 'ted') return messages.slice(i + 1);
  return messages.slice();
}

export function lastSeatTurn(round, roster) {
  for (let i = round.length - 1; i >= 0; i--) if (roster.includes(round[i].from)) return round[i];
  return null;
}

export function seatTurnCount(round, roster) {
  return round.filter((x) => roster.includes(x.from)).length;
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/round.test.js`
Expected: `ℹ pass 4`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/main/round.js test/round.test.js
git commit -F - <<'MSG'
feat(round): pure helpers for the current round of a transcript

currentRound, lastSeatTurn (skips system lines), seatTurnCount and
tedMessage, over the {ts, from, text, mentions} shape the vendored
transcript writes. Used by the close instruction and the hand-back
wrapper in the following commits.

Leaves: helpers only; no behaviour change yet.

Co-Authored-By: 🤖 Cursor Agent 🤖 <noreply@cursor.com>
MSG
```

---

### Task 2: Preamble text — turn-taking, honesty, plain numbers

**Files:**
- Modify: `src/main/preamble.js` (lines 4–36: `YIELD`, `houseRules`, `desktopPreamble`, `claudeCliPreamble`)
- Test: `test/preamble.test.js` (append)

**Interfaces:**
- Produces: exported constants `TURNS`, `HONESTY`, `PLAIN_NUMBERS`; `YIELD` loses its last clause. `desktopPreamble(seat, roster)` and `claudeCliPreamble(roster)` signatures unchanged.

- [ ] **Step 1: Write the failing tests**

Append to `test/preamble.test.js`:

```js
test('yield line no longer forbids @mentioning a seat', () => {
  for (const p of [desktopPreamble('gemini', ROSTER), claudeCliPreamble(ROSTER)]) {
    assert.match(p, /Ted, we need you to make a decision on <topic>\./);
    assert.doesNotMatch(p, /do not @mention/i);
  }
});

test('both preambles carry the turn-taking rule and the honesty rule', () => {
  for (const p of [desktopPreamble('gemini', ROSTER), claudeCliPreamble(ROSTER)]) {
    assert.match(p, /Turn-taking: when your reply makes a claim or proposal worth a second opinion, end it by @mentioning the other seat/);
    assert.match(p, /@mention them back so they can close/);
    assert.match(p, /When you close an exchange, @mention no one\./);
    assert.match(p, /One exchange per message from Ted: hand off, get the response, close\./);
    assert.match(p, /You see only the text pasted in this chat\./);
    assert.match(p, /Do not say you have read a file, spec, or notebook source/);
  }
});

test('plain-numbers rule is in the desktop (Gemini) preamble only', () => {
  assert.match(desktopPreamble('gemini', ROSTER), /never in math formatting/);
  assert.match(desktopPreamble('gemini', ROSTER), /The relay cannot read rendered math; it arrives as blanks\./);
  assert.doesNotMatch(claudeCliPreamble(ROSTER), /math formatting/);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/preamble.test.js`
Expected: 3 new failures — `do not @mention` still matches; the turn-taking regex does not match; `math formatting` does not match. The 8 existing tests still pass.

- [ ] **Step 3: Write the implementation**

In `src/main/preamble.js`, replace the `YIELD` constant (lines 4–5) with these four constants:

```js
const YIELD =
  'If you need Ted to decide or grant a high-stakes permission, say "Ted, we need you to make a decision on <topic>."';
export const TURNS =
  'Turn-taking: when your reply makes a claim or proposal worth a second opinion, end it by @mentioning the other seat with the specific question you want answered. ' +
  'Address a peer by name when you respond to their point. When you are answering a peer\'s hand-off, reply to their points and @mention them back so they can close. ' +
  'When you close an exchange, @mention no one. One exchange per message from Ted: hand off, get the response, close.';
export const HONESTY =
  'You see only the text pasted in this chat. Do not say you have read a file, spec, or notebook source unless its text appears above or you were given its notebook source title to open.';
export const PLAIN_NUMBERS =
  'Write numbers, thresholds, dates and formulas as plain digits and words in prose or in backticks — never in math formatting. The relay cannot read rendered math; it arrives as blanks.';
```

Then change the two preamble arrays. `desktopPreamble` becomes:

```js
export function desktopPreamble(seat, roster) {
  const peers = roster.filter((s) => s !== seat).map((s) => NAME[s] ?? s).join(', ');
  return [
    `You are ${NAME[seat] ?? seat}, in a group chat with Ted (the human) and fellow agents: ${peers}.`,
    houseRules(roster),
    TURNS,
    YIELD,
    HONESTY,
    PLAIN_NUMBERS,
    'Messages below are labeled "[Speaker]: text". Reply with your message text only — no speaker label, no quoting of the labels.',
  ].join('\n');
}
```

and `claudeCliPreamble` becomes:

```js
export function claudeCliPreamble(roster) {
  const peers = roster.filter((s) => s !== 'claude').map((s) => NAME[s] ?? s).join(', ');
  return [
    `You are Claude, in a group chat with Ted (the human) and fellow agents: ${peers}.`,
    'You run as Claude Code in the workspace with tools: you may read and edit files and run shell commands.',
    'If a tool is denied, it is this Claude Code harness\'s permission gate (headless -p cannot approve Bash). That is not a macOS Screen Recording or Accessibility failure — say so.',
    houseRules(roster),
    TURNS,
    YIELD,
    HONESTY,
    'Messages below are labeled "[Speaker]: text". Reply with your message text only — no speaker label, no quoting of the labels.',
  ].join('\n');
}
```

Leave `houseRules`, `notebookBlock`, `buildDesktopPrompt`, `buildHybridPrompt` untouched in this task.

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/preamble.test.js`
Expected: `ℹ pass 11`, `ℹ fail 0`. In particular `preamble has no terminal, plan-mode, or tool-policy text` must still pass — if it fails, a new line contains a forbidden word; fix the text, do not touch the test.

- [ ] **Step 5: Commit**

```bash
git add src/main/preamble.js test/preamble.test.js
git commit -F - <<'MSG'
feat(preamble): turn-taking, honesty and plain-numbers rules; stop forbidding @mentions

The yield line told seats "do not @mention another seat" — every seat
reply on 2026-09-08 ended as a question to Ted and never handed off.
The clause is gone. Both seats now get the turn-taking rule (hand off
with a specific question, answer a hand-off and @mention back, close
with no mention, one exchange per Ted message) and the honesty rule
(only pasted text counts as read). Gemini alone gets the plain-numbers
rule, because its rendered math reaches the relay as U+FFFC.

Leaves: seats are told how to converse; nothing yet guarantees the
close turn (next two commits). New sessions only — the preamble is
sent on a session's first turn.

Co-Authored-By: 🤖 Cursor Agent 🤖 <noreply@cursor.com>
MSG
```

---

### Task 3: Close instruction in the prompt builders

**Files:**
- Modify: `src/main/preamble.js` (add `CLOSE_LINE`, `closeLine`; edit `buildDesktopPrompt` and `buildHybridPrompt`)
- Test: `test/preamble.test.js` (append)

**Interfaces:**
- Consumes: `currentRound`, `lastSeatTurn` from `src/main/round.js` (Task 1).
- Produces:
  - `export const CLOSE_LINE = '[System]: Close the exchange for Ted — integrate the reply above briefly; @mention no one.'`
  - `closeLine({ messages, seat, roster, budgetNotice })` → `CLOSE_LINE` or `null`.
  - Both builders append `'\n\n' + CLOSE_LINE` after the delta, before the notebook block, when `closeLine` returns it.

- [ ] **Step 1: Write the failing tests**

Append to `test/preamble.test.js`. Also add `CLOSE_LINE, closeLine` to the existing import from `../src/main/preamble.js` on line 3.

```js
const XMSGS = [
  { ts: 'x1', from: 'ted', text: '@claude is the math sound?', mentions: ['claude'] },
  { ts: 'x2', from: 'claude', text: 'Mostly. @gemini does the prior hold?', mentions: ['gemini'] },
  { ts: 'x3', from: 'gemini', text: 'It holds, Claude.\n\n— over to @claude', mentions: ['claude'] },
];

test('close line: present when this seat already spoke this round and the latest message is a peer\'s', () => {
  assert.equal(closeLine({ messages: XMSGS, seat: 'claude', roster: ROSTER, budgetNotice: false }), CLOSE_LINE);
  const p = buildHybridPrompt({ messages: XMSGS, cursor: 2, seat: 'claude', roster: ROSTER, firstTurn: false, budgetNotice: false });
  assert.equal(p, `[Gemini]: It holds, Claude.\n  \n  — over to @claude\n\n${CLOSE_LINE}`);
  const d = buildDesktopPrompt({ messages: XMSGS, cursor: 2, seat: 'claude', roster: ROSTER, firstTurn: false, budgetNotice: false });
  assert.match(d, new RegExp(CLOSE_LINE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));
});

test('close line: absent on a first turn, absent when the budget notice is set, absent for the peer that has not spoken', () => {
  // Gemini's first turn of this round: Claude spoke, Gemini did not.
  assert.equal(closeLine({ messages: XMSGS.slice(0, 2), seat: 'gemini', roster: ROSTER, budgetNotice: false }), null);
  // Claude's first turn of a round.
  assert.equal(closeLine({ messages: XMSGS.slice(0, 1), seat: 'claude', roster: ROSTER, budgetNotice: false }), null);
  // Budget notice wins.
  assert.equal(closeLine({ messages: XMSGS, seat: 'claude', roster: ROSTER, budgetNotice: true }), null);
  const p = buildHybridPrompt({ messages: XMSGS, cursor: 2, seat: 'claude', roster: ROSTER, firstTurn: false, budgetNotice: true });
  assert.doesNotMatch(p, /Close the exchange/);
  assert.match(p, /\[System\]: Turn budget reached/);
});

test('close line: absent for Gemini in an @all round (Claude spoke first, Gemini has not)', () => {
  const all = [
    { ts: 'a1', from: 'ted', text: '@all thoughts?', mentions: ['claude', 'gemini'] },
    { ts: 'a2', from: 'claude', text: 'Mine.', mentions: [] },
  ];
  assert.equal(closeLine({ messages: all, seat: 'gemini', roster: ROSTER, budgetNotice: false }), null);
});

test('close line: notebook block comes after the close line', () => {
  const p = buildHybridPrompt({ messages: XMSGS, cursor: 2, seat: 'claude', roster: ROSTER, firstTurn: false, budgetNotice: false, notebookContext: 'Fact [1]' });
  const i = p.indexOf(CLOSE_LINE);
  const j = p.indexOf('[Notebook');
  assert.ok(i > -1 && j > i, `close at ${i}, notebook at ${j}`);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/preamble.test.js`
Expected: the file fails to load with `does not provide an export named 'CLOSE_LINE'`. (That counts as the failing run; the assertions are exercised in Step 4.)

- [ ] **Step 3: Write the implementation**

In `src/main/preamble.js`, add the import at the top (after the existing import line):

```js
import { currentRound, lastSeatTurn } from './round.js';
```

Add, after the `PLAIN_NUMBERS` constant:

```js
export const CLOSE_LINE = '[System]: Close the exchange for Ted — integrate the reply above briefly; @mention no one.';

// This seat already spoke this round and a peer answered: tell it to close.
// The engine's budget notice already says "synthesize, no mentions", so the
// two never appear together.
export function closeLine({ messages, seat, roster, budgetNotice }) {
  if (budgetNotice) return null;
  const round = currentRound(messages);
  if (!round.some((m) => m.from === seat)) return null;
  const last = lastSeatTurn(round, roster);
  if (!last || last.from === seat) return null;
  return CLOSE_LINE;
}
```

Replace `buildDesktopPrompt` and `buildHybridPrompt` with:

```js
export function buildDesktopPrompt({ messages, cursor, seat, roster, firstTurn, budgetNotice, notebookContext }) {
  const parts = [];
  if (firstTurn) parts.push(desktopPreamble(seat, roster), '');
  parts.push(renderLines(messages.slice(cursor)));
  const close = closeLine({ messages, seat, roster, budgetNotice });
  if (close) parts.push('', close);
  if (notebookContext) parts.push('', notebookBlock(notebookContext));
  if (budgetNotice) parts.push('', `[System]: ${BUDGET_NOTICE}`);
  return parts.join('\n');
}

export function buildHybridPrompt({ messages, cursor, seat, roster, firstTurn, budgetNotice, notebookContext }) {
  const parts = [];
  if (firstTurn) {
    parts.push(seat === 'claude' ? claudeCliPreamble(roster) : desktopPreamble(seat, roster), '');
  }
  parts.push(renderLines(messages.slice(cursor)));
  const close = closeLine({ messages, seat, roster, budgetNotice });
  if (close) parts.push('', close);
  if (notebookContext) parts.push('', notebookBlock(notebookContext));
  if (budgetNotice) parts.push('', `[System]: ${BUDGET_NOTICE}`);
  return parts.join('\n');
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/preamble.test.js`
Expected: `ℹ pass 15`, `ℹ fail 0`. The pre-existing tests `first turn: preamble + full transcript; later turns: delta only` and `budget notice is appended as a [System] line` must still pass — their rounds are empty (Ted's message is last), so no close line appears.

- [ ] **Step 5: Commit**

```bash
git add src/main/preamble.js test/preamble.test.js
git commit -F - <<'MSG'
feat(preamble): close instruction when a seat takes its second turn after a peer replied

closeLine() looks at the current round (messages since Ted's last):
if this seat already spoke and the latest seat message is a peer's,
both prompt builders append "[System]: Close the exchange for Ted —
integrate the reply above briefly; @mention no one." Never on a first
turn, never alongside the engine's budget notice, never for the peer
that has not spoken yet — so @all rounds get no close for Gemini.

Leaves: the closing turn, when it happens, is told what to do. What
makes it happen is the hand-back wrapper (next commit).

Co-Authored-By: 🤖 Cursor Agent 🤖 <noreply@cursor.com>
MSG
```

---

### Task 4: Hand-back wrapper

**Files:**
- Create: `src/main/handback-adapter.js`
- Test: `test/handback-adapter.test.js`

**Interfaces:**
- Consumes: `readTranscript`, `appendMessage` from `vendor/agentsunite/lib/transcript.js`; `parseMentions` from `vendor/agentsunite/lib/mentions.js`; `currentRound`, `lastSeatTurn`, `seatTurnCount`, `tedMessage` from `src/main/round.js`.
- Produces:
  - `HAND_BACK(seat)` → `` `— over to @${seat}` ``
  - `withHandBack(adapter, dir, { turnCap, roster })` → `{ seat, invoke(args) }` with the same result shape as `adapter.invoke`.
  - `withHandBacks(adapters, dir, { turnCap, roster })` → same object with `adapters.gemini` wrapped if present; other seats untouched.

- [ ] **Step 1: Write the failing test**

Create `test/handback-adapter.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { withHandBack, withHandBacks, HAND_BACK } from '../src/main/handback-adapter.js';
import { withErrorLog } from '../src/main/log-adapter.js';
import { appendMessage } from '../vendor/agentsunite/lib/transcript.js';

const ROSTER = ['claude', 'gemini'];
const OPTS = { turnCap: 4, roster: ROSTER };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'unite-handback-'));
const say = (dir, from, text, mentions = []) => appendMessage(dir, { ts: new Date().toISOString(), from, text, mentions });

function gemini(replyText, extra = {}) {
  const calls = [];
  return {
    calls,
    adapter: {
      seat: 'gemini',
      async invoke(args) { calls.push(args); return { ok: true, replyText, sessionRef: 'desktop:gemini', ...extra }; },
    },
  };
}

test('appends the hand-back when Gemini answered a Claude hand-off and named nobody', async () => {
  const dir = tmp();
  say(dir, 'ted', '@claude is the math sound?', ['claude']);
  say(dir, 'claude', 'Mostly. @gemini does the prior hold?', ['gemini']);
  const g = gemini('It holds, Claude.  \n');
  const res = await withHandBack(g.adapter, dir, OPTS).invoke({ prompt: 'p', sessionRef: null });
  assert.equal(res.ok, true);
  assert.equal(res.replyText, 'It holds, Claude.\n\n— over to @claude');
  assert.equal(res.sessionRef, 'desktop:gemini');
  assert.equal(HAND_BACK('claude'), '— over to @claude');
});

test('untouched when Ted addressed Gemini directly', async () => {
  const dir = tmp();
  say(dir, 'ted', '@gemini what is 2+2?', ['gemini']);
  const res = await withHandBack(gemini('4.').adapter, dir, OPTS).invoke({ prompt: 'p', sessionRef: null });
  assert.equal(res.replyText, '4.');
});

test('untouched in an @all round (both seats were addressed)', async () => {
  const dir = tmp();
  say(dir, 'ted', '@all thoughts?', ['claude', 'gemini']);
  say(dir, 'claude', 'Mine.', []);
  const res = await withHandBack(gemini('And mine.').adapter, dir, OPTS).invoke({ prompt: 'p', sessionRef: null });
  assert.equal(res.replyText, 'And mine.');
});

test('untouched when the reply already names a seat (@claude or @all)', async () => {
  const dir = tmp();
  say(dir, 'ted', '@claude go', ['claude']);
  say(dir, 'claude', 'ping @gemini', ['gemini']);
  for (const text of ['pong @claude', 'pong @all', 'Pong, @Claude.']) {
    const res = await withHandBack(gemini(text).adapter, dir, OPTS).invoke({ prompt: 'p', sessionRef: null });
    assert.equal(res.replyText, text);
  }
});

test('untouched on the final turn under the cap', async () => {
  const dir = tmp();
  say(dir, 'ted', '@claude go', ['claude']);
  say(dir, 'claude', 'ping @gemini', ['gemini']);
  // turnCap 2: Claude was turn 1, this Gemini turn is 2 = final.
  const res = await withHandBack(gemini('pong').adapter, dir, { turnCap: 2, roster: ROSTER }).invoke({ prompt: 'p', sessionRef: null });
  assert.equal(res.replyText, 'pong');
});

test('still appended when a system line sits between the hand-off and the reply', async () => {
  const dir = tmp();
  say(dir, 'ted', '@claude go', ['claude']);
  say(dir, 'claude', 'ping @gemini', ['gemini']);
  say(dir, 'system', 'Claude Code harness denied a tool: Bash', []);
  const res = await withHandBack(gemini('pong').adapter, dir, OPTS).invoke({ prompt: 'p', sessionRef: null });
  assert.equal(res.replyText, 'pong\n\n— over to @claude');
});

test('planning-mode plain text (no mentions from Ted) still counts as a hand-off', async () => {
  const dir = tmp();
  say(dir, 'ted', 'what do you both think?', []);
  say(dir, 'claude', 'I think X. @gemini?', ['gemini']);
  const res = await withHandBack(gemini('Y.').adapter, dir, OPTS).invoke({ prompt: 'p', sessionRef: null });
  assert.equal(res.replyText, 'Y.\n\n— over to @claude');
});

test('untouched when Gemini is the first seat of the round (nobody to hand back to)', async () => {
  const dir = tmp();
  say(dir, 'ted', 'planner is gemini here', []);
  const res = await withHandBack(gemini('First.').adapter, dir, OPTS).invoke({ prompt: 'p', sessionRef: null });
  assert.equal(res.replyText, 'First.');
});

test('a failed result passes through identically', async () => {
  const dir = tmp();
  say(dir, 'ted', '@claude go', ['claude']);
  say(dir, 'claude', 'ping @gemini', ['gemini']);
  const failed = { seat: 'gemini', async invoke() { return { ok: false, error: 'boom', sessionRef: 'desktop:gemini' }; } };
  const res = await withHandBack(failed, dir, OPTS).invoke({ prompt: 'p', sessionRef: null });
  assert.deepEqual(res, { ok: false, error: 'boom', sessionRef: 'desktop:gemini' });
});

test('withHandBacks wraps only the gemini seat and tolerates its absence', async () => {
  const dir = tmp();
  say(dir, 'ted', '@claude go', ['claude']);
  say(dir, 'claude', 'ping @gemini', ['gemini']);
  const claude = { seat: 'claude', async invoke() { return { ok: true, replyText: 'c', sessionRef: 's' }; } };
  const wrapped = withHandBacks({ claude, gemini: gemini('pong').adapter }, dir, OPTS);
  assert.equal(wrapped.claude, claude);
  assert.equal((await wrapped.gemini.invoke({ prompt: 'p', sessionRef: null })).replyText, 'pong\n\n— over to @claude');
  assert.deepEqual(Object.keys(withHandBacks({ claude }, dir, OPTS)), ['claude']);
});

test('composed under withErrorLog, the trace records the raw reply length', async () => {
  const dir = tmp();
  say(dir, 'ted', '@claude go', ['claude']);
  say(dir, 'claude', 'ping @gemini', ['gemini']);
  const g = gemini('pong', { diagnostics: { promptChars: 1, replyChars: 4, polls: 1, trace: [] } });
  const res = await withErrorLog(withHandBack(g.adapter, dir, OPTS), dir).invoke({ prompt: 'p', sessionRef: null });
  assert.equal(res.replyText, 'pong\n\n— over to @claude');
  assert.equal(res.diagnostics.replyChars, 4);
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `node --test test/handback-adapter.test.js`
Expected: FAIL — `Cannot find module '../src/main/handback-adapter.js'`.

- [ ] **Step 3: Write the minimal implementation**

Create `src/main/handback-adapter.js`:

```js
import { readTranscript } from '../../vendor/agentsunite/lib/transcript.js';
import { parseMentions } from '../../vendor/agentsunite/lib/mentions.js';
import { currentRound, lastSeatTurn, seatTurnCount, tedMessage } from './round.js';

export const HAND_BACK = (seat) => `— over to @${seat}`;

// The engine queues a seat only when a reply @mentions it (engine.js:100).
// Gemini's app persona answers Ted and names nobody, so a hand-off from
// Claude would end the round without Claude's close. When Gemini is
// speaking because a peer handed off — not because Ted addressed it — and
// its reply names no seat, append a visible hand-back so the peer closes.
export function withHandBack(adapter, dir, { turnCap, roster = ['claude', 'gemini'] }) {
  return {
    seat: adapter.seat,
    async invoke(args) {
      const res = await adapter.invoke(args);
      if (!res.ok) return res;
      const messages = readTranscript(dir);
      const ted = tedMessage(messages);
      if (ted && ted.mentions.includes(adapter.seat)) return res;           // Ted addressed this seat
      const round = currentRound(messages);
      const prev = lastSeatTurn(round, roster);
      if (!prev || prev.from === adapter.seat) return res;                  // nobody handed off
      if (parseMentions(res.replyText, roster).length > 0) return res;      // it named someone itself
      if (seatTurnCount(round, roster) + 1 >= turnCap) return res;           // engine would suppress it
      return { ...res, replyText: `${res.replyText.trimEnd()}\n\n${HAND_BACK(prev.from)}` };
    },
  };
}

export function withHandBacks(adapters, dir, opts) {
  if (!adapters.gemini) return adapters;
  return { ...adapters, gemini: withHandBack(adapters.gemini, dir, opts) };
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/handback-adapter.test.js`
Expected: `ℹ pass 11`, `ℹ fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/main/handback-adapter.js test/handback-adapter.test.js
git commit -F - <<'MSG'
feat(handback): append "— over to @claude" when Gemini answers a hand-off and names nobody

withHandBack wraps the Gemini seat (same shape as withErrorLog). After
a successful reply it reads the transcript: if Ted did not address
Gemini this round, a peer's turn precedes this one, the reply mentions
no seat, and this is not the final turn under the cap, it appends a
visible hand-back line so the engine queues the peer's close. Failed
results and every other case pass through untouched. withHandBacks
wraps only the gemini seat.

Leaves: the close turn is guaranteed for Claude-addressed rounds once
the runners compose the wrapper (two commits on).

Co-Authored-By: 🤖 Cursor Agent 🤖 <noreply@cursor.com>
MSG
```

---

### Task 5: Cap default 4

**Files:**
- Modify: `src/main/settings.js` (line 42 and a new export)
- Modify: `test/settings.test.js` (lines 28 and 32: expected `turnCap: 8` → `4`)
- Create: `src/cli/desktop-config.js`
- Test: `test/desktop-config.test.js`
- Modify: `bin/unite-desktop.js` (line 5 import, line 35)
- Modify: `test/unite-desktop-bin.test.js`

**Interfaces:**
- Produces: `export const DESKTOP_TURN_CAP = 4` in `settings.js`; `readRoomConfig(root).turnCap` defaults to 4. `desktopConfig(root)` → `{ ...loadConfig(root), roster: ['claude', 'gemini'], turnCap: readRoomConfig(root).turnCap }`.

- [ ] **Step 1: Write the failing tests**

Edit `test/settings.test.js`: on line 28 and line 32 change `turnCap: 8` to `turnCap: 4` (both `assert.deepEqual(readRoomConfig(...), { turnCap: 4, timeoutMs: 300000, notebookId: null })`). Leave every other assertion alone.

Create `test/desktop-config.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { desktopConfig } from '../src/cli/desktop-config.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'unite-dcfg-'));

test('desktopConfig: cap defaults to 4 with no room config, roster fixed to the two desktop seats', () => {
  const root = tmp();
  const c = desktopConfig(root);
  assert.equal(c.turnCap, 4);
  assert.deepEqual(c.roster, ['claude', 'gemini']);
  assert.equal(c.timeoutMs, 300000);
});

test('desktopConfig: a room config still overrides the cap; out-of-range values fall back to 4', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.unite'), { recursive: true });
  fs.writeFileSync(path.join(root, '.unite', 'config.json'), JSON.stringify({ turnCap: 8, timeoutMs: 60000 }));
  assert.equal(desktopConfig(root).turnCap, 8);
  assert.equal(desktopConfig(root).timeoutMs, 60000);
  fs.writeFileSync(path.join(root, '.unite', 'config.json'), JSON.stringify({ turnCap: 0 }));
  assert.equal(desktopConfig(root).turnCap, 4);
});
```

Append to `test/unite-desktop-bin.test.js`, inside the existing test after `assert.match(src, /syncTranscriptMarkdown/);`:

```js
  assert.match(src, /desktopConfig\(root\)/);
  assert.doesNotMatch(src, /\.\.\.loadConfig\(root\)/);
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/settings.test.js test/desktop-config.test.js test/unite-desktop-bin.test.js`
Expected: `settings` — `readRoomConfig: CLI defaults …` fails (`8` vs `4`); `desktop-config` fails to load (module missing); `unite-desktop-bin` fails on `desktopConfig\(root\)`.

- [ ] **Step 3: Write the implementation**

In `src/main/settings.js`, add after line 11 (`const LIMITS = …`):

```js
// The desktop's own default. The vendored engine defaults to 8; a short
// exchange (spec 2026-09-09) is three turns normal, four at most.
export const DESKTOP_TURN_CAP = 4;
```

and change line 42 from `DEFAULT_CONFIG.turnCap` to `DESKTOP_TURN_CAP`:

```js
    turnCap: inRange(file.turnCap, LIMITS.turnCap) ? file.turnCap : DESKTOP_TURN_CAP,
```

Create `src/cli/desktop-config.js`:

```js
import { loadConfig } from '../../vendor/agentsunite/lib/config.js';
import { readRoomConfig } from '../main/settings.js';

// The terminal runner's config: the vendored loader (room config over engine
// defaults) with the desktop's fixed two-seat roster and the desktop's own
// turn-cap default, so the CLI runner and the GUI agree on the cap.
export function desktopConfig(root) {
  return { ...loadConfig(root), roster: ['claude', 'gemini'], turnCap: readRoomConfig(root).turnCap };
}
```

In `bin/unite-desktop.js`: replace line 5 `import { loadConfig } from '../vendor/agentsunite/lib/config.js';` with

```js
import { desktopConfig } from '../src/cli/desktop-config.js';
```

and replace line 35 `const config = { ...loadConfig(root), roster: ['claude', 'gemini'] };` with

```js
const config = desktopConfig(root);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/settings.test.js test/desktop-config.test.js test/unite-desktop-bin.test.js`
Expected: all pass. Then `npm test 2>&1 | grep -E "^ℹ (pass|fail)"` → `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/main/settings.js src/cli/desktop-config.js bin/unite-desktop.js test/settings.test.js test/desktop-config.test.js test/unite-desktop-bin.test.js
git commit -F - <<'MSG'
feat(config): desktop turn cap defaults to 4 in both runners

DESKTOP_TURN_CAP = 4 replaces the vendored engine's 8 as the fallback
in readRoomConfig, which the GUI already reads; the terminal runner
now builds its config through desktopConfig(root), which applies the
same fallback. A room's .unite/config.json still overrides either way.

Leaves: an exchange is three turns normal, four at most, on both
runners.

Co-Authored-By: 🤖 Cursor Agent 🤖 <noreply@cursor.com>
MSG
```

---

### Task 6: Compose the wrapper in both runners

**Files:**
- Modify: `bin/unite-desktop.js` (line 16 import block, line 131)
- Modify: `src/main/relay.js` (line 5 import, line 12)
- Modify: `test/unite-desktop-bin.test.js`, `test/relay.test.js` (append one test)

**Interfaces:**
- Consumes: `withHandBacks` (Task 4), `CLOSE_LINE` (Task 3).

- [ ] **Step 1: Write the failing tests**

Append to the existing test in `test/unite-desktop-bin.test.js`:

```js
  assert.match(src, /withErrorLogs\(withHandBacks\(adapters, dir, config\), dir\)/);
```

Append to `test/relay.test.js` (add `CLOSE_LINE` to the imports: `import { CLOSE_LINE } from '../src/main/preamble.js';`):

```js
test('hand-off exchange: Claude asks Gemini, Gemini answers without a mention, Claude closes', async () => {
  const claude = fakeAdapter('claude', [
    { ok: true, replyText: 'Mostly sound. @gemini does the prior hold?', sessionRef: 'desktop:claude' },
    { ok: true, replyText: 'Closing: it holds; Ted, nothing to decide.', sessionRef: 'desktop:claude' },
  ]);
  const gemini = fakeAdapter('gemini', [{ ok: true, replyText: 'It holds, Claude.', sessionRef: 'desktop:gemini' }]);
  const { dir, events, relay } = setup({ claude, gemini }, { ...CONFIG, turnCap: 4 });
  await relay.submit('@claude is the math sound?');
  const seats = readTranscript(dir).filter((m) => ['claude', 'gemini'].includes(m.from));
  assert.deepEqual(seats.map((m) => m.from), ['claude', 'gemini', 'claude']);
  assert.equal(seats[1].text, 'It holds, Claude.\n\n— over to @claude');
  assert.deepEqual(seats[1].mentions, ['claude']);
  assert.equal(claude.calls.length, 2);
  assert.match(claude.calls[1].prompt, /Close the exchange for Ted/);
  assert.ok(claude.calls[1].prompt.endsWith(CLOSE_LINE));
  assert.deepEqual(events.filter((e) => e.type === 'turn:start').map((e) => [e.seat, e.pos]), [['claude', 1], ['gemini', 2], ['claude', 3]]);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/unite-desktop-bin.test.js test/relay.test.js`
Expected: the bin test fails on the `withHandBacks` regex; the new relay test fails with `['claude', 'gemini']` vs `['claude', 'gemini', 'claude']` (no third turn).

- [ ] **Step 3: Write the implementation**

`bin/unite-desktop.js`: after line 16 (`import { withErrorLogs } from '../src/main/log-adapter.js';`) add

```js
import { withHandBacks } from '../src/main/handback-adapter.js';
```

and replace line 131 `const loggedAdapters = withErrorLogs(adapters, dir);` with

```js
const loggedAdapters = withErrorLogs(withHandBacks(adapters, dir, config), dir);
```

`src/main/relay.js`: after line 5 (`import { withErrorLogs } from './log-adapter.js';`) add

```js
import { withHandBacks } from './handback-adapter.js';
```

and replace line 12 `adapters = withErrorLogs(adapters, dir, now);` with

```js
  adapters = withErrorLogs(withHandBacks(adapters, dir, config), dir, now);
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/unite-desktop-bin.test.js test/relay.test.js`
Expected: all pass, including every pre-existing relay test (the `ping @gemini` / `pong @claude` test at cap 2 is unaffected: Gemini already names Claude, and it is the final turn).
Then `npm test 2>&1 | grep -E "^ℹ (pass|fail)"` → `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add bin/unite-desktop.js src/main/relay.js test/unite-desktop-bin.test.js test/relay.test.js
git commit -F - <<'MSG'
feat(runners): wrap the Gemini seat with the hand-back in the CLI runner and the GUI relay

withErrorLogs(withHandBacks(adapters, dir, config), dir): the error
log stays outermost so errors.log/traces.log record the raw adapter
result, while the engine sees the hand-back and queues the close.
Relay test proves the three-turn shape end to end through the real
vendored runRound: Claude asks, Gemini answers naming nobody, Claude
closes with the close instruction in its prompt.

Leaves: the approved exchange shape is live on both runners; vendor
untouched.

Co-Authored-By: 🤖 Cursor Agent 🤖 <noreply@cursor.com>
MSG
```

---

### Task 7: Acceptance — the three round shapes through the real engine

**Files:**
- Test: `test/seat-exchange.test.js` (new). No production code.

**Interfaces:**
- Consumes: `runRound`, `RoundControl` from `vendor/agentsunite/lib/engine.js`; `buildHybridPrompt`, `CLOSE_LINE` from `src/main/preamble.js`; `withHandBacks` from `src/main/handback-adapter.js`; `readTranscript` from `vendor/agentsunite/lib/transcript.js`.

- [ ] **Step 1: Write the test (it should pass immediately — this is the acceptance proof against the spec's §3 table, not a red-green cycle)**

Create `test/seat-exchange.test.js`:

```js
import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runRound, RoundControl } from '../vendor/agentsunite/lib/engine.js';
import { readTranscript } from '../vendor/agentsunite/lib/transcript.js';
import { buildHybridPrompt, CLOSE_LINE } from '../src/main/preamble.js';
import { withHandBacks } from '../src/main/handback-adapter.js';

const CONFIG = { roster: ['claude', 'gemini'], turnCap: 4, planner: 'claude' };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'unite-exchange-'));
const ui = { startStatus: () => ({ update() {}, stop() {} }), printReply() {}, printSystem() {} };

function seat(name, replies) {
  const calls = [];
  return {
    calls,
    adapter: {
      seat: name,
      async invoke(args) { calls.push(args); return { ok: true, replyText: replies.shift() ?? `${name} ok`, sessionRef: `s:${name}` }; },
    },
  };
}

async function round(dir, adapters, humanText, extra = {}) {
  await runRound({ dir, adapters: withHandBacks(adapters, dir, CONFIG), config: CONFIG, ui, control: new RoundControl(), buildPrompt: buildHybridPrompt, humanText, ...extra });
  return readTranscript(dir).filter((m) => CONFIG.roster.includes(m.from));
}

test('@claude with a hand-off: three turns, Claude closes under the close instruction', async () => {
  const dir = tmp();
  const claude = seat('claude', ['Mostly. @gemini does the prior hold?', 'Closing for Ted.']);
  const gemini = seat('gemini', ['It holds, Claude.']);
  const turns = await round(dir, { claude: claude.adapter, gemini: gemini.adapter }, '@claude is the math sound?');
  assert.deepEqual(turns.map((m) => m.from), ['claude', 'gemini', 'claude']);
  assert.equal(turns[1].text, 'It holds, Claude.\n\n— over to @claude');
  assert.ok(claude.calls[1].prompt.endsWith(CLOSE_LINE));
  assert.deepEqual(turns[2].mentions, []);
});

test('@claude without a hand-off: one turn', async () => {
  const dir = tmp();
  const claude = seat('claude', ['Done: 42.']);
  const gemini = seat('gemini', []);
  const turns = await round(dir, { claude: claude.adapter, gemini: gemini.adapter }, '@claude what is the answer?');
  assert.deepEqual(turns.map((m) => m.from), ['claude']);
  assert.equal(gemini.calls.length, 0);
});

test('@gemini: one turn, no hand-back', async () => {
  const dir = tmp();
  const claude = seat('claude', []);
  const gemini = seat('gemini', ['Four.']);
  const turns = await round(dir, { claude: claude.adapter, gemini: gemini.adapter }, '@gemini what is 2+2?');
  assert.deepEqual(turns.map((m) => m.from), ['gemini']);
  assert.equal(turns[0].text, 'Four.');
  assert.equal(claude.calls.length, 0);
});

test('@all: two turns, no synthetic close', async () => {
  const dir = tmp();
  const claude = seat('claude', ['Mine.']);
  const gemini = seat('gemini', ['And mine.']);
  const turns = await round(dir, { claude: claude.adapter, gemini: gemini.adapter }, '@all thoughts?');
  assert.deepEqual(turns.map((m) => m.from), ['claude', 'gemini']);
  assert.equal(turns[1].text, 'And mine.');
  assert.equal(claude.calls.length, 1);
});

test('planning mode: plain text goes to Claude, and the hand-off still closes', async () => {
  const dir = tmp();
  const claude = seat('claude', ['Proposal. @gemini review?', 'Closing.']);
  const gemini = seat('gemini', ['Looks right, Claude.']);
  const turns = await round(dir, { claude: claude.adapter, gemini: gemini.adapter }, 'design the thing', { planStart: true, planner: 'claude' });
  assert.deepEqual(turns.map((m) => m.from), ['claude', 'gemini', 'claude']);
  assert.equal(turns[1].text, 'Looks right, Claude.\n\n— over to @claude');
});

test('cap 4: a second hand-off runs a fourth turn and stops there without a hand-back line', async () => {
  const dir = tmp();
  const claude = seat('claude', ['Q1 @gemini?', 'Follow-up @gemini?']);
  const gemini = seat('gemini', ['A1.', 'A2.']);
  const turns = await round(dir, { claude: claude.adapter, gemini: gemini.adapter }, '@claude go');
  assert.deepEqual(turns.map((m) => m.from), ['claude', 'gemini', 'claude', 'gemini']);
  assert.equal(turns[3].text, 'A2.');           // final turn: no hand-back appended
  assert.equal(claude.calls.length, 2);
});
```

- [ ] **Step 2: Run it**

Run: `node --test test/seat-exchange.test.js`
Expected: `ℹ pass 6`, `ℹ fail 0`. If any case fails, the defect is in Tasks 3–6, not in this test — fix there and re-run.

- [ ] **Step 3: Full suite and vendor check**

Run: `npm test 2>&1 | grep -E "^ℹ (tests|pass|fail)"; git status --short vendor/`
Expected: `tests 187`, `pass 187`, `fail 0` (baseline 156, plus 4 + 3 + 4 + 11 + 2 + 1 + 6 new tests from Tasks 1–7), and **no output** from the vendor status line. If the count differs, a task added or dropped a test it should not have — find which before committing.

- [ ] **Step 4: Commit**

```bash
git add test/seat-exchange.test.js
git commit -F - <<'MSG'
test(seat-exchange): acceptance for the three round shapes through the real engine

@claude with a hand-off → claude, gemini, claude (close instruction in
the third prompt); @claude without → one turn; @gemini → one turn;
@all → two, no synthetic close; planning-mode plain text → same as
@claude; cap 4 → a second hand-off runs turn four and stops, no
hand-back on the final turn. Vendor untouched.

Leaves: spec §3 proven against the vendored runRound; ready for Ted's
review, merge into feat/relay-failure-diagnostics, relaunch, new chat.

Co-Authored-By: 🤖 Cursor Agent 🤖 <noreply@cursor.com>
MSG
```

---

### Task 8: SPRINT.md status line and handoff

**Files:**
- Modify: `SPRINT.md` (the `## Current phase` paragraph and the `## Next` paragraph)

- [ ] **Step 1: Edit `SPRINT.md`**

Replace the `## Current phase` paragraph with:

```markdown
## Current phase
Phase 7a complete on `feat/seat-exchange` (awaiting Ted's review and merge into `feat/relay-failure-diagnostics`): seats converse in a short bounded exchange — addressed seat answers and may hand off, peer responds once, addressed seat closes; cap 4; `@all` stops after both. Spec `docs/superpowers/specs/2026-09-09-seat-exchange-design.md`, plan `docs/superpowers/plans/2026-09-09-seat-exchange.md`. Not yet validated live.
```

Replace the `## Next` paragraph with:

```markdown
## Next
Ted: review `feat/seat-exchange`, fast-forward it into `feat/relay-failure-diagnostics`, `/quit`, relaunch `AgentsUniteD`, **start a new chat** (the preamble is delivered on a session's first turn only), then run the three live checks from the spec §6 with the monitor armed: a substantive `@claude` question → three turns; a factual `@gemini` question → one; `@all` → two. Then Phase 6 (poll cost) brainstorm.
```

- [ ] **Step 2: Commit**

```bash
git add SPRINT.md
git commit -F - <<'MSG'
docs(sprint): Phase 7a seat exchange implemented, pending review, merge and live check

Leaves: branch feat/seat-exchange green and handed to Ted; relaunch and
a new chat required to receive the new preamble.

Co-Authored-By: 🤖 Cursor Agent 🤖 <noreply@cursor.com>
MSG
```

- [ ] **Step 3: Stop here**

Report: the branch name, the final `npm test` counts, and `git log --oneline feat/relay-failure-diagnostics..HEAD`. Do not merge, do not push, do not relaunch the app.
