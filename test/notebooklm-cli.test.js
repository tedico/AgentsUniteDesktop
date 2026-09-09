import { test } from 'node:test';
import assert from 'node:assert/strict';
import { notebooklmCliAdapter } from '../src/adapters/notebooklm-cli.js';
import { ERRORS } from '../src/shared/errors.js';

const ASK = {
  answer: 'The directory is src/ and test/. [1]',
  conversation_id: 'conv-99',
  references: [{ source_id: 'src_1' }],
};

function fakeRun(seen, { stdout = JSON.stringify(ASK), stderr = '', code = 0, spawnError = false } = {}) {
  return async ({ cmd, args, stdinText }) => {
    seen.call = { cmd, args, stdinText };
    return { code, stdout, stderr, timedOut: false, spawnError };
  };
}

test('ask --json with notebook id, prompt on stdin, conversation id as sessionRef', async () => {
  const seen = {};
  const a = notebooklmCliAdapter({ notebookId: 'nb-1', run: fakeRun(seen) });
  const res = await a.invoke({ prompt: 'what is the tree?', sessionRef: null });
  assert.deepEqual(res, { ok: true, replyText: ASK.answer, sessionRef: 'conv-99' });
  assert.equal(seen.call.args.includes('--new'), false);
  assert.deepEqual(seen.call.args.slice(0, 6), ['ask', '--json', '-n', 'nb-1', '--prompt-file', '-']);
  assert.equal(seen.call.stdinText, 'what is the tree?');
});

test('resumes with -c when sessionRef is present', async () => {
  const seen = {};
  await notebooklmCliAdapter({ notebookId: 'nb-1', run: fakeRun(seen) }).invoke({ prompt: 'more', sessionRef: 'conv-99' });
  const i = seen.call.args.indexOf('-c');
  assert.ok(i >= 0);
  assert.equal(seen.call.args[i + 1], 'conv-99');
});

test('--new is omitted unless allowNew is explicitly true, and then -y is required', async () => {
  const seen = {};
  await notebooklmCliAdapter({ notebookId: 'nb-1', allowNew: true, run: fakeRun(seen) }).invoke({ prompt: 'x' });
  assert.ok(seen.call.args.includes('--new'));
  assert.ok(seen.call.args.includes('-y'));
});

test('expired session is notebooklm login, never a generic empty reply', async () => {
  const a = notebooklmCliAdapter({
    notebookId: 'nb-1',
    run: fakeRun({}, { code: 1, stdout: '', stderr: 'Not authenticated. Run notebooklm login.' }),
  });
  const res = await a.invoke({ prompt: 'x' });
  assert.equal(res.ok, false);
  assert.equal(res.error, ERRORS.notebooklmLogin());
  assert.equal(res.errorCode, 'notebooklmLogin');
});
