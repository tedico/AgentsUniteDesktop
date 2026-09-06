import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

// vendor/ is committed. If someone bumps engine.pin.json without re-running
// npm run vendor:engine (or vice versa), this is the test that says so.
const pin = JSON.parse(fs.readFileSync('engine.pin.json', 'utf8'));

test('vendor/agentsunite matches engine.pin.json', () => {
  assert.equal(fs.readFileSync('vendor/agentsunite/COMMIT', 'utf8').trim(), pin.commit);
  for (const mod of pin.modules) assert.ok(fs.existsSync(`vendor/agentsunite/${mod}`), `${mod} missing — run npm run vendor:engine`);
});

test('vendored engine exports what the desktop app imports', async () => {
  const engine = await import('../vendor/agentsunite/lib/engine.js');
  for (const name of ['runRound', 'RoundControl', 'endPlanning']) assert.equal(typeof engine[name], 'function', name);
  const transcript = await import('../vendor/agentsunite/lib/transcript.js');
  for (const name of ['appendMessage', 'readTranscript', 'loadState', 'saveState', 'appendRoundError']) assert.equal(typeof transcript[name], 'function', name);
  const deltas = await import('../vendor/agentsunite/lib/deltas.js');
  assert.equal(typeof deltas.renderLines, 'function');
  assert.equal(typeof deltas.BUDGET_NOTICE, 'string');
  const paths = await import('../vendor/agentsunite/lib/paths.js');
  assert.equal(typeof paths.ensureChat, 'function');
  const config = await import('../vendor/agentsunite/lib/config.js');
  assert.equal(config.DEFAULT_CONFIG.turnCap, 8);
  assert.equal(config.DEFAULT_CONFIG.timeoutMs, 300000);
  const cli = await import('../vendor/agentsunite/lib/cli.js');
  assert.equal(typeof cli.parsePlanCommand, 'function');
});
