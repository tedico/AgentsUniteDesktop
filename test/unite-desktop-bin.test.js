import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

test('bin/unite-desktop.js exists, is ESM, and wires the hybrid seats', () => {
  const src = fs.readFileSync('bin/unite-desktop.js', 'utf8');
  assert.match(src, /^#!/);
  assert.match(src, /claudeCliAdapter/);
  assert.match(src, /geminiDesktopAdapter/);
  assert.match(src, /acceptEdits/);
  assert.match(src, /buildHybridPrompt/);
  assert.match(src, /checkHybrid/);
  assert.match(src, /planBareMatch/);
  assert.match(src, /STARTUP_MESSAGES/);
  assert.match(src, /isGlobal/);
  assert.match(src, /syncTranscriptMarkdown/);
});

