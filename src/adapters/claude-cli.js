import { runHeadless, extractJson, makeLineSplitter } from '../../vendor/agentsunite/lib/proc.js';
import { makeTracker } from '../../vendor/agentsunite/lib/progress.js';
import { NO_MCP_ARGS } from '../../vendor/agentsunite/lib/adapters/claude.js';

// Same contract as the vendored claudeAdapter, but permission mode is a
// parameter. Default is acceptEdits (Ted, 2026-09-07 C18/A5): tools on.
export function claudeCliAdapter({
  binary = 'claude',
  model,
  timeoutMs = 300000,
  mcp = false,
  permissionMode = 'acceptEdits',
  run = runHeadless,
} = {}) {
  return {
    seat: 'claude',
    async invoke({ prompt, sessionRef, signal, onProgress }) {
      const args = ['-p', '--permission-mode', permissionMode, '--output-format', 'stream-json', '--verbose'];
      if (!mcp) args.push(...NO_MCP_ARGS);
      if (model) args.push('--model', model);
      if (sessionRef) args.push('--resume', sessionRef);

      const track = makeTracker(onProgress);
      let result = null;
      const lines = makeLineSplitter((line) => {
        let evt;
        try { evt = JSON.parse(line); } catch { return; }
        if (evt.type === 'system' && evt.subtype === 'init') track.phase('connected');
        else if (evt.type === 'system' && evt.subtype === 'thinking_tokens') track.phase('thinking');
        else if (evt.type === 'assistant') {
          const tools = (evt.message?.content ?? []).filter((b) => b.type === 'tool_use');
          if (tools.length) for (const b of tools) track.tool(b.name);
          else track.phase('thinking');
        } else if (evt.type === 'user') track.phase('thinking');
        else if (evt.type === 'result') { result = evt; track.phase('replying'); }
      });
      const onData = (chunk, stream) => {
        track.heartbeat();
        if (stream === 'stdout') lines.push(chunk);
      };

      const r = await run({ cmd: binary, args, stdinText: prompt, timeoutMs, signal, onData });
      lines.flush();
      if (r.timedOut) return { ok: false, error: 'timeout', stderr: r.stderr };
      if (r.spawnError) return { ok: false, error: 'binary not found', stderr: r.stderr };
      const resultText = result?.result ?? result?.response ?? result?.text;
      const stderr = [r.stderr, resultText].filter((text) => typeof text === 'string' && text.trim()).join('\n')
        || r.stdout.slice(-2000);
      if (r.code !== 0) {
        return { ok: false, error: `exit ${r.code}`, stderr, sessionLost: sessionRef != null };
      }
      const j = result ?? extractJson(r.stdout, ['result']);
      if (j?.is_error === true) {
        return { ok: false, error: 'error result', stderr: stderr || j.result };
      }
      if (!j || typeof j.result !== 'string') {
        return { ok: false, error: 'bad json from claude', stderr: `${r.stderr}\n${r.stdout.slice(0, 2000)}` };
      }
      if (!j.result.trim()) return { ok: false, error: 'empty reply', stderr };
      return { ok: true, replyText: j.result, sessionRef: j.session_id ?? sessionRef ?? null };
    },
  };
}
