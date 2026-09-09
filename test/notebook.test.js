import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { groundRound, isNotebooklmAuthError, loadNotebookSession } from '../src/main/notebook.js';
import { ERRORS } from '../src/shared/errors.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'unite-nb-'));

test('isNotebooklmAuthError matches login/auth lapses only', () => {
  assert.equal(isNotebooklmAuthError('Not authenticated. Run notebooklm login.'), true);
  assert.equal(isNotebooklmAuthError('storage_state.json is invalid'), true);
  assert.equal(isNotebooklmAuthError('The directory is src/'), false);
});

test('groundRound persists conversation id and returns the answer', async () => {
  const dir = tmp();
  const ask = async ({ sessionRef }) => {
    assert.equal(sessionRef, null);
    return { ok: true, replyText: 'tree [1]', sessionRef: 'conv-1' };
  };
  const g = await groundRound({ question: 'tree?', dir, notebookId: 'nb-1', ask });
  assert.deepEqual(g, { ok: true, text: 'tree [1]', sessionRef: 'conv-1' });
  assert.deepEqual(loadNotebookSession(dir), { sessionRef: 'conv-1', notebookId: 'nb-1' });
  const ask2 = async ({ sessionRef }) => {
    assert.equal(sessionRef, 'conv-1');
    return { ok: true, replyText: 'more [2]', sessionRef: 'conv-1' };
  };
  await groundRound({ question: 'more?', dir, notebookId: 'nb-1', ask: ask2 });
});

test('groundRound passes through a login error', async () => {
  const dir = tmp();
  const g = await groundRound({
    question: 'x', dir, notebookId: 'nb-1',
    ask: async () => ({ ok: false, error: ERRORS.notebooklmLogin(), errorCode: 'notebooklmLogin' }),
  });
  assert.equal(g.ok, false);
  assert.equal(g.error, ERRORS.notebooklmLogin());
});
