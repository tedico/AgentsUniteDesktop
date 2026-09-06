# Sprint Plan — AgentsUnite Desktop

## Phases
- [ ] Phase 1 — Probe and fixtures: five yes/no answers per app, accessibility trees saved under test/fixtures
- [ ] Phase 2 — Adapters and fake helper: claude-desktop and gemini-desktop fully tested without the apps
- [ ] Phase 3 — Engine wiring and the window: one Electron window relays a round end to end
- [ ] Phase 4 — Live smoke, packaging, the app's own Accessibility prompt

## Current phase
Phase 1 — Probe and fixtures

## Next
Task 3 remainder: Claude streaming/done fixtures (Ted clicks Send), then Task 4 selectors — or re-plan Claude submit if AXPress stays dead.

## Human
- In Claude.app, click Send (composer still has the probe text) or type/send `Reply with one sentence and then a three-line JavaScript code block.` so we can capture `claude-streaming` and `claude-done`.
- Optional: start a long Gemini generation and ping immediately if we should retry a Stop-button snapshot.
- Later: grant Accessibility and Automation to the packaged AgentsUnite Desktop app when it asks.
- Run the live smoke twice (Task 15).

## Blockers
Claude Send does not respond to AXPress, click, or Return from osascript. Gemini Stop never appeared in 15–27s snapshots.
