import { test } from 'node:test';
import assert from 'node:assert/strict';
import { stripCitations } from '../src/adapters/citations.js';

test('removes start/end span markers, keeps the text between them', () => {
  const s = 'Paris is the capital[span_0](start_span) of France(end_span). Sure[span_12](start_span)ly(end_span).';
  assert.equal(stripCitations(s), 'Paris is the capital of France. Surely.');
});

test('collapses doubled spaces left behind and trims line ends', () => {
  assert.equal(stripCitations('a [span_1](start_span) (end_span) b  \nc'), 'a b\nc');
});

test('text without markers is unchanged', () => {
  const s = 'no markers here\n```js\nx = [1](2)\n```';
  assert.equal(stripCitations(s), s);
});
