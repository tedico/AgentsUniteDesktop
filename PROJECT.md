# Project Status & Roadmap: AgentsUnite Desktop

**Last Updated:** 2026-09-06  
**Current Milestone:** v0.1 Desktop Relay (Claude & Gemini Consumer Apps)  
**Spec Status:** Approved by Ted (2026-09-06)

---

## 🎯 Current Focus
Building an Electron macOS desktop app that relays messages between the Claude desktop app and the Gemini desktop app via macOS accessibility APIs, using the existing AgentsUnite turn-taking engine.

* **Active Spec:** [docs/superpowers/specs/2026-09-06-agentsunite-desktop-relay-design.md](docs/superpowers/specs/2026-09-06-agentsunite-desktop-relay-design.md)
* **Active Plan:** [docs/superpowers/plans/2026-09-06-agentsunite-desktop-relay.md](docs/superpowers/plans/2026-09-06-agentsunite-desktop-relay.md) — 15 tasks; five spec deviations approved by Ted 2026-09-06
* **Assigned Controller:** Cursor (Task 1 onward, per the spec's coding ranking)
* **Planned Execution:** Cursor (bulk implementation) / Gemini / Claude
* **Current Status:** Task 13 complete (renderer UI). Next: Task 14 (packaging).

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
