# Seat exchange — a short, bounded conversation between the seats

Date: 2026-09-09 · Repo: `AgentsUniteDesktop` · Brainstormed with Ted 2026-09-09 (approach 2 of 3).
Authors: Ted (decisions), Claude (design). Status: approved in sections; open markers: none.

## 0. Purpose

Today a round is one seat answering Ted. Every Gemini reply on 2026-09-08 carried
`mentions: []`; Claude @mentioned Gemini twice in ~30 turns. The seats talk *to Ted*
about each other, so a brainstorm needs Ted to relay ("what do you think?") after every
reply. Ted's requirement: make it feel like the CLI version — a conversation, seats
addressing each other — while staying bounded, because a Gemini turn costs 1–3 minutes
until the poll-cost work lands.

Two facts from the code decide the shape (`vendor/agentsunite/lib/engine.js`):

- The queue advances only on an `@mention` in a reply (line 100). A reply that names
  nobody ends the round.
- `turnCap` is 8 in both the CLI and the desktop (same vendored engine). The room already
  allows an eight-turn exchange; the seats use one turn because nobody @mentions.

So this is a prompting problem plus one unreliable link — Gemini emitting a mention —
not a plumbing problem. The desktop's own preamble line *"do not @mention another seat"*
(`src/main/preamble.js`, `YIELD`) actively steers seats away from each other.

**Constraint stated by Ted:** reliability over speed. The exchange must reliably take the
approved shape; it must never run long.

## 1. Decisions (Ted, 2026-09-09)

| Decision | Choice |
|---|---|
| Exchange shape | **Short exchange.** Addressed seat answers and may hand off; the other seat responds once; the addressed seat closes; back to Ted. Three turns normal, **cap 4**. |
| Who closes | The seat Ted addressed (Claude, in planning mode). |
| `@all` rounds | Stop after both seats have spoken. No synthetic close. |
| Mechanism | Approach 2: preamble rewrite + close instruction + a hand-back wrapper on the Gemini seat + cap default 4. Vendor untouched. |
| Preamble extras | Include both: Gemini writes numbers/formulas as plain text (the U+FFFC defect); both seats never claim to have read a file they were not given. |
| Rollout | Option (a): start a new chat. Seats receive the preamble only on a session's first turn; no notice is injected into existing chats. |

Rejected: prompt-only (fails the reliability constraint — Gemini has never emitted a
mention); an engine-level `closingTurn` policy upstream (crosses the no-vendor-changes
guardrail, changes the CLI Ted already likes; revisit if the wrapper proves too clever).

## 2. Architecture

All changes are desktop code. The two seams the engine already exposes are enough:

- `runRound({ buildPrompt })` — the prompt builder is injected (engine.js:35). The desktop
  owns every word a seat sees.
- Adapters are plain `{ seat, invoke(args) }` objects — decorators already wrap them
  (`withErrorLog`, `src/main/log-adapter.js`).

```
Ted message ──► engine queue ──► seat adapter ──► reply ──► parseMentions ──► queue …
                    ▲                 │
                    │            [withHandBack]  appends "— over to @claude" when Gemini
                    │                 │          answered a hand-off and named nobody
                    │            [withErrorLog]  unchanged
                    │
        buildHybridPrompt ── preamble (first turn) + delta + [close line when this seat
                             already spoke this round and the latest message is a peer's]
```

Components:

| # | Component | File | Change |
|---|---|---|---|
| 1 | Preamble | `src/main/preamble.js` | rewrite `YIELD`; add turn-taking rules (both seats), numbers rule (Gemini), honesty rule (both) |
| 2 | Close instruction | `src/main/preamble.js` `buildHybridPrompt` (and `buildDesktopPrompt` for the GUI) | append one `[System]` line under a round-position condition |
| 3 | Hand-back wrapper | new `src/main/handback-adapter.js` | `withHandBack(adapter, dir, { turnCap })`; composed around the Gemini seat in `bin/unite-desktop.js` and `src/main/relay.js` |
| 4 | Cap default | `bin/unite-desktop.js` config merge; `src/main/settings.js` `DEFAULT_CONFIG` | 4 instead of the vendored 8; a room's `.unite/config.json` still overrides |

## 3. Round shapes

Roster is `['claude', 'gemini']`. "Round" = the messages since Ted's most recent message.

