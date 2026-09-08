# Field notes — 2026-09-08 · Company_OS_X workspace

Observer: Claude Opus 5, separate interactive CLI session in the same workspace
(`~/Projekts/Company_OS_X`), watching live. Ted drives `AgentsUniteD` in a second
terminal; seats are `@claude` (CLI, acceptEdits) and `@gemini` (Desktop).

Environment: bridge pid 51876 (`node bin/unite-desktop.js`) started 14:14:48,
parent shell pid 40582 (iTerm, since 13:20:54). Gemini.app pid 10763 since 10:51:59.
Chat dir `~/Projekts/Company_OS_X/.unite/chats/main`.
Times below are local (UTC-4); `transcript.jsonl` stores UTC.

Companion to `docs/probe/findings.md` — that is the lab; this is the field.

## Findings

### F1 · `/last-error` is a dead end — the file it reads is never written
Severity: high (it is the advertised recovery path for the most common failure)

The relay prints `— /last-error for details` on every degraded round. Ted saw it
three times in 11 minutes. `/last-error` would have printed `(no errors logged)`.

- `lastError(dir)` reads `<chatdir>/errors.log` — `vendor/agentsunite/lib/transcript.js:34`
- `appendErrorLog(dir, seat, text)` is the only writer — same file, line 29 — and has
  **zero callers** across `src/` and `bin/`
- The only live error path is `appendRoundError(dir, err)`, called from
  `src/main/relay.js:70` and `bin/unite-desktop.js:144`, and only when a round *throws*
- The three "@gemini offline: …" events were handled degradations, not throws, so
  nothing reached either writer
- Confirmed on disk: `.unite/chats/main/` contains only `state.json`,
  `transcript.jsonl`, `transcript.md`. No `errors.log`.

Fix direction: call `appendErrorLog` wherever the relay emits a `system` offline/degraded
message, and record what the adapter actually saw (window count, AX query that returned
empty, elapsed ms) — not the user-facing sentence, which is already in the transcript.

## Observations on usage

### O1 · Ted repeatedly tries to bridge the vision/context gap by hand
Fourth attempt in ~40 min to get one seat's context across to the other:

- 14:24 `@gemini, nice can you see my handwritten notes there as an image??`
- 14:27 `@claude are you awake?` → Claude replies that it *cannot* see the source
  notebook or the note images, and asks Ted to drop scans or have Gemini paste
  its extraction into the chat
- 14:29 `@gemini can you repeat what you said to claude` (manual relay of Gemini's
  own output, because the seats do not share artifacts)
- 16:04 `@claude can you read what's on Gemini's screen??`

The seats are asymmetric: Gemini.app holds images and a Notebook the Claude CLI
seat has no path to. The bridge relays *text lines* only. Ted's workaround each
time is to ask one agent to re-narrate for the other, which loses fidelity and
costs a round trip that frequently fails on the Gemini side.

Signal, not a bug: the product gap is a shared artifact/context channel — e.g.
a chat-scoped `attachments/` dir both seats can read, or a `/share @seat` verb
that captures one seat's last reply (or screen) into the transcript as a durable
artifact rather than a re-typed paraphrase.


### F2 · The seat cannot tell a harness denial from an OS denial, and reports the wrong cause
Severity: high (user is sent to fix a setting that was not the problem)

16:04 Ted: `@claude can you read what's on Gemini's screen??`
16:04 Claude seat: *"The screenshot call (`screencapture`) was denied... needs Screen
Recording permission for the terminal app in System Settings... The window-listing
call through System Events (`osascript`) was denied too. That needs Accessibility
permission."*

Both denials were almost certainly **Claude Code's own permission system**, not macOS TCC:

- `src/adapters/claude-cli.js:18` builds `claude -p --permission-mode acceptEdits
  --output-format stream-json --verbose`
- `-p` is headless with the prompt on stdin. There is no TTY and no prompt channel,
  so a Bash tool call that needs approval is denied outright with nobody to ask
- `acceptEdits` auto-approves **file edits only**. `screencapture` and `osascript`
  are Bash calls and fall outside it
