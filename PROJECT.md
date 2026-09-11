# Project Status & Roadmap: AgentsUnite Desktop

**Last Updated:** 2026-09-10  
**Current Milestone:** v0.2 Terminal Runner — Claude Code + Antigravity CLI on one notebook  
**Spec Status:** Approved by Ted (2026-09-10)

---

## 🎯 Current Focus
Retiring Gemini.app from the terminal runner: `@gemini` runs the Antigravity CLI (`agy`) headlessly by default on the top Gemini Pro model, grounded on the room's NotebookLM notebook, with Gemini.app kept as an opt-in for the Electron window and `"geminiSeat": "desktop"`.

* **Active Spec:** [docs/superpowers/specs/2026-09-10-agy-seat-design.md](docs/superpowers/specs/2026-09-10-agy-seat-design.md)
* **Active Plan:** [docs/superpowers/plans/2026-09-10-agy-seat.md](docs/superpowers/plans/2026-09-10-agy-seat.md) — 7 tasks; two cosmetic spec deviations recorded in the plan header
* **Assigned Controller:** Claude Code (conductor) with the Antigravity CLI as workhorse — Conductor + Workhorse pattern, spec §7
* **Planned Execution:** Antigravity writes tests and code per task; Claude Code runs the suite, reviews, and commits
* **Current Status:** see `SPRINT.md` `## Current phase`

---

## 🚦 Feature Pipeline

### Active Sprint: Desktop Relay v0.1
- [x] **Design Approval** (Completed 2026-09-06) — Approach A (macOS accessibility layer driving both apps).
- [x] **Implementation Plan** (Completed 2026-09-06 — Claude Fable) — [15 sequential tasks](docs/superpowers/plans/2026-09-06-agentsunite-desktop-relay.md), TDD, one commit each.
- [x] **Scaffolding & Engine Import** (Completed 2026-09-06 — Cursor) — Vendored engine from `/Users/teds/Projekts/AgentsUnite` at pin `8f6bb60` (pluggable `buildPrompt`).
- [x] **Accessibility Probe Verification** (Completed 2026-09-06 — Cursor) — Five answers per app in docs/probe/findings.md; Claude Stop captured; Gemini Stop not seen.
- [x] **Relay Loop & Turn-Taking** (Completed 2026-09-06 — Cursor) — `makeRelay` drives `runRound` over IPC; skip and `/plan` included.
- [x] **Electron Single-Window UI** (Completed 2026-09-06 — Cursor) — Transcript, composer, status strip, settings panel.

---

## 📚 Quick Links & References
* **Active Design Spec:** [docs/superpowers/specs/2026-09-06-agentsunite-desktop-relay-design.md](docs/superpowers/specs/2026-09-06-agentsunite-desktop-relay-design.md)
* **Reference Engine:** `/Users/teds/Projekts/AgentsUnite` (`lib/engine.js`, `lib/transcript.js`, `lib/mentions.js`, `lib/deltas.js`, `lib/config.js`)
* **Workflow Spec:** [llm-agnostic-ai-dev-team-spec.md](llm-agnostic-ai-dev-team-spec.md)
* **Known Constraints:** macOS only; both target desktop apps must be running and not in full-screen on separate Spaces.
* **Architecture & Seat Notes:**
  - In `AgentsUniteDesktop`, `@gemini` automates the consumer `Gemini.app` GUI via Apple Accessibility (`AXUIElement`), bridging an otherwise closed ecosystem (no CLI/API/daemon).
  - In `AgentsUnite` (CLI), `@gemini` drives the headless `agy` binary via terminal subprocess.
  - Lead planner can be changed per-session via `/plan @gemini` or set as default in `.unite/config.json` (`"planner": "gemini"`).
