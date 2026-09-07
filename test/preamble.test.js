import { test } from 'node:test';
import assert from 'node:assert/strict';
import { desktopPreamble, buildDesktopPrompt } from '../src/main/preamble.js';
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

test('budget notice is appended as a [System] line', () => {
  const p = buildDesktopPrompt({ messages: MSGS, cursor: 2, seat: 'gemini', roster: ROSTER, firstTurn: false, budgetNotice: true });
  assert.equal(p, `[Ted]: @gemini your turn\n\n[System]: ${BUDGET_NOTICE}`);
});