| Ted sends | Turns | What happens |
|---|---|---|
| `@claude …` or plain text in planning mode | 1–4 | Claude answers; if it hands off (`@gemini <question>`), Gemini responds; the wrapper appends the hand-back if Gemini named nobody; Claude's prompt carries the close line; Claude closes with no mention. No hand-off → one turn. A second hand-off at turn 3 runs turn 4 under the engine's budget notice; any mention there is suppressed. |
| `@gemini …` | 1 (–3) | Gemini answers; Ted addressed it, so the wrapper stays out. If Gemini itself @mentions Claude, Claude responds and @mentions back (prompted); Gemini's prompt carries the close line. |
| `@all …` | 2 (–3) | Claude then Gemini; both were addressed, so no hand-back. If Gemini @mentions Claude on its own, Claude closes. |

Interrupts unchanged: `^C` skips the current seat's turn; a second `^C` drains the round.

## 4. Component design

### 4.1 Preamble (`src/main/preamble.js`)

`YIELD` becomes:

> If you need Ted to decide or grant a high-stakes permission, say "Ted, we need you to make a decision on <topic>."

(The clause "and do not @mention another seat" is removed.)

New `TURNS` line, in both `desktopPreamble` and `claudeCliPreamble`, after the house rules:

> Turn-taking: when your reply makes a claim or proposal worth a second opinion, end it by @mentioning the other seat with the specific question you want answered. Address a peer by name when you respond to their point. When you are answering a peer's hand-off, reply to their points and @mention them back so they can close. When you close an exchange, @mention no one. One exchange per message from Ted: hand off, get the response, close.

New `HONESTY` line, both preambles:

> You see only the text pasted in this chat. Do not say you have read a file, spec, or notebook source unless its text appears above or you were given its notebook source title to open.

New `PLAIN_NUMBERS` line, `desktopPreamble` only (Gemini):

> Write numbers, thresholds, dates and formulas as plain digits and words in prose or in backticks — never in math formatting. The relay cannot read rendered math; it arrives as blanks.

Order: identity · (Claude: tools + denial note) · house rules · TURNS · YIELD · HONESTY · (Gemini: PLAIN_NUMBERS) · label instruction.

### 4.2 Close instruction (`buildHybridPrompt`, `buildDesktopPrompt`)

Condition, evaluated over `messages` (the full transcript the engine passes):

1. `round` = messages after the last `from: 'ted'` message.
2. `spoke` = round contains a message `from: seat`.
3. `latestPeer` = the last message in `round` is from a roster seat other than `seat`
   (system messages are skipped when finding the latest).
4. `!budgetNotice` — the engine's notice already says "synthesize, no mentions."

If all hold, append after the delta (before the notebook block):

> [System]: Close the exchange for Ted — integrate the reply above briefly; @mention no one.

This never fires on a first turn, never for Gemini in an `@all` round, and for Claude in
an `@all` round only when Gemini @mentioned it — the one case where Claude closes.

### 4.3 Hand-back wrapper (`src/main/handback-adapter.js`)

```js
export function withHandBack(adapter, dir, { turnCap, roster = ['claude', 'gemini'] })
```

Returns `{ seat: adapter.seat, invoke(args) }`. `invoke` calls through; if `res.ok` is
false, returns `res` unchanged. Otherwise:

1. `messages = readTranscript(dir)`; `round` = messages after the last `from: 'ted'`.
2. **Ted addressed this seat** — the Ted message's `mentions` includes `adapter.seat`
   (`@all` is already expanded into the roster by `parseMentions`) → return `res`.
3. **Previous seat turn** — walk `round` backwards, skipping `from: 'system'`; the
   first roster-seat message is `prev`. None → return `res`.
4. **Reply already names a seat** — `parseMentions(res.replyText, roster)` non-empty
   → return `res`.
5. **At the cap** — `turnsSoFar` = count of roster-seat messages in `round`; this turn
   is number `turnsSoFar + 1`; if `turnsSoFar + 1 >= turnCap` → return `res` (the engine
   would suppress the mention and print "turn budget reached"; do not add a misleading
   line).
6. Otherwise return `{ ...res, replyText: res.replyText.trimEnd() + '\n\n— over to @' + prev.from }`.

Composition, both runners:

```js
adapters = withErrorLogs({ claude, gemini: withHandBack(gemini, dir, { turnCap: config.turnCap }) }, dir);
```

`withErrorLog` stays outermost so `errors.log`/`traces.log` record the adapter's raw
result; the engine's `appendMessage` records the text it actually saw, hand-back
included. Nothing is hidden: the line is ordinary reply text in the terminal, in
`transcript.md`, and in Claude's next delta.

