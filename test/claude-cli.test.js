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

// Regression, observed live 2026-09-09: the seat searched a notebook whose
// content quoted the chat house rules ("...grant a high-stakes permission...").
// The tool call SUCCEEDED; only its content held the word. Flagging that as a
// denial writes notebook text to errors.log and injects a false
// "harness denied a tool" line into the transcript.
const INNOCENT_STREAM = [
  '{"type":"system","subtype":"init","session_id":"sess-ok"}',
  '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_9","name":"Bash","input":{"command":"notebooklm search"}}]}}',
  '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_9","content":"Matched: 00000000-0000-4000-8000-000000000000 (Example notebook)\\nIf you need Ted to decide or grant a high-stakes permission, say so."}]}}',
  '{"type":"result","subtype":"success","is_error":false,"result":"Found it.","session_id":"sess-ok"}',
].join('\n') + '\n';

test('a successful tool result is not a denial just because its text says "permission"', async () => {
  const a = claudeCliAdapter({
    run: async ({ onData }) => {
      onData?.(INNOCENT_STREAM, 'stdout');
      return { code: 0, stdout: INNOCENT_STREAM, stderr: '', timedOut: false, spawnError: false };
    },
  });
  const res = await a.invoke({ prompt: 'search the notebook', sessionRef: null });
  assert.equal(res.ok, true);
  assert.equal(res.replyText, 'Found it.');
  assert.equal(res.denials, undefined);
});

// The real denial that arrived at 00:01:41 carried neither "denied" nor
// "permission" — is_error alone must be enough to catch it.
const WORKDIR_DENIAL_STREAM = [
  '{"type":"system","subtype":"init","session_id":"sess-wd"}',
  '{"type":"assistant","message":{"content":[{"type":"tool_use","id":"toolu_3","name":"Bash","input":{"command":"ls ~/Projekts"}}]}}',
  '{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"toolu_3","is_error":true,"content":"ls in \'~/Projekts\' was blocked. For security, Claude Code may only list files in the allowed working directories for this session."}]}}',
  '{"type":"result","subtype":"success","is_error":false,"result":"Blocked.","session_id":"sess-wd"}',
].join('\n') + '\n';

test('captures a denial whose text contains neither "denied" nor "permission"', async () => {
  const a = claudeCliAdapter({
    run: async ({ onData }) => {
      onData?.(WORKDIR_DENIAL_STREAM, 'stdout');
      return { code: 0, stdout: WORKDIR_DENIAL_STREAM, stderr: '', timedOut: false, spawnError: false };
    },
  });
  const res = await a.invoke({ prompt: 'list projects', sessionRef: null });
  assert.equal(res.ok, true);
  assert.equal(res.denials.length, 1);
  assert.equal(res.denials[0].tool, 'Bash');
  assert.match(res.denials[0].reason, /was blocked/);
});
