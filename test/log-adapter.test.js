import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { withErrorLog, appendTraceLog, TRACE_LOG_MAX_BYTES } from '../src/main/log-adapter.js';
import { lastError, readTranscript } from '../vendor/agentsunite/lib/transcript.js';
import { ERRORS } from '../src/shared/errors.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'unite-log-'));

test('withErrorLog writes a diagnostic block on catalog failure and strips stderr', async () => {
  const dir = tmp();
  const inner = {
    seat: 'claude',
    async invoke() {
      return { ok: false, error: ERRORS.emptyReply('Claude'), stderr: 'raw-cli-stderr', sessionRef: 's' };
    },
  };
  const res = await withErrorLog(inner, dir, () => 1_000_000).invoke({ prompt: 'x' });
  assert.equal(res.stderr, undefined);
  const block = lastError(dir);
  assert.match(block, /raw-cli-stderr/);
});

test('withErrorLog on success with denials logs and posts a system line', async () => {
  const dir = tmp();
  const inner = {
    seat: 'claude',
    async invoke() {
      return { ok: true, replyText: 'need Screen Recording', sessionRef: 's', denials: [{ tool: 'Bash', reason: 'denied' }] };
    },
  };
  const res = await withErrorLog(inner, dir).invoke({ prompt: 'x' });
  assert.equal(res.ok, true);
  assert.match(lastError(dir), /harnessDenied/);
  const sys = readTranscript(dir).find((m) => m.from === 'system');
  assert.match(sys.text, /Claude Code harness denied/);
});

test('withErrorLog does not write errors.log on success without denials', async () => {
  const dir = tmp();
  const inner = { seat: 'claude', async invoke() { return { ok: true, replyText: 'hi', sessionRef: 's' }; } };
  await withErrorLog(inner, dir).invoke({ prompt: 'x' });
  assert.equal(fs.existsSync(path.join(dir, 'errors.log')), false);
  assert.equal(fs.existsSync(path.join(dir, 'traces.log')), false);
});

test('withErrorLog writes a successful poll trace to traces.log, not errors.log', async () => {
  const dir = tmp();
  const inner = {
    seat: 'gemini',
    async invoke() {
      return {
        ok: true, replyText: 'hi', sessionRef: 's',
        diagnostics: { promptChars: 3, replyChars: 2, polls: 2, trace: [
          { elapsedMs: 1000, busy: true, via: 'none', items: 2, chars: 10, think: 4, stable: 0, phase: 'awaiting-reply', texts: ['old q', 'old a'] },
          { elapsedMs: 2000, busy: false, via: 'idle', items: 3, chars: 20, think: 4, stable: 1, phase: 'awaiting-reply', texts: ['old q', 'old a', 'Hello back!'] },
        ] },
      };
    },
  };
  await withErrorLog(inner, dir).invoke({ prompt: 'x' });
  assert.equal(fs.existsSync(path.join(dir, 'errors.log')), false);
  const log = fs.readFileSync(path.join(dir, 'traces.log'), 'utf8');
  assert.match(log, /code=ok/);
  assert.match(log, /seat=gemini/);
  assert.match(log, /t=1000 busy=true via=none/);
  assert.match(log, /t=2000 busy=false via=idle/);
  assert.match(log, /Hello back!/);
});

test('appendTraceLog drops the oldest blocks once the file exceeds the cap', () => {
  const dir = tmp();
  const cap = 400;
  appendTraceLog(dir, 'gemini', 'FIRST_BLOCK ' + 'aaaa'.repeat(30), { maxBytes: cap, now: () => new Date('2026-09-08T12:00:00.000Z') });
  appendTraceLog(dir, 'gemini', 'SECOND_BLOCK ' + 'bbbb'.repeat(30), { maxBytes: cap, now: () => new Date('2026-09-08T12:01:00.000Z') });
  appendTraceLog(dir, 'gemini', 'THIRD_BLOCK ' + 'cccc'.repeat(30), { maxBytes: cap, now: () => new Date('2026-09-08T12:02:00.000Z') });
  const log = fs.readFileSync(path.join(dir, 'traces.log'), 'utf8');
  assert.ok(Buffer.byteLength(log) <= cap);
  assert.doesNotMatch(log, /FIRST_BLOCK/);
  assert.match(log, /THIRD_BLOCK/);
  assert.ok(TRACE_LOG_MAX_BYTES >= 256 * 1024);
});

// A five-minute failing round can exceed the cap on its own. The old tail-chop
// kept the last N bytes and lost the header that names the seat and verdict —
// the one round you most need to read arrived decapitated.
test('a single block larger than the cap is kept whole, header intact', () => {
  const dir = tmp();
  const cap = 200;
  const block = 'seat=gemini\ncode=replyTimedOut\n' + 't=1 busy=true via=none\n'.repeat(40);
  assert.ok(Buffer.byteLength(block) > cap);
  appendTraceLog(dir, 'gemini', block, { maxBytes: cap, now: () => new Date('2026-09-09T00:00:00.000Z') });
  const log = fs.readFileSync(path.join(dir, 'traces.log'), 'utf8');
  assert.match(log, /^--- 2026-09-09T00:00:00\.000Z gemini\nseat=gemini\ncode=replyTimedOut\n/, 'header must survive');
  assert.equal((log.match(/t=1 busy=true/g) ?? []).length, 40, 'rows must survive');
});
