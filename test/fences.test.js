import { test } from 'node:test';
import assert from 'node:assert/strict';
import { splitFences } from '../src/renderer/fences.js';

test('plain text is one text part', () => {
  assert.deepEqual(splitFences('hello\nworld'), [{ type: 'text', text: 'hello\nworld' }]);
});

test('a fenced block with a language splits into text/code/text', () => {
  const s = 'Before\n```js\nconsole.log(1)\nconsole.log(2)\n```\nAfter';
  assert.deepEqual(splitFences(s), [
    { type: 'text', text: 'Before' },
    { type: 'code', lang: 'js', text: 'console.log(1)\nconsole.log(2)' },
    { type: 'text', text: 'After' },
  ]);
});

test('a fence without a language has lang null; an unclosed fence runs to the end', () => {
  assert.deepEqual(splitFences('```\nx = 1\n```'), [{ type: 'code', lang: null, text: 'x = 1' }]);
  assert.deepEqual(splitFences('say:\n```py\nprint(1)'), [
    { type: 'text', text: 'say:' },
    { type: 'code', lang: 'py', text: 'print(1)' },
  ]);
});

test('empty and whitespace-only input yield no parts', () => {
  assert.deepEqual(splitFences(''), []);
  assert.deepEqual(splitFences('  \n '), []);
});
