import { parseMentions } from './mentions.js';
import { buildPrompt as defaultBuildPrompt, POLICY_NOTICE, POLICY_VERSION, planNotice, PLAN_END_NOTICE } from './deltas.js';
import { appendMessage, readTranscript, loadState, saveState, appendErrorLog } from './transcript.js';

// Change 1: live sessions learn the new tool policy through the transcript,
// which every seat already reads as its next delta. A fresh chat has no seat
// to update (its preamble carries the policy), so it is only stamped.
export function applyPolicyNotice(dir, roster) {
  const state = loadState(dir, roster);
  if (state.policyVersion >= POLICY_VERSION) return false;
  const notify = readTranscript(dir).length > 0;
  if (notify) appendMessage(dir, { ts: new Date().toISOString(), from: 'system', text: POLICY_NOTICE, mentions: [] });
  state.policyVersion = POLICY_VERSION;
  saveState(dir, state);
  return notify;
}

export class RoundControl {
  constructor() {
    this.drained = false;
    this.turnController = null;
  }
  skipTurn() { this.turnController?.abort(); }
  drain() { this.drained = true; this.turnController?.abort(); }
}

async function invokeSafely(adapter, args) {
  try {
    return await adapter.invoke(args);
  } catch (err) {
    return { ok: false, error: String(err?.message ?? err) };
  }
}

export async function runRound({ humanText, dir, adapters, config, ui, control, planStart = false, planner = null, buildPrompt = defaultBuildPrompt }) {
  const roster = config.roster.filter((s) => adapters[s]);
  const now = () => new Date().toISOString();
  const state = loadState(dir, roster);

  if (planStart) {
    state.planner = planner ?? config.planner ?? 'claude';
    saveState(dir, state);
  }
  appendMessage(dir, { ts: now(), from: 'ted', text: humanText, mentions: parseMentions(humanText, roster) });
  if (planStart) appendMessage(dir, { ts: now(), from: 'system', text: planNotice(state.planner), mentions: [] });

  const queue = [...parseMentions(humanText, roster)];
  // Change 4: while planning mode is on, an un-mentioned Ted message goes to
  // the planner, so Ted can answer a question in plain text and get the next
  // one back. Explicit @mentions (including @all) always win for the round.
  if (queue.length === 0 && state.planner && roster.includes(state.planner)) queue.push(state.planner);
  let turns = 0;

  while (queue.length > 0 && !control.drained) {
    const seat = queue.shift();
    turns++;
    const isFinal = turns >= config.turnCap;
    const messages = readTranscript(dir);
    const agent = state.agents[seat];

    control.turnController = new AbortController();
    const signal = control.turnController.signal;
    const status = ui.startStatus(seat, turns, turns + queue.length);
    const onProgress = (evt) => status.update(evt);

    let res;
    try {
      res = await invokeSafely(adapters[seat], {
        prompt: buildPrompt({ messages, cursor: agent.cursor, seat, roster, firstTurn: agent.sessionRef === null, budgetNotice: isFinal }),
        sessionRef: agent.sessionRef,
        signal,
        onProgress,
      });

      if (!res.ok && res.sessionLost && agent.sessionRef !== null && !signal.aborted) {
        // self-healing: fresh session + full-transcript replay
        res = await invokeSafely(adapters[seat], {
          prompt: buildPrompt({ messages, cursor: 0, seat, roster, firstTurn: true, budgetNotice: isFinal }),
          sessionRef: null,
          signal,
          onProgress,
        });
      }
    } finally {
      // F5: guarantee the spinner is always stopped, even if prompt-building
      // (or anything else in this block) throws instead of resolving.
      status.stop();
      control.turnController = null;
    }

    let suppressed = false;
    if (res.ok) {
      appendMessage(dir, { ts: now(), from: seat, text: res.replyText, mentions: parseMentions(res.replyText, roster) });
      agent.sessionRef = res.sessionRef ?? agent.sessionRef;
      agent.cursor = messages.length + 1; // everything it was shown + its own reply
      ui.printReply(seat, res.replyText);
      if (!res.sessionRef) {
        ui.printSystem(`@${seat} returned no session ref — later turns will not resume this native session`);
      }
      const newMentions = parseMentions(res.replyText, roster).filter((m) => m !== seat && !queue.includes(m));
      if (!isFinal) {
        for (const m of newMentions) queue.push(m);
      } else if (newMentions.length > 0) {
        suppressed = true; // cap truncated a hand-off this reply would have made
      }
    } else if (signal.aborted) {
      // Change 3: Ted pressed ^C. The engine killed the child on purpose, so
      // this is neither "offline" nor a timeout. Say so in both places.
      appendMessage(dir, { ts: now(), from: 'system', text: `@${seat} skipped by Ted (^C)`, mentions: [] });
      ui.printSystem(`${seat}> [skipped by Ted (^C)]`);
    } else {
      const reason = res.error ?? 'unknown';
      if (res.stderr) appendErrorLog(dir, seat, res.stderr);
      appendMessage(dir, { ts: now(), from: 'system', text: `@${seat} offline: ${reason}`, mentions: [] });
      ui.printSystem(`${seat}> [offline: ${reason} — /last-error for details]`);
    }

    saveState(dir, state);

    if (isFinal && (queue.length > 0 || suppressed)) {
      ui.printSystem(`turn budget (${config.turnCap}) reached — back to you`);
      queue.length = 0;
    }
  }
}

// /plan off
export function endPlanning(dir, roster) {
  const state = loadState(dir, roster);
  const was = state.planner ?? null;
  state.planner = null;
  saveState(dir, state);
  appendMessage(dir, { ts: new Date().toISOString(), from: 'system', text: PLAN_END_NOTICE, mentions: [] });
  return was;
}
