import { test } from 'node:test';
import assert from 'node:assert/strict';
import { clampStatus } from '../src/cli/ui.js';

test('clampStatus fits one terminal row so \\r\\x1b[2K can clear it', () => {
  const long = 'x'.repeat(120);
  assert.equal(clampStatus(long, 75).length, 74);
  assert.equal(clampStatus('short', 75), 'short');
  assert.equal(clampStatus(long, undefined).length, 79);
});
