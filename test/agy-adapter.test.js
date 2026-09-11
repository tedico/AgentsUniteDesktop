import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { agyAdapter } from '../vendor/agentsunite/lib/adapters/agy.js';
import { makeStub, readStubCall, stubDir } from './helpers/stub.js';

// Trimmed from a real `agy --print ... --mode plan --output-format stream-json`
// run (2026-09-06). In stream mode the reply is nested under "result".
const STREAM = [
  '{"event":"init","conversation_id":"conv-9","init":{"cwd":"/x","tools":["read_file"]}}',
  '{"event":"step_update","step_update":{"conversation_id":"conv-9","step_index":0,"state":"DONE","step_type":"user_input"}}',
  '{"event":"step_update","step_update":{"conversation_id":"conv-9","step_index":1,"state":"ACTIVE","step_type":"tool","tool_name":"read_file","tool_info":{"name":"read_file","parameters":{"path":"package.json"}}}}',
  '{"event":"step_update","step_update":{"conversation_id":"conv-9","step_index":1,"state":"DONE","step_type":"tool","tool_name":"read_file"}}',
  '{"event":"result","result":{"conversation_id":"conv-9","status":"SUCCESS","response":"gemini here","duration_seconds":12.1,"num_turns":1}}',
].join('\n') + '\n';

function makeSlowStub(dir, { stdout, delayMs }) {
  const p = path.join(dir, `stub-${Math.random().toString(36).slice(2)}`);
  fs.writeFileSync(p, `#!/usr/bin/env node
setTimeout(() => {
  process.stdout.write(${JSON.stringify(stdout)});
  process.exit(0);
}, ${delayMs});
`);
  fs.chmodSync(p, 0o755);
  return p;
}

test('first turn: prompt is the VALUE of --print (greedy-parse safe), plan mode, stream-json', async () => {
  const dir = stubDir();
  const bin = makeStub(dir, { stdout: STREAM, stderr: 'jetski: telemetry noise' });
  const a = agyAdapter({ binary: bin, timeoutMs: 5000 });
  const res = await a.invoke({ prompt: 'THE DELTA', sessionRef: null });
  assert.deepEqual(res, { ok: true, replyText: 'gemini here', sessionRef: 'conv-9' });
  assert.deepEqual(readStubCall().argv,
    ['--print', 'THE DELTA', '--mode', 'plan', '--output-format', 'stream-json']);
});

test('progress: connected → tool: read_file (count 1) → replying', async () => {
  const dir = stubDir();
  const bin = makeStub(dir, { stdout: STREAM });
  const a = agyAdapter({ binary: bin, timeoutMs: 5000 });
  const evts = [];
  await a.invoke({ prompt: 'x', sessionRef: null, onProgress: (e) => evts.push(e) });
  const phases = evts.map((e) => e.phase);
  for (const p of ['connected', 'tool: read_file', 'replying']) assert.ok(phases.includes(p), `missing phase ${p}`);
  assert.ok(phases.indexOf('connected') < phases.indexOf('tool: read_file'));
  const toolEvt = evts.find((e) => e.phase === 'tool: read_file');
  assert.deepEqual([toolEvt.lastTool, toolEvt.toolCount], ['read_file', 1]);
  // the DONE step_update for the same tool must not count it twice
  assert.equal(evts.at(-1).toolCount, 1);
});

test('later turn adds --conversation', async () => {
  const dir = stubDir();
  const bin = makeStub(dir, { stdout: STREAM });
  const a = agyAdapter({ binary: bin, timeoutMs: 5000 });
  await a.invoke({ prompt: 'x', sessionRef: 'conv-9' });
  assert.deepEqual(readStubCall().argv,
    ['--print', 'x', '--mode', 'plan', '--output-format', 'stream-json', '--conversation', 'conv-9']);
});

test('failure shapes: nonzero exit w/ session → sessionLost; garbage json → bad json', async () => {
  const dir = stubDir();
  const bad = agyAdapter({ binary: makeStub(dir, { code: 2, stderr: 'dead conv' }), timeoutMs: 5000 });
  const r1 = await bad.invoke({ prompt: 'x', sessionRef: 'conv-9' });
  assert.deepEqual({ ok: r1.ok, sessionLost: r1.sessionLost }, { ok: false, sessionLost: true });
  const garbage = agyAdapter({ binary: makeStub(dir, { stdout: 'nope' }), timeoutMs: 5000 });
  const r2 = await garbage.invoke({ prompt: 'x', sessionRef: null });
  assert.match(r2.error, /json/i);
});

test('nonzero stream-json result preserves its stdout diagnostic', async () => {
  const dir = stubDir();
  const diagnostic = 'Gemini API quota exhausted; retry later';
  const stdout = `${JSON.stringify({ event: 'result', result: { status: 'ERROR', response: diagnostic } })}\n`;
  const a = agyAdapter({ binary: makeStub(dir, { stdout, code: 1 }), timeoutMs: 5000 });
  const res = await a.invoke({ prompt: 'x', sessionRef: null });
  assert.equal(res.ok, false);
  assert.match(res.stderr, /quota exhausted/);
});

test('empty result response is an empty-reply failure', async () => {
  const dir = stubDir();
  const bin = makeStub(dir, { stdout: '{"event":"result","result":{"status":"SUCCESS","response":""}}\n' });
  const res = await agyAdapter({ binary: bin, timeoutMs: 5000 }).invoke({ prompt: 'x', sessionRef: null });
  assert.equal(res.ok, false);
  assert.match(res.error, /empty/i);
});

test('is_error result is a failure, not a reply', async () => {
  const dir = stubDir();
  const bin = makeStub(dir, { stdout: '{"event":"result","result":{"is_error":true,"response":"service unavailable"}}\n' });
  const res = await agyAdapter({ binary: bin, timeoutMs: 5000 }).invoke({ prompt: 'x', sessionRef: null });
  assert.equal(res.ok, false);
  assert.match(res.stderr, /service unavailable/);
  assert.equal('replyText' in res, false);
});

test('a leading JSON update notice does not shadow the response payload', async () => {
  const dir = stubDir();
  const bin = makeStub(dir, { stdout: `{"notice":"update available"}\n${STREAM}` });
  const a = agyAdapter({ binary: bin, timeoutMs: 5000 });
  const res = await a.invoke({ prompt: 'x', sessionRef: null });
  assert.deepEqual(res, { ok: true, replyText: 'gemini here', sessionRef: 'conv-9' });
});

test('json-mode shape (flat object) is still accepted via the fallback', async () => {
  const dir = stubDir();
  const flat = JSON.stringify({ conversation_id: 'conv-1', status: 'SUCCESS', response: 'flat reply' });
  const a = agyAdapter({ binary: makeStub(dir, { stdout: flat }), timeoutMs: 5000 });
  const res = await a.invoke({ prompt: 'x', sessionRef: null });
  assert.deepEqual(res, { ok: true, replyText: 'flat reply', sessionRef: 'conv-1' });
});

test('agy adapter adds 15000ms grace to timeoutMs', async () => {
  const dir = stubDir();
  // Child sleeps longer than timeoutMs; without the 15s --print-timeout grace
  // the adapter would SIGKILL it. With grace it must still finish.
  const bin = makeSlowStub(dir, { stdout: STREAM, delayMs: 600 });
  const a = agyAdapter({ binary: bin, timeoutMs: 150 });
  const res = await a.invoke({ prompt: 'x', sessionRef: null });
  assert.equal(res.ok, true);
  assert.equal(res.replyText, 'gemini here');
});
