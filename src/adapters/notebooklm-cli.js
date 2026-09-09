import { runHeadless } from '../../vendor/agentsunite/lib/proc.js';
import { ERRORS } from '../shared/errors.js';
import { isNotebooklmAuthError } from '../shared/diagnostics.js';

// Source adapter, not a conversational seat. Same invoke contract so tests
// and groundRound can treat it like claude-cli.
export function notebooklmCliAdapter({
  binary = 'notebooklm',
  notebookId,
  timeoutMs = 120000,
  allowNew = false,
  run = runHeadless,
} = {}) {
  return {
    seat: 'notebooklm',
    async invoke({ prompt, sessionRef, signal }) {
      if (!notebookId) {
        return { ok: false, error: ERRORS.notebooklmLogin(), errorCode: 'notebooklmLogin' };
      }
      const args = ['ask', '--json', '-n', notebookId, '--prompt-file', '-'];
      if (sessionRef) args.push('-c', sessionRef);
      if (allowNew === true) args.push('--new', '-y');

      const r = await run({ cmd: binary, args, stdinText: prompt, timeoutMs, signal });
      const combined = `${r.stderr}\n${r.stdout}`;
      if (r.spawnError) return { ok: false, error: ERRORS.notebooklmNotOnPath(), errorCode: 'notebooklmNotOnPath', stderr: r.stderr };
      if (isNotebooklmAuthError(combined)) {
        return { ok: false, error: ERRORS.notebooklmLogin(), errorCode: 'notebooklmLogin', stderr: combined.slice(-2000) };
      }
      if (r.timedOut) return { ok: false, error: 'timeout', stderr: r.stderr };
      if (r.code !== 0) {
        return { ok: false, error: `exit ${r.code}`, stderr: combined.slice(-2000) };
      }
      let data;
      try { data = JSON.parse(r.stdout); } catch {
        return { ok: false, error: 'bad json from notebooklm', stderr: r.stdout.slice(0, 2000) };
      }
      const replyText = data?.answer;
      const nextRef = data?.conversation_id ?? sessionRef ?? null;
      if (typeof replyText !== 'string' || !replyText.trim()) {
        return { ok: false, error: 'empty reply', stderr: r.stdout.slice(0, 2000) };
      }
      return { ok: true, replyText, sessionRef: nextRef };
    },
  };
}
