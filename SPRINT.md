# Sprint Plan — AgentsUnite Desktop

## Phases
- [x] Phase 1 — Probe and fixtures: five yes/no answers per app, accessibility trees saved under test/fixtures
- [x] Phase 2 — Adapters and fake helper: claude-desktop and gemini-desktop fully tested without the apps
- [x] Phase 3 — Engine wiring and the window: one Electron window relays a round end to end
- [x] Phase 4 — Hybrid Terminal CLI runner (Claude Code CLI + Gemini Desktop AX)
- [x] Phase 5 — Relay hardening from live sessions (2026-09-08): `errors.log`/`traces.log` written for real; per-poll trace with snapshot cost and truncation flag; honest failure codes (`conversationUnreadable`, no false finishes); Gemini replies readable in both AX shapes; denial detection on `is_error` only
- [ ] Phase 6 — Poll cost: make per-poll cost independent of conversation length (measured 4 s → 35 s per snapshot over nine turns of one chat)
- [ ] Phase 7 — Seat context: one-off notebook review upload + cleanup; seats address each other directly; seats never claim to have read what was not pasted

## Current phase
Phase 7a complete on `feat/seat-exchange` (awaiting Ted's review and merge into `feat/relay-failure-diagnostics`): seats converse in a short bounded exchange — addressed seat answers and may hand off, peer responds once, addressed seat closes; cap 4; `@all` stops after both. Spec `docs/superpowers/specs/2026-09-09-seat-exchange-design.md`, plan `docs/superpowers/plans/2026-09-09-seat-exchange.md`. Not yet validated live.

## Next
Ted: review `feat/seat-exchange`, fast-forward it into `feat/relay-failure-diagnostics`, `/quit`, relaunch `AgentsUniteD`, **start a new chat** (the preamble is delivered on a session's first turn only), then run the three live checks from the spec §6 with the monitor armed: a substantive `@claude` question → three turns; a factual `@gemini` question → one; `@all` → two. Then Phase 6 (poll cost) brainstorm.

## Human
- Decide `WebSearch` / `WebFetch` for the `@claude` seat — recommend `WebSearch` only, or neither; when denied it retried search four times in one round
- Ratify the trace contract change: rows carry message text only where it changed (was every row, your 2026-09-08 decision); revert is two lines in `desktop-adapter.js`
- Decide `[NEEDS CLARIFICATION: B5-idle-trace]` — tracing between rounds (recommend no: one `osascript` spawn every 2 s, indefinitely)
- Choose the fix for inline widgets arriving as U+FFFC (`￼`): (1) mark them `[inline element unreadable by relay]`, (2) preamble rule "numbers and formulas in plain text, never math formatting", (3) press Gemini's Copy button and read the clipboard — recommend 1+2 now, 3 inside Phase 6
- Four markers for Phase 7's one-off review upload: which paths; replace-by-title vs versioned titles; app-triggered vs preamble-instructed; the honesty preamble line. Already decided 2026-09-08 23:27: the workspace file is the single source of truth, no mirroring to the notebook
- Merge PR #1 (`feat/seat-exchange` → `main`, 20 commits: relay hardening + seat exchange) — https://github.com/tedico/AgentsUniteDesktop/pull/1 — then `/quit`, relaunch `AgentsUniteD`, and **start a new chat** for the seats to receive the new preamble
- Rebuild `dist/` (`npm run package`) only if the Electron GUI is used — it predates every fix

## Blockers
none — but Gemini rounds slow with conversation length (213 s at nine replies, against a 300 s timeout). Until Phase 6 lands: start a fresh Gemini chat once a round passes ~200 s.
