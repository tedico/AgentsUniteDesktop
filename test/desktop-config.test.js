import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { desktopConfig } from '../src/cli/desktop-config.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'unite-dcfg-'));

test('desktopConfig: cap defaults to 4 with no room config, roster fixed to the two desktop seats', () => {
  const root = tmp();
  const c = desktopConfig(root);
  assert.equal(c.turnCap, 4);
  assert.deepEqual(c.roster, ['claude', 'gemini']);
  assert.equal(c.timeoutMs, 300000);
});

test('desktopConfig: a room config still overrides the cap; out-of-range values fall back to 4', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.unite'), { recursive: true });
  fs.writeFileSync(path.join(root, '.unite', 'config.json'), JSON.stringify({ turnCap: 8, timeoutMs: 60000 }));
  assert.equal(desktopConfig(root).turnCap, 8);
  assert.equal(desktopConfig(root).timeoutMs, 60000);
  fs.writeFileSync(path.join(root, '.unite', 'config.json'), JSON.stringify({ turnCap: 0 }));
  assert.equal(desktopConfig(root).turnCap, 4);
});
