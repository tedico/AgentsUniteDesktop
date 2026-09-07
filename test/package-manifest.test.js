import { test } from 'node:test';
import assert from 'node:assert/strict';
import { IGNORE, EXTEND_INFO, shouldIgnore } from '../scripts/package.mjs';

test('the bundle keeps src/ and vendor/, drops tests, fixtures, docs, scripts, dist, .unite, .git', () => {
  for (const keep of ['/src/main/main.js', '/src/ax/ax.jxa', '/vendor/agentsunite/lib/engine.js', '/package.json']) assert.equal(shouldIgnore(keep), false, keep);
  for (const drop of ['/test/fixtures/claude-idle.json', '/docs/probe/findings.md', '/scripts/probe.mjs', '/dist/x', '/.unite/chats/main/transcript.jsonl', '/.git/HEAD', '/engine.pin.json', '/SPRINT.md', '/node_modules/electron/index.js']) assert.equal(shouldIgnore(drop), true, drop);
  assert.ok(Array.isArray(IGNORE));
});

test('Info.plist explains the Apple Events (System Events) permission', () => {
  assert.match(EXTEND_INFO.NSAppleEventsUsageDescription, /Claude and Gemini windows/);
});