- Contradicting evidence for the OS-permission theory: the bridge's own Gemini
  adapter drives Gemini.app over JXA/AX **from this same process tree** (bridge pid
  51876, parent iTerm shell 40582) and succeeded at 14:22 and 14:24. If Accessibility
  were missing for the responsible app, the Gemini seat would not work either

The seat had no way to distinguish the two, and no way to ask — so it guessed, and
guessed plausibly and wrongly, in a confident voice, to the one person who would act on it.

Fix directions, in order of cheapness:
1. Pass `--allowedTools` for the calls a seat is expected to make (screencapture,
   osascript window listing), so the capability matches the advertised role
2. Surface the denial verbatim: the harness emits a denial reason in the
   `stream-json` events the adapter already parses in `makeLineSplitter`
   (`src/adapters/claude-cli.js:24-36`). Nothing currently inspects tool-denial
   events, so the seat's own narration is the only signal that reaches Ted
3. Preamble the seat with the truth about its sandbox: headless, no approval
   channel, edits auto-accepted, everything else denied. Then it can say "I was
   denied by my own harness" instead of inventing a System Settings errand

### F2a · Confirmed harm: Ted acted on the misdiagnosis within 3 minutes
16:04:51 seat blames macOS permissions · 16:07:15 Ted: `@claude can you tell me how
to grant you permissions on the two tools that you mentioned`

This is the cost of F2 made concrete. The seat's wrong cause did not stay an
inaccuracy in a chat log — it became the user's next action, inside three minutes,
and it points at System Settings where there is nothing to fix for the osascript
path. A seat that had said "my own harness denied this, here is the flag" would
have cost one config line instead.

