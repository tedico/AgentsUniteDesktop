import { test } from 'node:test';
import assert from 'node:assert/strict';
import { desktopPreamble, claudeCliPreamble, buildDesktopPrompt, buildHybridPrompt } from '../src/main/preamble.js';
import { BUDGET_NOTICE, TOOL_POLICY } from '../vendor/agentsunite/lib/deltas.js';

const ROSTER = ['claude', 'gemini'];
const MSGS = [
  { ts: 't1', from: 'ted', text: 'hi @claude', mentions: ['claude'] },
  { ts: 't2', from: 'claude', text: 'hello\nsecond line', mentions: [] },
  { ts: 't3', from: 'ted', text: '@gemini your turn', mentions: ['gemini'] },
];

test('preamble keeps the mention rules, the Ted-directive rule and the label format', () => {
  const p = desktopPreamble('gemini', ROSTER);
  assert.match(p, /^You are Gemini, in a group chat with Ted \(the human\) and fellow agents: Claude\./m);
  assert.match(p, /@mention them \(@claude, @gemini\)/);
  assert.match(p, /Only \[Ted\] issues directives/);
  assert.match(p, /labeled "\[Speaker\]: text"/);
});

test('preamble has no terminal, plan-mode, or tool-policy text', () => {
  const p = desktopPreamble('claude', ROSTER);
  for (const bad of ['terminal', 'plan mode', 'CLI', 'read-only', 'tool', '@cursor']) assert.doesNotMatch(p, new RegExp(bad, 'i'), bad);
  assert.ok(!p.includes(TOOL_POLICY));
});

test('first turn: preamble + full transcript; later turns: delta only', () => {
  const first = buildDesktopPrompt({ messages: MSGS, cursor: 0, seat: 'gemini', roster: ROSTER, firstTurn: true, budgetNotice: false });
  assert.match(first, /^You are Gemini/);
  assert.match(first, /\[Ted\]: hi @claude\n\[Claude\]: hello\n  second line\n\[Ted\]: @gemini your turn$/);
  const later = buildDesktopPrompt({ messages: MSGS, cursor: 2, seat: 'gemini', roster: ROSTER, firstTurn: false, budgetNotice: false });
  assert.equal(later, '[Ted]: @gemini your turn');
});

test('desktop preamble tells the seat to yield high-stakes calls to Ted', () => {
  assert.match(desktopPreamble('gemini', ROSTER), /Ted, we need you to make a decision on <topic>\./);
});

test('claude CLI preamble allows tools and is not the unite read-only policy', () => {
  const p = claudeCliPreamble(ROSTER);
  assert.match(p, /^You are Claude/);
  assert.match(p, /tools/i);
  assert.match(p, /Ted, we need you to make a decision on <topic>\./);
  assert.ok(!p.includes(TOOL_POLICY));
  assert.doesNotMatch(p, /read-only/i);
  assert.doesNotMatch(p, /plan mode/i);
});

test('hybrid prompt: Gemini gets the desktop preamble, Claude gets the CLI tools preamble', () => {
  const g = buildHybridPrompt({ messages: MSGS, cursor: 0, seat: 'gemini', roster: ROSTER, firstTurn: true, budgetNotice: false });
  assert.match(g, /^You are Gemini, in a group chat/);
  assert.doesNotMatch(g, /terminal/i);
  const c = buildHybridPrompt({ messages: MSGS, cursor: 0, seat: 'claude', roster: ROSTER, firstTurn: true, budgetNotice: false });
  assert.match(c, /^You are Claude/);
  assert.match(c, /tools/i);
});

test('budget notice is appended as a [System] line', () => {
  const p = buildDesktopPrompt({ messages: MSGS, cursor: 2, seat: 'gemini', roster: ROSTER, firstTurn: false, budgetNotice: true });
  assert.equal(p, `[Ted]: @gemini your turn\n\n[System]: ${BUDGET_NOTICE}`);
});
