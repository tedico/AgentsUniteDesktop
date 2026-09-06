# Probe findings — 2026-09-06

Terminal app granted Accessibility + Automation: Cursor
Claude.app version: 1.46388.4 · Gemini.app version: 1.82.2.534

## Five answers per app

| Question | Claude | Gemini |
|---|---|---|
| 1. Tree readable (snapshot ok, composer visible in it) | yes | yes |
| 2. Composer accepts a direct value set (`write` lands) | yes (AX read-back) | yes (AX read-back) |
| 3. Send button reachable (`press` sends the text) | no — `AXPress`/`click`/Return do not submit | yes — `help: "Send (return)"` (only after composer has text) |
| 4. Stop button visible while generating (in streaming fixture) | not captured (send never fired) | no — 15–27s snapshots miss the generation window |
| 5. Reply readable including code blocks (in done fixture) | not captured | yes — reply + thinking textareas; JS/code markers present in done tree |

## Timings
- Claude snapshot: 87 nodes, 9119 ms (idle). Default `maxDepth: 60` / 20s timed out or threw `Can't get object`; probe now uses `maxDepth: 40`, `maxNodes: 8000`, 180s timeout, plus 1s after `AXManualAccessibility`.
- Gemini snapshot: 112 nodes, 14210 ms (idle, sidebar collapsed) · 136 nodes, 21342 ms (streaming, conversation pane) · 144 nodes, 27247 ms (done, conversation pane). Gemini reports `count: 0` windows until the app is activated. Expanded sidebar (131 outline rows) hides the conversation; conversation pane path is `[0,0,0,2]`.

## Selectors chosen (copied into src/selectors/*.js in Task 4)
Claude: composer `{ role: 'AXTextArea', descriptionIncludes: 'Write your prompt' }` · send `{ role: 'AXButton', descriptionIncludes: 'Send message' }` · stop `unknown` · conversation `{ role: 'AXGroup', nameIncludes: 'Primary pane' }` · messageItem `null` (empty new-chat idle; greeting is static text "Tedilicious returns!")
Gemini: composer `{ role: 'AXTextArea', descriptionIncludes: 'Ask Gemini' }` · send `{ role: 'AXButton', helpIncludes: 'Send' }` · stop `not seen` · conversation `{ role: 'AXScrollArea' }` (the one that is not the composer) or the group under the conversation pane · messageItem `{ role: 'AXTextArea', descriptionIncludes: 'text entry area' }`

## Surprises
- Claude composer is depth ~27 (`Write your prompt to Claude`). Sidebar/history can stall a full-depth walk.
- Claude `write` read-back is `probe hello`, but `AXPress` on Send, `el.click()`, CGEvent click at the button, composer click + `keyCode(36)`, and Return after focus all left the composer unchanged. Paste appended (`probe helloprobe hello`) so Cmd+V reaches the editor. Send is unsolved; adapters will need a different submit (or a human click for the remaining fixtures).
- Gemini `write` lands. Send exists only while the composer has text (`help: "Send (return)"` at `[0,0,0,0,4]` when sidebar is collapsed, `[0,0,0,2,4]` or `[0,0,0,2,5]` in the conversation pane). `press` cleared the composer and produced a reply.
- Gemini AXManualAccessibility is not available (`Can't get object`). Windows are invisible until `Application(bundleId).activate()`.
- Gemini reply text lives in `AXTextArea` nodes with description `text entry area` (includes model "thinking" traces). Visible chat text is also in `collectText` of the conversation pane. Citations like `[cite: 1.1.1]` appear.
- Live trees throw `Can't get object` while Gemini is generating; `ax.jxa` now skips a mutated child instead of failing the whole snapshot.
- Gemini chat on screen was titled "Is Electron Open Source?" (prior conversation + probe messages), not a blank hello. Fixtures contain that text.
- Fixtures committed: `claude-idle`, `gemini-idle`, `gemini-streaming`, `gemini-done`. Missing: `claude-streaming`, `claude-done` (blocked on Send).

## Follow-up for Ted
- In Claude.app, click Send on the composer (it still holds `probe hello` / `probe helloprobe hello`), or send `Reply with one sentence and then a three-line JavaScript code block.` by hand. Then we recapture `claude-streaming` (during generation) and `claude-done`.
- Optional: start a long Gemini reply and tell us immediately so we can retry a Stop-button capture.