### F2b · Self-correction on the next turn — accurate the second time, but only after being asked
20:07:15 Ted: `@claude can you tell me how to grant you permissions on the two tools
that you mentioned` · 20:08:01 seat replies with a materially better answer: two
distinct layers (Claude Code's own permission gate vs. macOS privacy panes), the
exact `settings.json` JSON to add, and — new information — *"this session is more
locked down than usual. Plain `ps` and reading my own settings file were also
blocked. If you want me to do desktop-level work regularly, check what permission
mode the bridge launches me with."*

Reads as a context/prompting failure, not a knowledge gap: the model clearly has
the correct two-layer model available (it produced it unprompted one turn later),
but the first answer collapsed both layers into one macOS-only story. The trigger
for the correct answer was Ted asking a **follow-up**, not the seat noticing its
own error — worth checking whether the first prompt included enough of the actual
CLI invocation/denial reason for the model to reason about it, or whether it was
inferring blind from generic "permission denied" text (ties to F2's fix #2: surface
the raw denial event instead of a bare boolean).

The self-flagged discrepancy — this session "more locked down than usual" vs. the
code comment at `src/adapters/claude-cli.js:9` (default `acceptEdits`, chosen by
Ted 2026-09-07) — is worth a direct check: confirm what `permissionMode` /
`--allowedTools` this bridge instance actually launches `@claude` with, since the
seat's own uncertainty here suggests it isn't sure either.

### F3 · `noWindow` error names three causes, all of them false — measured live
Severity: high (wrong error text sends the user to fix a window that is not broken)

16:15:59 relay: *"@gemini offline: Gemini is running but macOS reports no readable
window. If it is full-screen on another Space, exit full-screen (⌃⌘F); if it is
hidden, show it (⌘Tab to it)."*

16:16:38, measured from the same host app (iTerm2) that the bridge runs under:

```
System Events -> process "Gemini":
  windows=1  visible=true  frontmost=false  fullscreen=false  minimized=false
```

One ordinary window. Not full-screen, not hidden, not minimized, not on another
Space. The only true statement about it: **Gemini was not frontmost** (iTerm2 was).
Every condition the error names was false.

Mechanism, from source:
- `src/ax/ax.jxa:78` `windows(proc)` -> `ensureWindows(proc)` (line 66)
- `ensureWindows` reads `proc.windows()`; on 0 it calls
  `Application(bundleId).activate()`, sleeps **300 ms**, retries once
- still 0 -> `src/main/preflight.js:29` fires `ERRORS.noWindow`
  (`src/shared/errors.js:14`)

Two known-hostile facts about Gemini, both already in this repo's own
`docs/probe/findings.md`: *"Gemini reports `count: 0` windows until the app is
activated"*, and Gemini AX snapshots measured **14–27 seconds**. A 300 ms wait for
an app that slow to publish its AX tree is optimistic.

`ensureWindows` line 73 is `catch (e) {}` — if `activate()` threw, that is where the
evidence died. Gemini was still not frontmost 40 s later, which suggests activation
never took effect, but the exception was discarded so the two cases cannot be
separated after the fact.

*Confidence: contradiction between message and measured state — **confirmed**
(measured live, source read). Root cause `activate()` throwing vs. 300 ms being too
short — **medium**, and undecidable while line 73 swallows the error.*

Fixes:
1. Stop swallowing `catch (e) {}` at `ax.jxa:73` — that one line costs the diagnosis
2. Poll to a deadline after `activate()` instead of a fixed 300 ms; per-app timing,
   with Gemini flagged slow from the probe data
3. Make `ERRORS.noWindow` report what was **observed** — window count, minimized
   count, frontmost, whether activate was attempted and what it threw — rather than
   listing three guessed causes. The user acts on this text; today it points away
   from the actual state

Workaround that works today: click the Gemini window to bring it frontmost, resend.

### F4 · Gemini answered; the relay reported "no new text"; the answer is still on screen
Severity: high (silent data loss — the user never sees a reply the app successfully produced)
Occurrences of this signature today: 3 (18:23:38, 18:29:15, 20:20:26)

16:16:34 Ted: `@gemini can you repeat what you just said`
16:20:26 relay: *"@gemini offline: Gemini finished but no new text appeared in the
chat."* (`ERRORS.emptyReply`, `src/shared/errors.js:16`) — elapsed 3m52s
16:21:34 observer reads Gemini's AX tree directly and finds the full answer present,
in an `AXStaticText` node (len=737):

> @claude I've got you covered. Ted designed this directory structure to physically
> separate immutable (durable) paradigms from mutable (iterative) working hypotheses.
> Here is the exact the project's directory structure structure … You should be good to initialize
> the repo now!

So the round did not fail to produce an answer. The answer exists, is on screen, and
never reached the transcript, Ted, or the `@claude` seat.

**Ruled out — the selector is correct.** `src/selectors/gemini.js:20` already targets
`{ role: 'AXStaticText', descriptionEquals: 'text', nameExcludes: 'Show thinking' }`,
with a comment noting answers are AXStaticText and thinking panels are AXTextArea.
The AX dump matches that model exactly: the answer sat in static text; every
`AXTextArea` held thinking traces ("Refining the Format", "Perfecting the Directory",
"Finalizing the Output" — Gemini looped through many refinement passes).

**Leading hypothesis: premature "finished" detection.** The error text says
*finished* — the adapter believed generation was over, then diffed and found nothing
new. Gemini's busy signal is inferred, not read: `busyWhenSendAbsent: true` with
`idleButton: { role: 'AXButton', helpIncludes: 'microphone' }`, because live AX
exposes no Stop string (`selectors/gemini.js:14`, confirmed in `docs/probe/findings.md`).
If the mic/Send button reappears for even one poll between thinking segments, the
adapter concludes done, `extractReply` (`src/adapters/reply.js:5`) sees an unchanged
message list, returns empty, and the round is reported as an empty reply.

*Confidence: reply exists and was not relayed — **confirmed** (read from the live AX
tree, quoted above). Premature-finish as the cause — **medium**. Not yet established:
whether the answer node existed at 20:20:26 or appeared in the 68 s before the
observer read it. If it appeared after, the true bug is a too-early give-up rather
than a diff miss — different fix.*

**Experiment that settles it (5 min, next Gemini round):** poll the AXStaticText
answer nodes every 2 s, timestamping when the answer node first appears, and compare
against the moment the relay declares finished. One number decides between "gave up
too early" and "was there and missed".

Regardless of which, two fixes stand:
1. Do not report `emptyReply` while the app may still be generating — require a
   stable idle signal across N consecutive polls before declaring finished, and say
   *"still generating"* rather than *"finished"* when unsure
2. On an empty extraction, dump the observed message list to `errors.log` (see F1 —
   that file is never written today). This entire diagnosis took a direct AX read
   from outside the app; the relay had the same access and recorded nothing

## Failure timeline

(filled as the session runs)
