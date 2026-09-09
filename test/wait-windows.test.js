import { test } from 'node:test';
import assert from 'node:assert/strict';
import { waitForWindows } from '../src/ax/wait.js';
import { makeClock } from './helpers/clock.js';

test('waitForWindows returns the first non-zero count', async () => {
  const clock = makeClock();
  let n = 0;
  const r = await waitForWindows({
    probe: async () => {
      n++;
      if (n < 3) return { ok: true, count: 0, minimized: 0, frontmost: false };
      return { ok: true, count: 1, minimized: 0, frontmost: true };
    },
    waitMs: 5000,
    pollMs: 200,
    sleep: clock.sleep,
    now: clock.now,
  });
  assert.equal(r.count, 1);
  assert.equal(n, 3);
});

test('waitForWindows stops on a hard helper error', async () => {
  const clock = makeClock();
  const r = await waitForWindows({
    probe: async () => ({ ok: false, code: 'automation', error: 'x' }),
    waitMs: 5000,
    pollMs: 200,
    sleep: clock.sleep,
    now: clock.now,
  });
  assert.deepEqual(r, { ok: false, code: 'automation', error: 'x' });
});

test('waitForWindows returns the last zero-count result at the deadline', async () => {
  const clock = makeClock();
  const r = await waitForWindows({
    probe: async () => ({ ok: true, count: 0, minimized: 0, frontmost: false, activate: { attempted: true, succeeded: false, error: null } }),
    waitMs: 400,
    pollMs: 200,
    sleep: clock.sleep,
    now: clock.now,
  });
  assert.equal(r.ok, true);
  assert.equal(r.count, 0);
});
