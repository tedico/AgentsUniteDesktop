import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { withHandBack, withHandBacks, HAND_BACK } from '../src/main/handback-adapter.js';
import { withErrorLog } from '../src/main/log-adapter.js';
import { appendMessage } from '../vendor/agentsunite/lib/transcript.js';

const ROSTER = ['claude', 'gemini'];
const OPTS = { turnCap: 4, roster: ROSTER };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'unite-handback-'));
const say = (dir, from, text, mentions = []) => appendMessage(dir, { ts: new Date().toISOString(), from, text, mentions });

function gemini(replyText, extra = {}) {
  const calls = [];
  return {
    calls,
    adapter: {
      seat: 'gemini',
      async invoke(args) { calls.push(args); return { ok: true, replyText, sessionRef: 'desktop:gemini', ...extra }; },
    },
  };
}

test('appends the hand-back when Gemini answered a Claude hand-off and named nobody', async () => {
  const dir = tmp();
  say(dir, 'ted', '@claude is the math sound?', ['claude']);
  say(dir, 'claude', 'Mostly. @gemini does the prior hold?', ['gemini']);
  const g = gemini('It holds, Claude.  \n');
  const res = await withHandBack(g.adapter, dir, OPTS).invoke({ prompt: 'p', sessionRef: null });
  assert.equal(res.ok, true);
  assert.equal(res.replyText, 'It holds, Claude.\n\n— over to @claude');
  assert.equal(res.sessionRef, 'desktop:gemini');
  assert.equal(HAND_BACK('claude'), '— over to @claude');
});

test('untouched when Ted addressed Gemini directly', async () => {
  const dir = tmp();
  say(dir, 'ted', '@gemini what is 2+2?', ['gemini']);
  const res = await withHandBack(gemini('4.').adapter, dir, OPTS).invoke({ prompt: 'p', sessionRef: null });
  assert.equal(res.replyText, '4.');
});

test('untouched in an @all round (both seats were addressed)', async () => {
  const dir = tmp();
  say(dir, 'ted', '@all thoughts?', ['claude', 'gemini']);
  say(dir, 'claude', 'Mine.', []);
  const res = await withHandBack(gemini('And mine.').adapter, dir, OPTS).invoke({ prompt: 'p', sessionRef: null });
  assert.equal(res.replyText, 'And mine.');
});

test('untouched when the reply already names a seat (@claude or @all)', async () => {
  const dir = tmp();
  say(dir, 'ted', '@claude go', ['claude']);
  say(dir, 'claude', 'ping @gemini', ['gemini']);
  for (const text of ['pong @claude', 'pong @all', 'Pong, @Claude.']) {
    const res = await withHandBack(gemini(text).adapter, dir, OPTS).invoke({ prompt: 'p', sessionRef: null });
    assert.equal(res.replyText, text);
  }
});

test('untouched on the final turn under the cap', async () => {
  const dir = tmp();
  say(dir, 'ted', '@claude go', ['claude']);
  say(dir, 'claude', 'ping @gemini', ['gemini']);
  // turnCap 2: Claude was turn 1, this Gemini turn is 2 = final.
  const res = await withHandBack(gemini('pong').adapter, dir, { turnCap: 2, roster: ROSTER }).invoke({ prompt: 'p', sessionRef: null });
  assert.equal(res.replyText, 'pong');
});

test('still appended when a system line sits between the hand-off and the reply', async () => {
  const dir = tmp();
  say(dir, 'ted', '@claude go', ['claude']);
  say(dir, 'claude', 'ping @gemini', ['gemini']);
  say(dir, 'system', 'Claude Code harness denied a tool: Bash', []);
  const res = await withHandBack(gemini('pong').adapter, dir, OPTS).invoke({ prompt: 'p', sessionRef: null });
  assert.equal(res.replyText, 'pong\n\n— over to @claude');
});

test('planning-mode plain text (no mentions from Ted) still counts as a hand-off', async () => {
  const dir = tmp();
  say(dir, 'ted', 'what do you both think?', []);
  say(dir, 'claude', 'I think X. @gemini?', ['gemini']);
  const res = await withHandBack(gemini('Y.').adapter, dir, OPTS).invoke({ prompt: 'p', sessionRef: null });
  assert.equal(res.replyText, 'Y.\n\n— over to @claude');
});

test('untouched when Gemini is the first seat of the round (nobody to hand back to)', async () => {
  const dir = tmp();
  say(dir, 'ted', 'planner is gemini here', []);
  const res = await withHandBack(gemini('First.').adapter, dir, OPTS).invoke({ prompt: 'p', sessionRef: null });
  assert.equal(res.replyText, 'First.');
});

test('a failed result passes through identically', async () => {
  const dir = tmp();
  say(dir, 'ted', '@claude go', ['claude']);
  say(dir, 'claude', 'ping @gemini', ['gemini']);
  const failed = { seat: 'gemini', async invoke() { return { ok: false, error: 'boom', sessionRef: 'desktop:gemini' }; } };
  const res = await withHandBack(failed, dir, OPTS).invoke({ prompt: 'p', sessionRef: null });
  assert.deepEqual(res, { ok: false, error: 'boom', sessionRef: 'desktop:gemini' });
});

test('withHandBacks wraps only the gemini seat and tolerates its absence', async () => {
  const dir = tmp();
  say(dir, 'ted', '@claude go', ['claude']);
  say(dir, 'claude', 'ping @gemini', ['gemini']);
  const claude = { seat: 'claude', async invoke() { return { ok: true, replyText: 'c', sessionRef: 's' }; } };
  const wrapped = withHandBacks({ claude, gemini: gemini('pong').adapter }, dir, OPTS);
  assert.equal(wrapped.claude, claude);
  assert.equal((await wrapped.gemini.invoke({ prompt: 'p', sessionRef: null })).replyText, 'pong\n\n— over to @claude');
  assert.deepEqual(Object.keys(withHandBacks({ claude }, dir, OPTS)), ['claude']);
});

test('composed under withErrorLog, the trace records the raw reply length', async () => {
  const dir = tmp();
  say(dir, 'ted', '@claude go', ['claude']);
  say(dir, 'claude', 'ping @gemini', ['gemini']);
  const g = gemini('pong', { diagnostics: { promptChars: 1, replyChars: 4, polls: 1, trace: [] } });
  const res = await withErrorLog(withHandBack(g.adapter, dir, OPTS), dir).invoke({ prompt: 'p', sessionRef: null });
  assert.equal(res.replyText, 'pong\n\n— over to @claude');
  assert.equal(res.diagnostics.replyChars, 4);
});
