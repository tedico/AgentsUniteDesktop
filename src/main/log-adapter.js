import fs from 'node:fs';
import path from 'node:path';
import { appendErrorLog, appendMessage } from '../../vendor/agentsunite/lib/transcript.js';
import { formatDiagnostic, formatDenials, formatTraceRow, harnessDenialLine, inferErrorCode } from '../shared/diagnostics.js';

// ~10 five-minute rounds at 1 Hz. Chat dirs already self-ignore.
export const TRACE_LOG_MAX_BYTES = 256 * 1024;

export function appendTraceLog(dir, seat, text, { maxBytes = TRACE_LOG_MAX_BYTES, now = () => new Date() } = {}) {
  const file = path.join(dir, 'traces.log');
  fs.appendFileSync(file, `--- ${now().toISOString()} ${seat}\n${text}\n`);
  rotateTraceLog(file, maxBytes);
}

export function rotateTraceLog(file, maxBytes) {
  if (!fs.existsSync(file)) return;
  let raw = fs.readFileSync(file, 'utf8');
  if (Buffer.byteLength(raw) <= maxBytes) return;
  const blocks = raw.split(/^--- /m).filter(Boolean).map((b) => `--- ${b}`);
  while (blocks.length > 1 && Buffer.byteLength(blocks.join('')) > maxBytes) blocks.shift();
  raw = blocks.join('');
  if (Buffer.byteLength(raw) > maxBytes) {
    const buf = Buffer.from(raw);
    raw = buf.subarray(buf.length - maxBytes).toString();
  }
  fs.writeFileSync(file, raw);
}

// Wraps a seat adapter so catalog failures (and harness denials) reach
// errors.log. Strips stderr after writing so the vendored engine does not
// append a second copy of the same block.
export function withErrorLog(adapter, dir, now = () => Date.now()) {
  return {
    seat: adapter.seat,
    async invoke(args) {
      const t0 = now();
      const res = await adapter.invoke(args);
      if (res.denials?.length) {
        appendErrorLog(dir, adapter.seat, formatDenials(adapter.seat, res.denials));
        if (res.ok) {
          appendMessage(dir, {
            ts: new Date(now()).toISOString(),
            from: 'system',
            text: harnessDenialLine(res.denials),
            mentions: [],
          });
        }
      }
      if (res.ok && res.diagnostics?.trace) {
        const extra = { ...res.diagnostics };
        delete extra.trace;
        const block = [
          formatDiagnostic({ seat: adapter.seat, code: 'ok', elapsedMs: now() - t0, extra }),
          ...res.diagnostics.trace.map(formatTraceRow),
        ].join('\n');
        appendTraceLog(dir, adapter.seat, block);
      }
      if (!res.ok && res.error !== 'skipped') {
        const block = res.stderr || formatDiagnostic({
          seat: adapter.seat,
          code: res.errorCode ?? inferErrorCode(res.error),
          elapsedMs: now() - t0,
          extra: res.diagnostics ?? {},
        });
        appendErrorLog(dir, adapter.seat, block);
        return { ...res, stderr: undefined };
      }
      return res;
    },
  };
}

export function withErrorLogs(adapters, dir, now) {
  return Object.fromEntries(
    Object.entries(adapters).map(([key, adapter]) => [key, withErrorLog(adapter, dir, now)]),
  );
}