Only the Gemini seat is wrapped. Claude follows the prompted rule ("@mention them back
so they can close") reliably; wrapping it would add a mechanism where none is needed.

### 4.4 Cap default

`bin/unite-desktop.js`: `{ ...loadConfig(root), roster: [...], turnCap: user.turnCap ?? 4 }`
where `user` is the room config (`.unite/config.json`) — implement as a small helper
`desktopConfig(root)` so the override order is testable. `src/main/settings.js`
`DEFAULT_CONFIG.turnCap = 4` (limits unchanged, 1–50).

## 5. Edge cases

- Gemini turn fails (offline, timeout, `conversationUnreadable`): engine posts the
  offline line; no reply; nothing to hand back; round ends. No synthetic close on a
  failure.
- Gemini's reply already contains `@claude` or `@all`: untouched. A non-roster mention
  (`@cursor`) is ignored by the engine and counts as "named nobody."
- Cap: step 5 above, mirroring the engine's `isFinal = turns >= turnCap`.
- System lines inside a round (harness-denial line, planning-mode notice): skipped by
  both the wrapper's `prev` search and the close-instruction's `latestPeer`.
- Two Ted messages with no seat turn between them: the round starts at the latest.
- Round boundaries and `mentions` come from `transcript.jsonl`, never from parsing
  prompt text.
- The hand-back is appended after the adapter's own post-processing
  (`stripCitations`), on a `trimEnd()`ed reply.

## 6. Testing

TDD; existing patterns only (tmp-dir transcripts via the vendored `appendMessage`,
fake adapters). No new AX fixtures.

- **`test/handback-adapter.test.js`** — you→Claude→Gemini (appended, exact text);
  you→Gemini (untouched); `@all` (untouched); reply already `@claude` / `@all`
  (untouched); at the cap (untouched); system line between Claude's turn and Gemini's
  (still appended); planning-mode plain text — Ted `mentions: []` (appended); `ok:false`
  result (identical object back); composition with `withErrorLog` leaves
  `diagnostics.replyChars` at the raw length.
- **`test/preamble.test.js`** — yield line no longer contains "do not @mention";
  turn-taking line in both preambles; honesty line in both; plain-numbers line in the
  desktop preamble only. Close instruction: present when the seat already spoke this
  round and the latest message is a peer's; absent on a first turn; absent when
  `budgetNotice` is set; absent for Gemini in an `@all` round.
- **Cap** — `desktopConfig(root)` yields 4 with no room config; a room config of 8
  overrides; `settings.js` default is 4.
- **Round shape through the real vendored `runRound`** — fake seats: Claude replies
  ending `@gemini …`, Gemini replies naming nobody. Assert three seat turns in the
  transcript, the third from Claude, its prompt containing the close line, its reply
  with no mention. Also `@gemini` → one turn; `@all` → two turns. Vendor untouched:
  `git status --short vendor/` empty.

Live, after relaunch, in a **new chat**, monitor armed: a substantive `@claude`
question → three turns; a factual `@gemini` question → one turn; `@all` → two. Evidence
is the `mentions` field on each transcript line, plus Gemini's numbers arriving without
`￼` and no "I'm looking at <file>" claims without a source.

## 7. Rollout

1. Merge to `feat/relay-failure-diagnostics` (fast-forward), `npm test` green.
2. `/quit`, relaunch `AgentsUniteD`.
3. **Start a new chat** (Ted's decision): the preamble is delivered on a session's
   first turn only. The old `main` chat keeps its old rules until its sessions are
   replaced. A new chat also resets Gemini's window, which resets the poll cost.
4. Run the three live checks in §6.

## 8. Open markers

None. Resolved with Ted 2026-09-09: `all-rounds` (stop after both), `preamble-extras`
(both lines), `preamble-rollout` (new chat).

## 9. Out of scope

- Poll cost (Phase 6) — separate design; this spec makes each exchange up to three
  Gemini-speed turns and does nothing to make a turn faster.
- Companion observer terminal (Phase 8) — separate brainstorm.
- One-off notebook review upload (Phase 7).
- Any change under `vendor/` or to the upstream AgentsUnite engine.
- The Copy-button route for recovering rendered math — belongs with Phase 6.

## 10. Verification before handoff

- `npm test` green; each new test shown failing against the unfixed code first.
- `git status --short vendor/` empty.
- Handoff note states: relaunch required, and **start a new chat** to receive the rules.
