# 🤝 AgentsUnite Desktop

**Autonomous Multi-Agent Terminal Runner pairing Claude Code CLI and Gemini Desktop.**

One terminal workspace. Two frontier AI engines working together in a shared room:
- **✳️ Claude Code CLI**: Runs headlessly in your repo with full tool execution, bash, and filesystem editing (`--permission-mode acceptEdits`).
- **✦ Gemini Desktop (`Gemini.app`)**: Driven via macOS Accessibility (AX/JXA), giving the relay full access to your private NotebookLM notebooks, rich context, and desktop intelligence without API token billing.

> **Companion Project:** See [AgentsUnite](https://github.com/tedico/AgentsUnite) for the pure headless CLI multi-agent group chat pairing human + Claude Code + Gemini (Antigravity) + Cursor.

---

## 💡 Why This Exists: The Problem & The Solution

### The Problem: The Copy-Paste Tax of Fragmented AI
Developers today rely on multiple AI systems that excel at completely different tasks:
1. **Claude Code CLI** excels at code synthesis, refactoring, bash execution, and automated testing inside a local workspace.
2. **Gemini Desktop (`Gemini.app`)** holds deep research, multimodal documents, personal notes, and private NotebookLM source material that are unavailable or cost-prohibitive via standard API endpoints.

Previously, combining them meant **manual cut-and-paste ping-pong**: asking Gemini to analyze research in its desktop app, manually copying its output, pasting into Claude CLI, copying Claude's code questions back to Gemini, and arbitrating the discussion.

### How It Makes Life Easier for Humans & Agents
- **Autonomous Relay with Zero Copy-Paste**: You ask `@gemini what does the architecture spec say about X? Hand off to @claude to scaffold it`. The relay queries Gemini Desktop over macOS Accessibility, captures the answer, and immediately passes it to Claude CLI in your terminal to implement.
- **Division of Labor (The Triad)**:
  - 🧠 **Gemini (The Domain Scholar):** Interrogates private NotebookLM documents, research libraries, and specifications without token billing.
  - 🛠️ **Claude (The Software Builder):** Modifies project files, executes commands, and inspects git working trees with tools enabled.
  - 👤 **The Human (The Chief Architect):** Directs the vision, resolves trade-offs, and makes executive decisions.
- **Human-in-the-Loop Governance**: Built-in turn caps (8 turns max per prompt) and prompt preambles ensure agents yield back to you (`"Ted, we need you to make a decision on <topic>"`) whenever high-stakes decisions arise.
- **Finder-Friendly Visibility**: Transcripts aren't buried in opaque logs. Global chats live in visible `~/Documents/AgentsUnite/global/`, complete with a formatted `transcript.md` file you can preview instantly by pressing **Spacebar** in macOS Finder.

---

## ⚡ Quickstart

### 1. Prerequisites
- macOS (tested on Sonoma & Sequoia).
- [Claude Code CLI](https://docs.anthropic.com/en/docs/agents-and-tools/claude-code/overview) (`npm i -g @anthropic-ai/claude-code`) on your `$PATH`.
- Antigravity CLI (`agy`) on your `$PATH` and logged in — run `agy` once interactively to sign in.
- Optional: [Gemini Desktop App](https://gemini.google.com/) installed and running, only for rooms that set `"geminiSeat": "desktop"`.
- Node.js &ge; 20.

### 2. Permissions (One-Time Setup)
Needed only for the Electron window and for rooms that opt into `"geminiSeat": "desktop"`; a default `agy` room needs none of this. For those, grant macOS Accessibility and Automation permissions to your terminal (Terminal, iTerm2, or Cursor):
1. **Accessibility**: `System Settings → Privacy & Security → Accessibility` → Toggle **ON** for your terminal app.
2. **Automation**: `System Settings → Privacy & Security → Automation` → Allow your terminal to control **System Events**.

### 3. Installation
Clone the repository and link the binary:
```bash
git clone https://github.com/tedico/AgentsUniteDesktop.git
cd AgentsUniteDesktop
npm install
ln -sf "$PWD/bin/unite-desktop.js" ~/.local/bin/AgentsUniteD
```

---

## 🚀 Running a Room

```bash
# Start or resume the latest chat in the current repository:
AgentsUniteD

# Start a new named chat:
AgentsUniteD new my-feature

# Pick from existing chats interactively:
AgentsUniteD resume

# List all chat rooms:
AgentsUniteD ls
```

### 🌍 Global Mode (Unattached to Any Repo)
When you want to brainstorm, review documents, or query your NotebookLM notebooks without touching code:
```bash
# Connects to your persistent global library in ~/Documents/AgentsUnite/global:
AgentsUniteD -g

# Start a named global chat:
AgentsUniteD -g new market-research
```

---

## 💬 How Conversations Work

- **`@mentions` drive routing**: Mentioning `@claude` or `@gemini` routes the turn to that agent.
- **Agent Handoffs**: When Gemini mentions `@claude` in its reply, Claude automatically takes the next turn to write code or run commands (and vice versa). Cap: **8 turns** per round.
- **Planning Mode (`/plan`)**:
  - Typing bare `/plan` (or `/plans`) **toggles planning mode ON/OFF**.
  - When ON, `@claude` drives as lead planner. **Any plain text you type routes straight to Claude** without typing `@claude`.
  - Switch planners with `/plan @gemini` or start on a topic with `/plan <topic>`.
  - Type `/plan` again (or `/plan off`) to return to normal mention routing.

---

## ⌨️ Command Reference

| Input | Description |
| :--- | :--- |
| `/plan` | Toggle planning mode ON / OFF |
| `/plan @seat` | Switch designated planner seat (e.g. `/plan @gemini`) |
| `/plan <topic>` | Start planning on a specific topic immediately |
| `/plan off` | End planning mode |
| `/who` | Display active agent roster and execution modes |
| `/last` | Reprint the last agent reply |
| `/last-error` | Diagnose any system or adapter failure logs |
| `/quit` | Exit cleanly (chat state and history persist) |
| `Ctrl-C` (1&times;) | Skip the currently thinking agent's turn |
| `Ctrl-C` (2&times;) | Drain the queue immediately back to human input |

---

## 🧠 Lead Planner & Under-the-Hood Architecture

### Changing the Lead Planner
In both apps, the lead planner seat is fully configurable:
- **On the fly (per session):** Type `/plan @gemini` or `/plan @gemini <topic>`. From that point forward, all unadorned plain-text inputs route directly to `@gemini`.
- **Permanent default:** Add `"planner": "gemini"` to your project's `.unite/config.json`. Once configured, typing `/plan <topic>` will automatically designate Gemini as the lead driver.

### Choosing the Gemini Seat (Terminal Runner)
Since 2026-09-10 the terminal runner drives `@gemini` through the Antigravity CLI by default. Two optional keys in your project's `.unite/config.json`:
```json
{
  "geminiSeat": "agy",
  "models": { "gemini": "gemini-3.1-pro-high" }
}
```
- `geminiSeat`: `"agy"` (default) runs `agy` headlessly in plan mode, read-only, with no Accessibility permission. `"desktop"` drives Gemini.app over Accessibility as before. Any other value stops the runner with a message.
- `models.gemini`: pins the model. When absent, the runner asks `agy models` at launch and picks the highest-numbered Gemini Pro at high effort; if that list is unavailable it falls back to `gemini-3.1-pro-high`. The chosen model and its source are printed at startup and by `/who`.
- A room that previously ran through Gemini.app is migrated on its next launch: the Gemini seat's session is reset once and the preamble plus full transcript are re-sent on its first turn. Starting a new chat avoids that replay.

### Architectural Nuance: Desktop App vs. CLI App
| App | Seat Name | Under the Hood | Automation Surface |
| :--- | :--- | :--- | :--- |
| **`AgentsUnite` (CLI)** | `@gemini` | **Google Antigravity CLI (`agy`)** | Terminal subprocess (stdin/stdout) |
| **`AgentsUniteDesktop`** terminal runner, default | `@gemini` | **Google Antigravity CLI (`agy`)**, plan mode, top Pro model resolved at launch | Terminal subprocess (argv/stdout) |
| **`AgentsUniteDesktop`** Electron window, and terminal runner with `"geminiSeat": "desktop"` | `@gemini` | **Gemini macOS Desktop App (`com.google.GeminiMacOS`)** | Apple Accessibility API (`AXUIElement`) |

#### Why does `AgentsUniteDesktop` exist?
Unlike developer-focused tools that expose command-line interfaces or JSON streaming (like Claude Code or Antigravity), Google's official Gemini macOS application is a closed system:
1. It exposes no local CLI or background daemon.
2. It has no local IPC socket, WebSocket, or REST API.
3. It does not provide a scriptable AppleScript dictionary (`sdef`).

The **only** boundary exposed for automation is the operating system's Accessibility tree (`AXUIElement`). `AgentsUniteDesktop` acts as an automated bridge—reading text blocks, typing into the composer, simulating clicks on the send button, and monitoring streaming output—allowing a closed desktop consumer app to collaborate directly with developer CLI agents like Claude.

Since 2026-09-10 the terminal runner no longer depends on that bridge by default: `@gemini` runs the Antigravity CLI headlessly, and every round is still grounded on the notebook you bind with `notebookId`. The accessibility bridge remains for the Electron window and for rooms that opt into `"geminiSeat": "desktop"`.

* **Rule of Thumb:**
  - If you want Claude Code and Antigravity in one room grounded on a NotebookLM notebook, use this repo's terminal runner (`AgentsUniteD`) with the default `agy` seat.
  - If you want the plain three-seat CLI room without notebook grounding, use the **[`AgentsUnite`](https://github.com/tedico/AgentsUnite)** CLI.
  - If you want to bridge the macOS consumer desktop apps into your development room, use the Electron window or `"geminiSeat": "desktop"`.

---

## 📂 Storage & Finder QuickLook

### Human-Readable Transcripts (`transcript.md`)
Every round automatically updates a clean **`transcript.md`** alongside the engine's `transcript.jsonl`.
- Select `transcript.md` in macOS Finder and hit **Spacebar** to QuickLook the formatted conversation.

### Where Chats Live
- **Global Chats (`AgentsUniteD -g`)**: Saved in visible `~/Documents/AgentsUnite/global/<chat>/`. Drag any chat folder to the macOS Trash to delete it.
- **Project Chats (`AgentsUniteD`)**: Saved in `<project-root>/.unite/chats/<chat>/` with automatic `.gitignore` protection.

---

## 🧪 Testing

```bash
npm test
```
Runs the full suite of 180 automated tests (mock accessibility trees, stub CLI binaries for the Claude and Antigravity seats, model resolution, preamble generation, and path management).

---

## 📄 Printable Instruction Sheet

A Letter-sized, printable one-page cheat sheet is included:
- HTML source: [`docs/instructions/AgentsUniteDesktop-Instructions.html`](docs/instructions/AgentsUniteDesktop-Instructions.html)
- PDF export: [`docs/instructions/AgentsUniteDesktop-Instructions.pdf`](docs/instructions/AgentsUniteDesktop-Instructions.pdf)
- Rebuild via: `./scripts/build-instructions.sh`

---

## 🛡️ License

MIT © [Ted Sandico](https://github.com/tedico)
