import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERRORS, describeAxError } from '../src/shared/errors.js';

test('every failure message names the app and says what to do', () => {
  assert.match(ERRORS.appNotRunning('Claude'), /Claude is not running\. Open it/);
  assert.match(ERRORS.noChatOpen('Gemini'), /No chat is open in Gemini/);
  assert.match(ERRORS.accessibilityDenied('Claude'), /System Settings → Privacy & Security → Accessibility/);
  assert.match(ERRORS.automationDenied('Claude'), /System Settings → Privacy & Security → Automation/);
  assert.match(ERRORS.selectorsNotFound('Claude', 'send button', 'src/selectors/claude.js'), /send button.*src\/selectors\/claude\.js/);
  assert.match(ERRORS.replyTimedOut('Gemini', 300), /Gemini did not finish a reply within 300s/);
  assert.match(ERRORS.appBusy('Gemini'), /still generating/);
  assert.match(ERRORS.noWindow('Claude'), /full-screen on another Space/);
  assert.match(ERRORS.minimized('Claude'), /minimized to the Dock/);
  assert.match(ERRORS.emptyReply('Claude'), /no new text appeared/);
  assert.match(ERRORS.accessibilityPending(), /Privacy & Security → Accessibility/);
  assert.match(ERRORS.accessibilityPending(), /quit and reopen/);
  assert.match(ERRORS.claudeNotOnPath(), /claude is not on PATH/);
});

test('describeAxError maps helper codes to catalog messages', () => {
  assert.equal(describeAxError({ code: 'accessibility', error: 'x' }, 'Claude'), ERRORS.accessibilityDenied('Claude'));
  assert.equal(describeAxError({ code: 'automation', error: 'x' }, 'Claude'), ERRORS.automationDenied('Claude'));
  assert.equal(describeAxError({ code: 'noProcess', error: 'x' }, 'Gemini'), ERRORS.appNotRunning('Gemini'));
  assert.equal(describeAxError({ code: 'noWindow', error: 'x' }, 'Gemini'), ERRORS.noWindow('Gemini'));
  assert.match(describeAxError({ code: 'script', error: 'TypeError: nope' }, 'Claude'), /Claude: accessibility call failed — TypeError: nope/);
  assert.match(describeAxError({ code: 'timeout', error: 'osascript exceeded 20000ms' }, 'Claude'), /took too long/);
});
