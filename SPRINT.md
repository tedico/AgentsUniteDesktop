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
Phase 5 complete — verified live 2026-09-08 21:45–23:32: ten consecutive Gemini rounds delivered replies (before the fix: 1 of 5); the `@claude` seat produced no false denials and committed to the workspace under a narrow git allowlist. Suite 156/156 on `feat/relay-failure-diagnostics` @ 79693a6 (local only; origin has `main`). Field notes: `docs/field-notes/2026-09-08-evening-relay-hardening.md`.

## Next
Brainstorm Phase 6 with Ted under the spec protocol (markers stay open until he resolves them): probe the chrome node paths each poll instead of walking the tree; read fewer attributes per node while polling; snapshot only the conversation scroll area (`[0,0,0,0,4]` in the live tree, composer/mic/send at `[0,0,0,0,{1,2,3}]`). Decide before code: index paths go stale on re-render; thinking-panel growth spawns nodes a probe cannot see; cadence of full walks as a fallback. Cost data is in the field notes (F6).

## Human
- Bind a notebook for the Phase 8 live check: put `"notebookId": "<id>"` in the room's `.unite/config.json` (`notebooklm list` prints ids), then run the two rounds in Task 7 of the plan
- Decide `WebSearch` / `WebFetch` for the `@claude` seat — recommend `WebSearch` only, or neither; when denied it retried search four times in one round
- Ratify the trace contract change: rows carry message text only where it changed (was every row, your 2026-09-08 decision); revert is two lines in `desktop-adapter.js`
- Decide `[NEEDS CLARIFICATION: B5-idle-trace]` — tracing between rounds (recommend no: one `osascript` spawn every 2 s, indefinitely)
- Choose the fix for inline widgets arriving as U+FFFC (`￼`): (1) mark them `[inline element unreadable by relay]`, (2) preamble rule "numbers and formulas in plain text, never math formatting", (3) press Gemini's Copy button and read the clipboard — recommend 1+2 now, 3 inside Phase 6
- Four markers for Phase 7's one-off review upload: which paths; replace-by-title vs versioned titles; app-triggered vs preamble-instructed; the honesty preamble line. Already decided 2026-09-08 23:27: the workspace file is the single source of truth, no mirroring to the notebook
- Push `feat/relay-failure-diagnostics` and open the PR to `main` when ready (seven commits since a963599; never merged locally to `main` per the hook)
- Rebuild `dist/` (`npm run package`) only if the Electron GUI is used — it predates every fix

## Blockers
none — but Gemini rounds slow with conversation length (213 s at nine replies, against a 300 s timeout). Until Phase 6 lands: start a fresh Gemini chat once a round passes ~200 s.
