import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import claude from '../src/selectors/claude.js';
import gemini from '../src/selectors/gemini.js';
import { findNode, itemTexts } from '../src/ax/query.js';

const fixture = (name) => JSON.parse(fs.readFileSync(`test/fixtures/${name}.json`, 'utf8')).tree;
const REQUIRED = ['seat', 'appName', 'bundleId', 'file', 'manualAccessibility', 'stripCitations', 'composer', 'sendButton', 'stopButton', 'conversation', 'messageItem'];

for (const sel of [claude, gemini]) {
  test(`${sel.seat}: selector file is complete and points at itself`, () => {
    for (const k of REQUIRED) assert.ok(k in sel, `missing ${k}`);
    assert.equal(sel.file, `src/selectors/${sel.seat}.js`);
    assert.ok(fs.existsSync(sel.file));
  });

  test(`${sel.seat}: idle fixture — composer, send button, conversation found; no stop button`, () => {
    const tree = fixture(`${sel.seat}-idle`);
    assert.ok(findNode(tree, sel.composer), 'composer');
    assert.ok(findNode(tree, sel.sendButton), 'send button');
    assert.ok(findNode(tree, sel.conversation), 'conversation');
    assert.equal(findNode(tree, sel.stopButton), null, 'stop button must be absent when idle');
  });

  test(`${sel.seat}: streaming fixture — stop button present`, () => {
    const tree = fixture(`${sel.seat}-streaming`);
    const stop = findNode(tree, sel.stopButton);
    if (sel.seat === 'gemini') {
      // Probe 2026-09-06: while generating, Gemini hides Send and turns the
      // mic slot into an AXButton with description "button" and help null —
      // no "Stop" string exists in the tree. The fixture still proves a
      // generation window (Send is gone).
      assert.equal(stop, null);
      assert.equal(findNode(tree, sel.sendButton), null, 'send hidden while generating');
      return;
    }
    assert.ok(stop, 'stop button');
  });

  test(`${sel.seat}: done fixture — reply readable, conversation grew, no stop button`, () => {
    const idle = itemTexts(findNode(fixture(`${sel.seat}-idle`), sel.conversation), sel.messageItem).join('\n\n');
    const doneTree = fixture(`${sel.seat}-done`);
    const done = itemTexts(findNode(doneTree, sel.conversation), sel.messageItem).join('\n\n');
    assert.ok(done.length > idle.length, 'done conversation must be longer than idle');
    assert.equal(findNode(doneTree, sel.stopButton), null);
  });
}

test('gemini messageItem is answer static text, not thinking textareas', () => {
  const done = itemTexts(findNode(fixture('gemini-done'), gemini.conversation), gemini.messageItem);
  assert.ok(done.some((t) => /Hello! How can I help you today/.test(t)), done.join(' | '));
  assert.ok(!done.some((t) => /Show thinking/i.test(t)));
  assert.ok(!done.some((t) => /Clarifying Electron/i.test(t)));
});

test('claude needs AXManualAccessibility, gemini needs citation stripping', () => {
  assert.equal(claude.manualAccessibility, true);
  assert.equal(gemini.stripCitations, true);
  assert.equal(claude.bundleId, 'com.anthropic.claudefordesktop');
  assert.equal(gemini.bundleId, 'com.google.GeminiMacOS');
});
