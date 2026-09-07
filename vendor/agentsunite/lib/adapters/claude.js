import { runHeadless, extractJson, makeLineSplitter } from '../proc.js';
import { makeTracker } from '../progress.js';

// Change 5: the room never needs Ted's claude.ai connectors. Verified on
// claude 2.1.263: init reports mcp_servers: [] while plan mode, skills and
// the superpowers slash commands still load; a trivial turn drops from 5.3s
// to 3.5s and from 32.9K to 15.9K cache-creation tokens.
export const NO_MCP_ARGS = ['--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}'];

export function claudeAdapter({ binary = 'claude', model, timeoutMs = 300000, mcp = false }) {
  return {
    seat: 'claude',
    async invoke({ prompt, sessionRef, signal, onProgress }) {
      // stream-json in print mode requires --verbose (verified: without it
      // claude exits 1 with "requires --verbose").
      const args = ['-p', '--permission-mode', 'plan', '--output-format', 'stream-json', '--verbose'];
      if (!mcp) args.push(...NO_MCP_ARGS);
      if (model) args.push('--model', model);
      if (sessionRef) args.push('--resume', sessionRef);

      const track = makeTracker(onProgress);
      let result = null;
      const lines = makeLineSplitter((line) => {
        let evt;
        try { evt = JSON.parse(line); } catch { return; } // update notices etc.
        if (evt.type === 'system' && evt.subtype === 'init') track.phase('connected');
        else if (evt.type === 'system' && evt.subtype === 'thinking_tokens') track.phase('thinking');
        else if (evt.type === 'assistant') {
          const tools = (evt.message?.content ?? []).filter((b) => b.type === 'tool_use');
          if (tools.length) for (const b of tools) track.tool(b.name);
          else track.phase('thinking');
        } else if (evt.type === 'user') track.phase('thinking'); // tool result landed
        else if (evt.type === 'result') { result = evt; track.phase('replying'); }
      });
      const onData = (chunk, stream) => {
        track.heartbeat();
        if (stream === 'stdout') lines.push(chunk);
      };

      const r = await runHeadless({ cmd: binary, args, stdinText: prompt, timeoutMs, signal, onData });
      lines.flush();
      if (r.timedOut) return { ok: false, error: 'timeout', stderr: r.stderr };
      if (r.spawnError) return { ok: false, error: 'binary not found', stderr: r.stderr };
      const resultText = result?.result ?? result?.response ?? result?.text;
      const stderr = [r.stderr, resultText].filter((text) => typeof text === 'string' && text.trim()).join('\n')
        || r.stdout.slice(-2000);
      if (r.code !== 0) {
        return { ok: false, error: `exit ${r.code}`, stderr, sessionLost: sessionRef != null };
      }
      // The line parser is the source of truth; extractJson is a fallback for
      // output that was not line-delimited.
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
