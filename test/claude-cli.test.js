import { test } from 'node:test';
import assert from 'node:assert/strict';
import { claudeCliAdapter } from '../src/adapters/claude-cli.js';

const NO_MCP_ARGS = ['--strict-mcp-config', '--mcp-config', '{"mcpServers":{}}'];

const STREAM = [
  '{"type":"system","subtype":"init","session_id":"sess-123"}',
  '{"type":"result","subtype":"success","is_error":false,"result":"hello from claude","session_id":"sess-123"}',
].join('\n') + '\n';

function fakeRun(seen) {
  return async ({ cmd, args, stdinText, onData }) => {
    seen.call = { cmd, args, stdinText };
    onData?.(STREAM, 'stdout');
    return { code: 0, stdout: STREAM, stderr: '', timedOut: false, spawnError: false };
  };
}

test('default permission mode is acceptEdits, not plan; MCP off; prompt on stdin', async () => {
  const seen = {};
  const a = claudeCliAdapter({ binary: 'claude', run: fakeRun(seen) });
  const res = await a.invoke({ prompt: 'THE DELTA', sessionRef: null });
  assert.deepEqual(res, { ok: true, replyText: 'hello from claude', sessionRef: 'sess-123' });
  assert.deepEqual(seen.call.args, [
    '-p', '--permission-mode', 'acceptEdits', '--output-format', 'stream-json', '--verbose', ...NO_MCP_ARGS,
  ]);
  assert.equal(seen.call.stdinText, 'THE DELTA');
  assert.ok(!seen.call.args.includes('plan'));
});

const DENIAL_STREAM = [
  '{"type":"system","subtype":"init","session_id":"sess-deny"}',
  '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_1","name":"Bash","input":{"command":"screencapture"}}]}}',
  '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_1","is_error":true,"content":"Permission to use Bash with screencapture has been denied by the user."}]}}',
  '{"type":"result","subtype":"success","is_error":false,"result":"I cannot take a screenshot; macOS Screen Recording is denied.","session_id":"sess-deny"}',
].join('\n') + '\n';

test('captures a harness tool denial from stream-json and still returns the reply', async () => {
  const a = claudeCliAdapter({
    run: async ({ onData }) => {
      onData?.(DENIAL_STREAM, 'stdout');
      return { code: 0, stdout: DENIAL_STREAM, stderr: '', timedOut: false, spawnError: false };
    },
  });
  const res = await a.invoke({ prompt: 'read the screen', sessionRef: null });
  assert.equal(res.ok, true);
  assert.equal(res.replyText, 'I cannot take a screenshot; macOS Screen Recording is denied.');
  assert.equal(res.sessionRef, 'sess-deny');
  assert.equal(res.denials.length, 1);
  assert.equal(res.denials[0].tool, 'Bash');
  assert.match(res.denials[0].reason, /denied/i);
});

test('rounds with no denials omit the denials list', async () => {
  const seen = {};
  const res = await claudeCliAdapter({ run: fakeRun(seen) }).invoke({ prompt: 'x', sessionRef: null });
  assert.equal(res.ok, true);
  assert.equal(res.denials, undefined);
});

test('permissionMode override and --resume / --model', async () => {
  const seen = {};
  const a = claudeCliAdapter({ binary: 'claude', model: 'opus', permissionMode: 'plan', run: fakeRun(seen) });
  await a.invoke({ prompt: 'x', sessionRef: 'sess-123' });
  assert.deepEqual(seen.call.args, [
    '-p', '--permission-mode', 'plan', '--output-format', 'stream-json', '--verbose', ...NO_MCP_ARGS,
    '--model', 'opus', '--resume', 'sess-123',
  ]);
});
