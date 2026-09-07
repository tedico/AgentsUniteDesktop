# AgentsUnite Desktop: relay between the Claude and Gemini desktop apps

Spec destination: `AgentsUniteDesktop/docs/superpowers/specs/2026-09-06-agentsunite-desktop-relay-design.md`
Status: design approved section by section in the unite room by Ted on 2026-09-06. No open markers.
Reference engine: `/Users/teds/Projekts/AgentsUnite` (`lib/engine.js`, `lib/transcript.js`, `lib/mentions.js`, `lib/deltas.js`, `lib/config.js`).

## Goal

Ted runs planning conversations across the Claude desktop app and the Gemini
desktop app. Today the relay between them is manual cut and paste, or Claude
driving the Gemini window through computer use. The Gemini app is not
replaceable by a CLI seat: it has NotebookLM notebooks (RevTech, Hit Makers,
Python for Finance, FDE), months of chat context, and Spark. The Claude app
likewise holds its own context.

AgentsUnite Desktop is an Electron app that does the cut and paste: it reads
each app's open chat, forwards replies between them by the CLI's @mention
rules, and shows both streams in one window with a real text box. No model
runs inside it. No CLI agent (`claude -p`, `agy`) is involved.

## Decisions (resolved with Ted)

- Participants are the two consumer desktop apps, driven through the macOS
  accessibility layer. Approach A. Approach C (Claude via a local MCP server,
  Gemini via accessibility) is the fallback for the Claude side only if the
  probe shows the Electron window cannot be read or written reliably.
- Relay works on whatever chat is open in each app. The desktop app never
  touches sidebars or picks chats. Ted controls which chat is open.
- Turn-taking, turn cap, skip, and history come from the AgentsUnite engine,
  imported as code. Reply mentions the other seat: it crosses over. No
  mention: back to Ted. Cap trips: back to Ted.
- Electron, macOS only for version 1. Node main process imports the engine
  directly; no sidecar.
- The two apps are runtime dependencies. The desktop app checks for them on
  launch, offers to open a missing one, and waits for a composer in each
  window before enabling send. Windows may sit behind others, but not
  minimized to the Dock and not full-screen on a separate Space: the
  accessibility layer reports zero windows for a full-screen app on another
  Space (verified during the 2026-09-06 probe). The start-up checklist
  detects this case (window server shows a full-size window, accessibility
  shows none) and tells Ted to exit full-screen.
- One window for our app. The two source apps keep their own windows; macOS
  does not allow embedding another app's window.
- Coding ranking for this build only: Cursor writes the bulk, Gemini next,
  Claude last. Claude and Gemini work at the design and review level to
  conserve tokens.

## Architecture

Three parts.

1. **Main process, the traffic cop.** Imports `runRound`, `RoundControl`,
   the transcript store, and the mention parser from AgentsUnite. Supplies
   the engine's pluggable `ui` object (events over Electron IPC to the
   renderer) and two adapters. Calls the same round function the CLI calls.
   Development: `agentsunite` as a `file:../AgentsUnite` dependency.
   Packaging: bundle an explicit list of the engine modules the desktop app
   imports (`lib/engine.js`, `lib/transcript.js`, `lib/mentions.js`,
   `lib/deltas.js`, `lib/config.js`, `lib/paths.js`) plus their real
   transitive imports, pinned to a commit, not the whole `file:../AgentsUnite`
   tree. The `.app` must not ship the CLI adapters it never calls, and must
   not assume the sibling folder exists.
2. **Two adapters, the only new logic.** `claude-desktop` and
   `gemini-desktop`, both on one shared accessibility helper. Same contract
   as the CLI adapters: `invoke({ prompt, sessionRef, signal, onProgress })`
   returns `{ ok, replyText, sessionRef }`. `sessionRef` is a constant per
   seat (the open chat is the session), so the engine's "no session ref"
   warning stays quiet.
3. **Renderer, the window.** Transcript, composer, status strip.

History: `.unite/chats/<name>/transcript.jsonl` and `state.json`, same
format as the CLI, inside a project folder Ted chooses. A room started in
the desktop app is readable by the CLI and vice versa.

**Upstream change to AgentsUnite (one small PR).** `runRound` gets an
optional `buildPrompt` parameter defaulting to the CLI's. The desktop app
supplies its own preamble: the CLI's mentions terminals and plan mode, which
is wrong text to paste into a desktop chat. The desktop preamble keeps the
@mention rules, the "Ted issues directives" rule, and the label format.

## Adapters

Shared helper, version 1: macOS's built-in scripting bridge (System Events
via `osascript`), no native build. One call per second or two is all the
relay needs. The helper's interface is narrow (find, read, set value, press,
watch) so it can be replaced by a compiled Swift sidecar later without
touching the adapters. For Claude's Electron window the helper first sets the
`AXManualAccessibility` attribute on the app so Chromium exposes its page.

Per turn, each adapter:

