# Probe findings — 2026-09-06

Terminal app granted Accessibility + Automation: <name>
Claude.app version: <from About> · Gemini.app version: <from About>

## Five answers per app

| Question | Claude | Gemini |
|---|---|---|
| 1. Tree readable (snapshot ok, composer visible in it) | yes/no | yes/no |
| 2. Composer accepts a direct value set (`write` lands) | yes/no → fallback: paste | yes/no |
| 3. Send button reachable (`press` sends the text) | yes/no | yes/no |
| 4. Stop button visible while generating (in streaming fixture) | yes/no | yes/no |
| 5. Reply readable including code blocks (in done fixture) | yes/no | yes/no |

## Timings
- Claude snapshot: <nodes> nodes, <ms> ms (idle) · <ms> (streaming) · <ms> (done)
- Gemini snapshot: …

## Selectors chosen (copied into src/selectors/*.js in Task 4)
Claude: composer `{…}` · send `{…}` · stop `{…}` · conversation `{…}` · messageItem `{…}` or null
Gemini: …

## Surprises
- …
