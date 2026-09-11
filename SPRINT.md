# Sprint Plan — AgentsUnite Desktop

## Phases
- [x] Phase 1 — Probe and fixtures: five yes/no answers per app, accessibility trees saved under test/fixtures
- [x] Phase 2 — Adapters and fake helper: claude-desktop and gemini-desktop fully tested without the apps
- [x] Phase 3 — Engine wiring and the window: one Electron window relays a round end to end
- [x] Phase 4 — Hybrid Terminal CLI runner (Claude Code CLI + Gemini Desktop AX)
- [x] Phase 5 — Relay hardening from live sessions (2026-09-08): `errors.log`/`traces.log` written for real; per-poll trace with snapshot cost and truncation flag; honest failure codes (`conversationUnreadable`, no false finishes); Gemini replies readable in both AX shapes; denial detection on `is_error` only
- [ ] Phase 6 — Poll cost, `desktop` seat only: make per-poll cost independent of conversation length (measured 4 s → 35 s per snapshot over nine turns of one chat). Optional since Phase 8 made `agy` the default seat.
- [ ] Phase 7 — Seat context: one-off notebook review upload + cleanup; seats address each other directly; seats never claim to have read what was not pasted
- [ ] Phase 8 — Antigravity CLI as the default `@gemini` seat in the terminal runner (spec `docs/superpowers/specs/2026-09-10-agy-seat-design.md`, plan `docs/superpowers/plans/2026-09-10-agy-seat.md`). Executes before Phases 6 and 7 per Ted 2026-09-10. Conductor: Claude Code; workhorse: `agy`.

## Current phase
Phase 8 complete on `feat/agy-seat` (Tasks 1–6 @ 48c0ba2, seven commits since 7ff5bf4) — suite 180/180; live 2026-09-11: fresh-room turn 10 s on `gemini-3.1-pro-high` resolved from `agy models`, migration guard verified on a copy of the `main` room; grounded rounds (F3) pending Ted. Field notes: `docs/field-notes/2026-09-10-agy-seat.md`. Phases 6 and 7 remain queued; 6 is now optional (`desktop` seat only). Phase 5 evidence stays in `docs/field-notes/2026-09-08-evening-relay-hardening.md`.

## Next
Ted merges `feat/agy-seat` into `feat/relay-failure-diagnostics` (fast-forward), relaunches, runs the two grounded rounds (field note F3), and decides whether to start Phase 7 (seat exchange; its plan's one-line wiring adjustment is already recorded) or the per-seat NotebookLM MCP step (spec 2026-09-10 §10: reinstall `notebooklm-py` with the `mcp` extra, `agy mcp add`, probe plan-mode tool calls, guard delete tools). Phase 6 brainstorm notes (chrome node paths, fewer attributes per poll, scroll-area snapshots, stale index paths) are in the 2026-09-08 field notes (F6) if the `desktop` seat is ever the focus again.

## Human
- Bind a notebook for the Phase 8 live check: put `"notebookId": "<id>"` in the room's `.unite/config.json` (`notebooklm list` prints ids), then run the two rounds in Task 7 of the plan and fill in F3 of `docs/field-notes/2026-09-10-agy-seat.md`
- Merge `feat/agy-seat` → `feat/relay-failure-diagnostics` (fast-forward), then push and open the PR to `main` when ready
- Decide the next step after Phase 8: Phase 7 (seat exchange) or per-seat NotebookLM MCP tools
- Decide `WebSearch` / `WebFetch` for the `@claude` seat — recommend `WebSearch` only, or neither; when denied it retried search four times in one round
- Ratify the trace contract change: rows carry message text only where it changed (was every row, your 2026-09-08 decision); revert is two lines in `desktop-adapter.js`
- Decide `[NEEDS CLARIFICATION: B5-idle-trace]` — tracing between rounds (recommend no: one `osascript` spawn every 2 s, indefinitely)
- Choose the fix for inline widgets arriving as U+FFFC (`￼`): (1) mark them `[inline element unreadable by relay]`, (2) preamble rule "numbers and formulas in plain text, never math formatting", (3) press Gemini's Copy button and read the clipboard — recommend 1+2 now, 3 inside Phase 6
- Four markers for Phase 7's one-off review upload: which paths; replace-by-title vs versioned titles; app-triggered vs preamble-instructed; the honesty preamble line. Already decided 2026-09-08 23:27: the workspace file is the single source of truth, no mirroring to the notebook
- Push `feat/relay-failure-diagnostics` and open the PR to `main` when ready (seven commits since a963599; never merged locally to `main` per the hook)
- Rebuild `dist/` (`npm run package`) only if the Electron GUI is used — it predates every fix

## Blockers
none — but Gemini rounds slow with conversation length (213 s at nine replies, against a 300 s timeout). Until Phase 6 lands: start a fresh Gemini chat once a round passes ~200 s.