1. **Find.** Window, composer, send button, stop button, conversation
   container, by accessibility role and label. Labels live in one file per
   app (`selectors/claude.js`, `selectors/gemini.js`) so a redesign is a
   one-file fix.
2. **Write.** Set the composer value through accessibility (no focus
   change), then press the send button. Fallback if the probe shows an app
   ignores direct value sets: save clipboard, put text on clipboard, activate
   app, paste keystroke, restore clipboard. Steals focus for a moment;
   acceptable in version 1.
3. **Wait.** Poll every second. Done when the stop button is gone and the
   conversation text is unchanged across two polls. Give up at
   `config.timeoutMs` (default 300000, same as the CLI). If the app is already
   generating when a turn starts, wait for it to finish first.
4. **Read.** Snapshot the conversation before sending and after completion;
   new content after our own prompt is the reply. Code blocks come through as
   text. Strip Gemini citation markers (`[span_N](start_span)` ...
   `(end_span)`) before returning.

Progress phases to the status line via `onProgress`: `pasting`, `sent`,
`streaming` with a growing character count, `done`. Skip aborts the wait and
leaves the app alone.

**Failure messages** (each names what to do): app not running; no chat open
(composer not found); Accessibility denied (with the System Settings path);
selectors not found (names the selector file); reply timed out; app busy.

## Window

One window, three regions, nothing else in version 1.

- **Transcript.** Every message with speaker and time: Ted, both apps, and
  system lines (skipped, budget reached, relay hop markers). Code blocks
  rendered as code.
- **Composer.** Multi-line text box. Enter sends, Shift-Enter newlines,
  paste and dictation land intact. Addressing by `@claude` / `@gemini`
  exactly as in the CLI; no mention means recorded, no reply. `/plan` comes
  from the engine for free.
- **Status strip.** One line per seat: app detected, chat open, and during
  a turn the phase and elapsed time. Skip button per seat. Turn counter
  against the cap.

Settings: project folder for `.unite`, turn cap, timeout. Defaults match the
CLI.

Not in version 1: chat picking, editing a reply before it crosses, multiple
rooms, themes, any seat other than the two apps.

## Testing and the probe

1. **Probe, before any code.** Five yes/no answers per app: tree readable,
   composer accepts a direct value set, send button reachable, stop button
   visible while generating, reply readable including code blocks. Save each
   app's accessibility tree with a chat open, mid-stream, and finished.
   Capture from a throwaway "hello" chat, never a real notebook or working
   chat: the trees are committed and contain whatever was on screen.
   Every "no" has a fallback above except Gemini exposing no text at all; in
   that case stop and re-plan rather than reach for screen capture.
2. **Automated tests, no apps needed** (`node --test`). Each adapter against
   a fake helper replaying the saved trees: find, write, wait, read,
   citation stripping, every failure message. A full round through the real
   engine with fake adapters and a fake `ui`, asserting transcript and
   routing. Engine tests stay upstream.
3. **Live smoke, Ted at the keyboard.** Both apps open with a throwaway
   chat. Send `@gemini say hello and hand off to @claude`. Confirm the hop,
   confirm both source apps show the same text as the window, skip
   mid-turn, let one exchange hit the cap. Launch the packaged app with the
   sibling repo folder renamed; confirm it runs and asks for Accessibility
   once.

Version 1 is done when the live smoke passes twice in a row on a fresh
launch.

## Team, repo, rollout

- **Roles.** Cursor implements the bulk. Gemini takes the next share. Claude
  takes the least code and, with Gemini, reviews for spec compliance. Every
  commit carries one trailer per agent that wrote part of it.
- **Repo.** `AgentsUniteDesktop` becomes a git repo: Electron project,
  `SPRINT.md` from `build-briefing-private/templates/SPRINT.md`, dev
  dependency on the sibling AgentsUnite folder, bundling at package time.
  One upstream PR to AgentsUnite for the pluggable prompt builder.
- **Phases.**
  1. Probe and fixtures.
  2. Adapters and fake helper, fully tested without the apps.
  3. Engine wiring and the window.
  4. Live smoke, packaging, the app's own Accessibility prompt.
- **From spec to plan.** Claude runs `superpowers:writing-plans` once in a
  regular session to turn this spec into a task list; Cursor executes it.

## Human items (for SPRINT.md)

- Grant Accessibility to Antigravity IDE so today's probe can run from the
  room seat (System Settings, Privacy and Security, Accessibility). Relaunch
  the IDE if the grant does not take effect.
- Later, grant Accessibility to the packaged AgentsUnite Desktop app when it
  asks.
- Open a throwaway "hello" chat in each app for fixture capture.
- Run the live smoke twice.

## Follow-ups (not in version 1)

- Approach C for the Claude side if the probe fails there.
- Swift sidecar for the accessibility helper if polling proves slow or
  flaky.
- Edit-before-relay, chat picking, multiple rooms, additional seats.

## Next step

Ted copies this file to the spec destination above, commits it in the new
AgentsUniteDesktop repo with the three trailers, then a regular Claude
session runs writing-plans against it.
