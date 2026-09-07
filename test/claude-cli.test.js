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

test('permissionMode override and --resume / --model', async () => {
  const seen = {};
  const a = claudeCliAdapter({ binary: 'claude', model: 'opus', permissionMode: 'plan', run: fakeRun(seen) });
  await a.invoke({ prompt: 'x', sessionRef: 'sess-123' });
  assert.deepEqual(seen.call.args, [
    '-p', '--permission-mode', 'plan', '--output-format', 'stream-json', '--verbose', ...NO_MCP_ARGS,
    '--model', 'opus', '--resume', 'sess-123',
  ]);
});
