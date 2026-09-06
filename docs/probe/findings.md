# Probe findings — 2026-09-06

Terminal app granted Accessibility + Automation: Cursor
Claude.app version: 1.46388.4 · Gemini.app version: 1.82.2.534

## Five answers per app

| Question | Claude | Gemini |
|---|---|---|
| 1. Tree readable (snapshot ok, composer visible in it) | yes | yes |
| 2. Composer accepts a direct value set (`write` lands) | yes | yes |
| 3. Send button reachable (`press` sends the text) | yes — `description: "Send message"` (after context-limit error cleared) | yes — `help: "Send (return)"` (only after composer has text) |
| 4. Stop button visible while generating (in streaming fixture) | yes — `description: "Stop response"` | no — 15–27s snapshots miss the generation window |
| 5. Reply readable including code blocks (in done fixture) | yes — sentence + JS in `AXStaticText` / `AXGroup` `js code` | yes — reply + thinking textareas; JS/code markers present |

## Timings
- Claude snapshot: 87 nodes, 9119 ms (idle) · 176 nodes, 16786 ms (streaming) · 255 nodes, 22432 ms (done). Default `maxDepth: 60` / 20s timed out or threw `Can't get object`; probe uses `maxDepth: 40`, `maxNodes: 8000`, 180s timeout, plus 1s after `AXManualAccessibility`.
- Gemini snapshot: 112 nodes, 14210 ms (idle, sidebar collapsed) · 136 nodes, 21342 ms (streaming, conversation pane) · 144 nodes, 27247 ms (done, conversation pane). Gemini reports `count: 0` windows until the app is activated. Expanded sidebar (131 outline rows) hides the conversation; conversation pane path is `[0,0,0,2]`.

## Selectors chosen (copied into src/selectors/*.js in Task 4)
Claude: composer `{ role: 'AXTextArea', descriptionIncludes: 'Write your prompt' }` · send `{ role: 'AXButton', descriptionIncludes: 'Send message' }` · stop `{ role: 'AXButton', descriptionIncludes: 'Stop' }` · conversation `{ role: 'AXGroup', descriptionIncludes: 'Primary pane' }` · messageItem `{ role: 'AXGroup', descriptionIncludes: 'Message ' }` (idle has none; Task 4 then treats the pane as one item)
Gemini: composer `{ role: 'AXTextArea', descriptionIncludes: 'Ask Gemini' }` · send `{ role: 'AXButton', helpIncludes: 'Send' }` · stop `not seen` · conversation `{ role: 'AXScrollArea' }` (the one that is not the composer) · messageItem `{ role: 'AXTextArea', descriptionIncludes: 'text entry area' }`

## Surprises
- Claude composer is depth ~27 (`Write your prompt to Claude`). Sidebar/history can stall a full-depth walk.
- Claude Send was dead while a context-limit error was on screen; after Ted cleared it, `write` + `AXPress` on `Send message` submitted and the composer cleared. First-session AXPress/Return failures were that error, not a broken button.
- Claude Stop is `Stop response`, in the same composer chrome as Send, only while generating. Streaming fixture also has `Currently streaming message` and `Claude is responding`.
- Claude done tree exposes the JS sample as an `AXGroup` description `js code` plus static text (`getAccessibilityTree`, `filter`, `console.log`). Conversation grows idle 91 → streaming 963 → done 3888 characters.
- Gemini `write` lands. Send exists only while the composer has text (`help: "Send (return)"`). `press` clears the composer and produces a reply.
- Gemini AXManualAccessibility is not available (`Can't get object`). Windows are invisible until `Application(bundleId).activate()`.
- Gemini reply text lives in `AXTextArea` nodes with description `text entry area` (includes model "thinking" traces). Citations like `[cite: 1.1.1]` appear.
- Live trees throw `Can't get object` while Gemini is generating; `ax.jxa` now skips a mutated child instead of failing the whole snapshot.
- Gemini chat on screen was titled "Is Electron Open Source?" (prior conversation + probe messages), not a blank hello. Fixtures contain that text.
- Fixtures committed: `claude-idle`, `claude-streaming`, `claude-done`, `gemini-idle`, `gemini-streaming`, `gemini-done`.
