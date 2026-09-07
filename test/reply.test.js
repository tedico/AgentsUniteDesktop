import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractReply } from '../src/adapters/reply.js';

const P = '[Ted]: hello @claude, what time is it?';

test('per-bubble: new bubbles after our echoed prompt are the reply', () => {
  const before = ['earlier question', 'earlier answer'];
  const after = [...before, P, 'It is noon.'];
  assert.equal(extractReply({ before, after, prompt: P }), 'It is noon.');
});

test('per-bubble: several new bubbles are joined with a blank line; blanks dropped', () => {
  const after = [P, 'First part.', '', 'Second part.'];
  assert.equal(extractReply({ before: [], after, prompt: P }), 'First part.\n\nSecond part.');
});

test('per-bubble: an echo that got truncated by the app still counts as the echo', () => {
  const longPrompt = 'x'.repeat(200);
  const after = [longPrompt.slice(0, 120), 'reply'];
  assert.equal(extractReply({ before: [], after, prompt: longPrompt }), 'reply');
});

test('single blob: prefix diff, then the echoed prompt stripped', () => {
  const before = ['Q1\nA1'];
  const after = [`Q1\nA1\n${P}\nIt is noon.`];
  assert.equal(extractReply({ before, after, prompt: P }), 'It is noon.');
});

test('single blob: a re-rendered last bubble still yields only the new tail', () => {
  const before = ['Q1\nA1 (draft)'];
  const after = [`Q1\nA1 (final)\n${P}\nIt is noon.`];
  assert.equal(extractReply({ before, after, prompt: P }), 'It is noon.');
});

test('nothing new → empty string', () => {
  assert.equal(extractReply({ before: ['a'], after: ['a'], prompt: P }), '');
  assert.equal(extractReply({ before: ['a', 'b'], after: ['a'], prompt: P }), '');
  assert.equal(extractReply({ before: [], after: [P], prompt: P }), '');
});

test('per-bubble: Gemini — prefix on the echoed prompt is still the echo', () => {
  const after = [`Gemini — ${P}`, 'Hello @claude! I\'m online now. Great to meet you.'];
  assert.equal(extractReply({ before: [], after, prompt: P }), 'Hello @claude! I\'m online now. Great to meet you.');
});

test('per-bubble: Gemini — prefix plus truncated ellipsis and Ask Gemini chrome still drops the echo', () => {
  const prompt = 'You are Gemini, in a group chat with Ted (the human) and fellow agents: Claude.\nHouse rules: be concise.';
  const echo = 'Gemini — You are Gemini, in a group chat with Ted (the human) and fel…\nAsk Gemini';
  const after = [echo, 'Hello @claude! I\'m online now. Great to meet you.'];
  assert.equal(extractReply({ before: [], after, prompt }), 'Hello @claude! I\'m online now. Great to meet you.');
});

test('code blocks survive as text', () => {
  const reply = 'Here:\n```js\nconsole.log(1)\n```';
  assert.equal(extractReply({ before: [], after: [P, reply], prompt: P }), reply);
});
