# Sprint Plan — AgentsUnite Desktop

## Phases
- [ ] Phase 1 — Probe and fixtures: five yes/no answers per app, accessibility trees saved under test/fixtures
- [ ] Phase 2 — Adapters and fake helper: claude-desktop and gemini-desktop fully tested without the apps
- [ ] Phase 3 — Engine wiring and the window: one Electron window relays a round end to end
- [ ] Phase 4 — Live smoke, packaging, the app's own Accessibility prompt

## Current phase
Phase 1 — Probe and fixtures

## Next
Task 2 of docs/superpowers/plans/2026-09-06-agentsunite-desktop-relay.md (AX tree query module)

## Human
- Grant Accessibility and Automation (System Events) to the terminal app that will run `node scripts/probe.mjs` (System Settings → Privacy & Security → Accessibility / Automation). Relaunch it if the grant does not take effect.
- Open a throwaway "hello" chat in Claude.app and in Gemini.app for fixture capture.
- Later: grant Accessibility and Automation to the packaged AgentsUnite Desktop app when it asks.
- Run the live smoke twice (Task 15).

## Blockers
none
