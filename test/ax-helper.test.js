import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeAxHelper } from '../src/ax/helper.js';

function recorder(reply = { ok: true }) {
  const calls = [];
  const run = async ({ command, text }) => { calls.push({ command, text }); return typeof reply === 'function' ? reply(command) : reply; };
  return { calls, run };
}
const B = 'com.example.app';

test('each method sends the right op; setValue/paste carry text separately', async () => {
  const { calls, run } = recorder();
  const h = makeAxHelper({ run });
  await h.enableManualAccessibility(B);
  await h.windows(B);
  await h.snapshot(B);
  await h.snapshot(B, { path: [0, 2], maxDepth: 5, maxNodes: 50 });
  await h.getValue(B, [0, 1]);
  await h.setValue(B, [0, 1], 'hello');
  await h.press(B, [0, 3]);
  await h.paste(B, [0, 1], 'pasted');
  assert.deepEqual(calls.map((c) => c.command), [
    { op: 'manualA11y', bundleId: B },
    { op: 'windows', bundleId: B },
    { op: 'snapshot', bundleId: B, path: [], maxDepth: 60, maxNodes: 6000 },
    { op: 'snapshot', bundleId: B, path: [0, 2], maxDepth: 5, maxNodes: 50 },
    { op: 'getValue', bundleId: B, path: [0, 1] },
    { op: 'setValue', bundleId: B, path: [0, 1] },
    { op: 'press', bundleId: B, path: [0, 3] },
    { op: 'paste', bundleId: B, path: [0, 1] },
  ]);
  assert.equal(calls[5].text, 'hello');
  assert.equal(calls[7].text, 'pasted');
  assert.equal(calls[0].text, '');
});

test('isRunning is a boolean and false on any failure', async () => {
  assert.equal(await makeAxHelper({ run: async () => ({ ok: true, running: true }) }).isRunning(B), true);
  assert.equal(await makeAxHelper({ run: async () => ({ ok: true, running: false }) }).isRunning(B), false);
  assert.equal(await makeAxHelper({ run: async () => ({ ok: false, code: 'automation', error: 'x' }) }).isRunning(B), false);
});

test('failures pass through untouched so callers can describe them', async () => {
  const h = makeAxHelper({ run: async () => ({ ok: false, code: 'accessibility', error: 'denied' }) });
  assert.deepEqual(await h.snapshot(B), { ok: false, code: 'accessibility', error: 'denied' });
});
