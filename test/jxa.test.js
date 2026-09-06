import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runJxa, classify, AX_SCRIPT } from '../src/ax/jxa.js';

test('classify maps the macOS permission errors', () => {
  assert.equal(classify('execution error: Not authorized to send Apple events to System Events. (-1743)'), 'automation');
  assert.equal(classify('osascript is not allowed assistive access. (-25211)'), 'accessibility');
  assert.equal(classify('System Events got an error: osascript is not allowed to send keystrokes. (1002)'), 'accessibility');
  assert.equal(classify('SyntaxError: Unexpected token'), 'script');
});

test('runJxa passes the command in argv and the text in AX_TEXT, returns the printed JSON', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unite-jxa-'));
  const script = path.join(dir, 'echo.jxa');
  fs.writeFileSync(script, `
    ObjC.import('Foundation');
    function run(argv) {
      var t = $.NSProcessInfo.processInfo.environment.objectForKey('AX_TEXT');
      return JSON.stringify({ ok: true, cmd: JSON.parse(argv[0]), text: t.isNil() ? null : ObjC.unwrap(t) });
    }`);
  const r = await runJxa({ scriptPath: script, command: { op: 'ping', n: 1 }, text: 'héllo\nworld' });
  assert.deepEqual(r, { ok: true, cmd: { op: 'ping', n: 1 }, text: 'héllo\nworld' });
});

test('runJxa turns a script error into { ok:false, code:"script" }', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unite-jxa-'));
  const script = path.join(dir, 'boom.jxa');
  fs.writeFileSync(script, 'function run() { throw new Error("kaboom"); }');
  const r = await runJxa({ scriptPath: script, command: { op: 'x' } });
  assert.equal(r.ok, false);
  assert.equal(r.code, 'script');
  assert.match(r.error, /kaboom/);
});

test('runJxa times out', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'unite-jxa-'));
  const script = path.join(dir, 'slow.jxa');
  fs.writeFileSync(script, 'ObjC.import("Foundation"); function run() { $.NSThread.sleepForTimeInterval(5); return "{}"; }');
  const r = await runJxa({ scriptPath: script, command: { op: 'x' }, timeoutMs: 300 });
  assert.deepEqual(r, { ok: false, code: 'timeout', error: 'osascript exceeded 300ms' });
});

test('the real script file exists and declares run()', () => {
  assert.match(fs.readFileSync(AX_SCRIPT, 'utf8'), /function run\(argv\)/);
});
