import { runHeadless, extractJson, makeLineSplitter } from '../proc.js';
import { makeTracker } from '../progress.js';

export function agyAdapter({ binary = 'agy', model, timeoutMs = 300000 }) {
  return {
    seat: 'gemini',
    async invoke({ prompt, sessionRef, signal, onProgress }) {
      // agy's -p parses greedily; the prompt MUST be the value of --print.
      // Note: --disable-slash-commands conflicts with --mode plan and silently disables read-only mode.
      // stream-json: json mode is silent until the end (verified 17s of
      // nothing), so structured events are the only liveness signal.
      const args = ['--print', prompt, '--mode', 'plan', '--output-format', 'stream-json'];
      if (model) args.push('--model', model);
      if (sessionRef) args.push('--conversation', sessionRef);

      const track = makeTracker(onProgress);
      let result = null;
      const lines = makeLineSplitter((line) => {
        let evt;
        try { evt = JSON.parse(line); } catch { return; }
        if (evt.event === 'init') track.phase('connected');
        else if (evt.event === 'step_update') {
          const su = evt.step_update ?? {};
          if (su.step_type === 'tool' && su.state === 'ACTIVE') track.tool(su.tool_name ?? 'tool');
          else track.phase('thinking');
        } else if (evt.event === 'result') { result = evt.result; track.phase('replying'); }
      });
      const onData = (chunk, stream) => {
        track.heartbeat();
        if (stream === 'stdout') lines.push(chunk);
      };

      // agy's --print-timeout defaults to 5m0s, matching our adapter default.
      // Node's setTimeout starts before fork/exec and CLI flag parsing, so our
      // SIGKILL would fire ~100–300ms before agy can emit its own timeout
      // diagnostic. Add 15s grace so agy's --print-timeout wins the race.
      const r = await runHeadless({ cmd: binary, args, timeoutMs: timeoutMs + 15000, signal, onData });
      lines.flush();
      if (r.timedOut) return { ok: false, error: 'timeout', stderr: r.stderr };
      if (r.spawnError) return { ok: false, error: 'binary not found', stderr: r.stderr };
      const resultText = result?.result ?? result?.response ?? result?.text;
      const stderr = [r.stderr, resultText].filter((text) => typeof text === 'string' && text.trim()).join('\n')
        || r.stdout.slice(-2000);
      if (r.code !== 0) {
        return { ok: false, error: `exit ${r.code}`, stderr, sessionLost: sessionRef != null };
      }
      const j = result ?? extractJson(r.stdout, ['response']);
      if (j?.is_error === true) {
        return { ok: false, error: 'error result', stderr: stderr || j.response };
      }
      if (!j || typeof j.response !== 'string') {
        return { ok: false, error: 'bad json from agy', stderr: `${r.stderr}\n${r.stdout.slice(0, 2000)}` };
      }
      if (!j.response.trim()) return { ok: false, error: 'empty reply', stderr };
      return { ok: true, replyText: j.response, sessionRef: j.conversation_id ?? sessionRef ?? null };
    },
  };
}
