import { execFile } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const AX_SCRIPT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'ax.jxa');

// One osascript process per call. The command is small JSON in argv; the text
// payload (a whole prompt) rides in AX_TEXT so it never meets the argv limit
// and never shows in `ps`. Always resolves — callers branch on `ok`.
export function runJxa({ scriptPath = AX_SCRIPT, command, text = '', timeoutMs = (command?.op === 'snapshot' ? 120000 : 20000) }) {
  return new Promise((resolve) => {
    execFile(
      'osascript',
      ['-l', 'JavaScript', scriptPath, JSON.stringify(command)],
      { env: { ...process.env, AX_TEXT: text }, timeout: timeoutMs, maxBuffer: 64 * 1024 * 1024 },
      (err, stdout, stderr) => {
        const parsed = parseJson(stdout);
        if (parsed) return resolve(parsed);
        if (err?.killed) return resolve({ ok: false, code: 'timeout', error: `osascript exceeded ${timeoutMs}ms` });
        resolve({ ok: false, code: classify(stderr), error: (stderr || err?.message || 'osascript failed').trim() });
      },
    );
  });
}

export function classify(stderr) {
  if (/-1743|Not authorized to send Apple events/i.test(stderr)) return 'automation';
  if (/-25211|assistive access|not allowed to send keystrokes/i.test(stderr)) return 'accessibility';
  return 'script';
}

function parseJson(s) {
  try {
    const v = JSON.parse(s);
    return v && typeof v === 'object' ? v : null;
  } catch { return null; }
}
