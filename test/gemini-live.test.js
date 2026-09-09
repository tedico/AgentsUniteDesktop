import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { findNode, itemTexts } from '../src/ax/query.js';
import gemini from '../src/selectors/gemini.js';

// Captured live 2026-09-08 21:29 while Gemini's full reply was on screen and the
// adapter had just timed out reading it (59 polls, items=0). Gemini exposed the
// reply as an AXButton whose value is the text; the only AXStaticText desc="text"
// nodes were the "Show thinking" label and an empty window-level node.
const live = JSON.parse(fs.readFileSync(new URL('./fixtures/gemini-reply-as-button.json', import.meta.url))).tree;

test('Gemini live tree: a reply exposed as an AXButton value is a message item', () => {
  const items = itemTexts(findNode(live, gemini.conversation), gemini.messageItem);
  assert.ok(items.some((t) => t.includes('This is a redacted reply.')), `reply missing; items=${JSON.stringify(items.map((t) => t.slice(0, 40)))}`);
  assert.ok(items.every((t) => !t.includes('Show thinking')), 'thinking label must not be a message');
});
