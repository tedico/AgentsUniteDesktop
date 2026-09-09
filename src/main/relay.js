import { runRound, RoundControl, endPlanning } from '../../vendor/agentsunite/lib/engine.js';
import { readTranscript, appendRoundError } from '../../vendor/agentsunite/lib/transcript.js';
import { parsePlanCommand, PLAN_USAGE } from '../../vendor/agentsunite/lib/cli.js';
import { buildHybridPrompt } from './preamble.js';
import { withErrorLogs } from './log-adapter.js';
import { withHandBacks } from './handback-adapter.js';

// The traffic cop. Calls the same runRound the CLI calls; the only things it
// adds are a `ui` that emits events instead of printing, per-seat skip, and
// the /plan commands the CLI handles in bin/unite.js. Never calls
// applyPolicyNotice: that would post the CLI's tool policy into the room.
export function makeRelay({ dir, adapters, config, emit, now = () => Date.now(), groundNotebook } = {}) {
  adapters = withErrorLogs(withHandBacks(adapters, dir, config), dir, now);
  let control = null;
  let activeSeat = null;
  const stamp = () => new Date(now()).toISOString();
  const message = (from, text) => emit({ type: 'message', from, text, ts: stamp() });
  const system = (text) => message('system', text);

  const ui = {
    startStatus(seat, pos, total) {
      activeSeat = seat;
      const t0 = now();
      const elapsed = () => Math.round((now() - t0) / 1000);
      emit({ type: 'turn:start', seat, pos, total });
      return {
        update(evt) {
          if (!evt) return;
          emit({ type: 'turn:progress', seat, phase: evt.phase ?? 'working', chars: evt.chars ?? 0, elapsedSec: elapsed() });
        },
        stop() {
          emit({ type: 'turn:end', seat, elapsedSec: elapsed() });
          activeSeat = null;
        },
      };
    },
    printReply(seat, text) { message(seat, text); },
    printSystem(text) { system(text); },
  };

  return {
    get busy() { return control !== null; },
    get activeSeat() { return activeSeat; },
    loadHistory() { emit({ type: 'transcript:load', messages: readTranscript(dir) }); },
    skip(seat) { if (seat === activeSeat) control?.skipTurn(); },

    async submit(text) {
      const humanText = String(text ?? '').trim();
      if (!humanText) return;
      if (control) { system('A turn is running — press Skip to stop it, then send again.'); return; }

      const plan = parsePlanCommand(humanText, config.roster);
      if (plan?.kind === 'usage') { system(PLAN_USAGE); return; }
      if (plan?.kind === 'bad-seat') { system(`Unknown seat "@${plan.seat}" — this room has ${config.roster.map((s) => '@' + s).join(' and ')}.`); return; }
      if (plan?.kind === 'off') {
        const was = endPlanning(dir, config.roster);
        system(was ? `Planning mode ended — @${was} no longer receives un-mentioned messages.` : 'Planning mode was not on.');
        return;
      }
      const round = plan
        ? { humanText: plan.text, planStart: true, planner: plan.planner ?? config.planner }
        : { humanText };
      if (plan && !config.roster.includes(round.planner)) { system(`Planner @${round.planner} is not in this room.`); return; }

      message('ted', round.humanText);
      control = new RoundControl();
      emit({ type: 'round:start' });
      let notebookContext = null;
      if (config.notebookId && groundNotebook) {
        const g = await groundNotebook({ question: round.humanText, dir, notebookId: config.notebookId });
        if (!g.ok) system(g.error);
        else notebookContext = g.text;
      }
      try {
        await runRound({
          dir, adapters, config, ui, control,
          buildPrompt: (args) => buildHybridPrompt({ ...args, notebookContext }),
          ...round,
        });
      } catch (err) {
        // A corrupt transcript line or a full disk must not take the app down.
        system(`Round failed: ${err?.message ?? err}`);
        appendRoundError(dir, err);
      } finally {
        control = null;
        activeSeat = null;
        emit({ type: 'round:end' });
      }
    },
  };
}
