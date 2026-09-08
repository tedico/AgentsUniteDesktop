import { test } from 'node:test';
import assert from 'node:assert/strict';
import { formatDiagnostic, formatDenials, formatTraceRow, harnessDenialLine, inferErrorCode } from '../src/shared/diagnostics.js';
import { ERRORS } from '../src/shared/errors.js';

test('formatDiagnostic is machine state: seat, code, elapsed, extra counts — no objects as [object Object]', () => {
  const text = formatDiagnostic({
    seat: 'gemini',
    code: 'emptyReply',
    elapsedMs: 232000,
    extra: { messagesBefore: 4, messagesAfter: 4, candidateLengths: [12, 0] },
  });
  assert.match(text, /seat=gemini/);
  assert.match(text, /code=emptyReply/);
  assert.match(text, /elapsedMs=232000/);
  assert.match(text, /messagesBefore=4/);
  assert.match(text, /candidateLengths=\[12,0\]/);
});

test('inferErrorCode maps catalog sentences', () => {
  assert.equal(inferErrorCode(ERRORS.emptyReply('Claude')), 'emptyReply');
  assert.equal(inferErrorCode(ERRORS.noWindow('Gemini')), 'noWindow');
  assert.equal(inferErrorCode(ERRORS.appBusy('Gemini')), 'appBusy');
  assert.equal(inferErrorCode('boom'), 'error');
});

test('formatTraceRow includes the full message texts', () => {
  const line = formatTraceRow({
    elapsedMs: 2000, busy: false, via: 'idle', items: 2, chars: 20, think: 0, stable: 1, phase: 'awaiting-reply',
    texts: ['old q', 'Hello back!'],
  });
  assert.match(line, /t=2000/);
  assert.match(line, /Hello back!/);
  assert.match(line, /old q/);
});

test('formatDenials and harnessDenialLine name the harness, not macOS', () => {
  const denials = [{ tool: 'Bash', reason: 'Permission to use screencapture denied' }];
  assert.match(formatDenials('claude', denials), /code=harnessDenied/);
  assert.match(formatDenials('claude', denials), /tool=Bash/);
  const line = harnessDenialLine(denials);
  assert.match(line, /Claude Code harness denied/);
  assert.doesNotMatch(line, /System Settings/);
});
