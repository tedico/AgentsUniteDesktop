# Sprint Plan — AgentsUnite Desktop

## Phases
- [x] Phase 1 — Probe and fixtures: five yes/no answers per app, accessibility trees saved under test/fixtures
- [x] Phase 2 — Adapters and fake helper: claude-desktop and gemini-desktop fully tested without the apps
- [x] Phase 3 — Engine wiring and the window: one Electron window relays a round end to end
- [x] Phase 4 — Hybrid Terminal CLI runner (Claude Code CLI + Gemini Desktop AX)

## Current phase
Complete — MVP delivered and verified live.

## Delivered Capabilities
- **Hybrid Relay**: Claude Code CLI (tools enabled via `--permission-mode acceptEdits`) + Gemini Desktop (`Gemini.app` via Accessibility AX/JXA accessing private NotebookLM notebooks).
- **CLI Commands & Global Alias**: `AgentsUniteD` and `unite-desktop` in `$PATH` (`~/.local/bin/AgentsUniteD`).
- **Global & Project Storage**:
  - Global mode (`AgentsUniteD -g`): stores chats in visible `~/Documents/AgentsUnite/global/`.
  - Project mode (`AgentsUniteD`): stores chats locally in `<cwd>/.unite/chats/` with `.gitignore`.
- **QuickLook Companion**: Real-time `transcript.md` generated alongside `transcript.jsonl` for Finder Spacebar preview.
- **Universal Planning Mode**: Bare `/plan` toggle, `/plan @seat`, and `/plan <topic>` auto-routing unadorned text to lead planner.
- **Instant Preflight Feedback**: Animated spinner and witty loading lines during accessibility/path preflight.
- **Test Suite**: 114 passing tests (`npm test`).

## Blockers
none


