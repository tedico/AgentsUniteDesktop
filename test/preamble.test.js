import { test } from 'node:test';
import assert from 'node:assert/strict';
import { desktopPreamble, claudeCliPreamble, buildDesktopPrompt, buildHybridPrompt, notebookBlock, CLOSE_LINE, closeLine } from '../src/main/preamble.js';
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
  assert.match(p, /harness/i);
  assert.match(p, /not a macOS/i);
});

test('hybrid prompt: Gemini gets the desktop preamble, Claude gets the CLI tools preamble', () => {
  const g = buildHybridPrompt({ messages: MSGS, cursor: 0, seat: 'gemini', roster: ROSTER, firstTurn: true, budgetNotice: false });
  assert.match(g, /^You are Gemini, in a group chat/);
  assert.doesNotMatch(g, /terminal/i);
  const c = buildHybridPrompt({ messages: MSGS, cursor: 0, seat: 'claude', roster: ROSTER, firstTurn: true, budgetNotice: false });
  assert.match(c, /^You are Claude/);
  assert.match(c, /tools/i);
});

test('notebook context is labeled as sourced fact and keeps citations', () => {
  const block = notebookBlock('The tree is src/. [1]');
  assert.match(block, /Ted's notebook/);
  assert.match(block, /\[1\]/);
  const p = buildHybridPrompt({
    messages: MSGS, cursor: 2, seat: 'claude', roster: ROSTER, firstTurn: false, budgetNotice: false,
    notebookContext: 'The tree is src/. [1]',
  });
  assert.match(p, /\[Ted\]: @gemini your turn/);
  assert.match(p, /The tree is src\/\. \[1\]/);
  assert.match(p, /sourced fact/);
});

test('budget notice is appended as a [System] line', () => {
  const p = buildDesktopPrompt({ messages: MSGS, cursor: 2, seat: 'gemini', roster: ROSTER, firstTurn: false, budgetNotice: true });
  assert.equal(p, `[Ted]: @gemini your turn\n\n[System]: ${BUDGET_NOTICE}`);
});

test('yield line no longer forbids @mentioning a seat', () => {
  for (const p of [desktopPreamble('gemini', ROSTER), claudeCliPreamble(ROSTER)]) {
    assert.match(p, /Ted, we need you to make a decision on <topic>\./);
    assert.doesNotMatch(p, /do not @mention/i);
  }
});

test('both preambles carry the turn-taking rule and the honesty rule', () => {
  for (const p of [desktopPreamble('gemini', ROSTER), claudeCliPreamble(ROSTER)]) {
    assert.match(p, /Turn-taking: when your reply makes a claim or proposal worth a second opinion, end it by @mentioning the other seat/);
    assert.match(p, /@mention them back so they can close/);
    assert.match(p, /When you close an exchange, @mention no one\./);
    assert.match(p, /One exchange per message from Ted: hand off, get the response, close\./);
    assert.match(p, /You see only the text pasted in this chat\./);
    assert.match(p, /Do not say you have read a file, spec, or notebook source/);
  }
});

test('plain-numbers rule is in the desktop (Gemini) preamble only', () => {
  assert.match(desktopPreamble('gemini', ROSTER), /never in math formatting/);
  assert.match(desktopPreamble('gemini', ROSTER), /The relay cannot read rendered math; it arrives as blanks\./);
  assert.doesNotMatch(claudeCliPreamble(ROSTER), /math formatting/);
});

const XMSGS = [
  { ts: 'x1', from: 'ted', text: '@claude is the math sound?', mentions: ['claude'] },
  { ts: 'x2', from: 'claude', text: 'Mostly. @gemini does the prior hold?', mentions: ['gemini'] },
  { ts: 'x3', from: 'gemini', text: 'It holds, Claude.\n\n— over to @claude', mentions: ['claude'] },
];

test('close line: present when this seat already spoke this round and the latest message is a peer\'s', () => {
  assert.equal(closeLine({ messages: XMSGS, seat: 'claude', roster: ROSTER, budgetNotice: false }), CLOSE_LINE);
  const p = buildHybridPrompt({ messages: XMSGS, cursor: 2, seat: 'claude', roster: ROSTER, firstTurn: false, budgetNotice: false });
  assert.equal(p, `[Gemini]: It holds, Claude.\n  \n  — over to @claude\n\n${CLOSE_LINE}`);
  const d = buildDesktopPrompt({ messages: XMSGS, cursor: 2, seat: 'claude', roster: ROSTER, firstTurn: false, budgetNotice: false });
  assert.match(d, new RegExp(CLOSE_LINE.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '$'));
});

test('close line: absent on a first turn, absent when the budget notice is set, absent for the peer that has not spoken', () => {
  // Gemini's first turn of this round: Claude spoke, Gemini did not.
  assert.equal(closeLine({ messages: XMSGS.slice(0, 2), seat: 'gemini', roster: ROSTER, budgetNotice: false }), null);
  // Claude's first turn of a round.
  assert.equal(closeLine({ messages: XMSGS.slice(0, 1), seat: 'claude', roster: ROSTER, budgetNotice: false }), null);
  // Budget notice wins.
  assert.equal(closeLine({ messages: XMSGS, seat: 'claude', roster: ROSTER, budgetNotice: true }), null);
  const p = buildHybridPrompt({ messages: XMSGS, cursor: 2, seat: 'claude', roster: ROSTER, firstTurn: false, budgetNotice: true });
  assert.doesNotMatch(p, /Close the exchange/);
  assert.match(p, /\[System\]: Turn budget reached/);
});

test('close line: absent for Gemini in an @all round (Claude spoke first, Gemini has not)', () => {
  const all = [
    { ts: 'a1', from: 'ted', text: '@all thoughts?', mentions: ['claude', 'gemini'] },
    { ts: 'a2', from: 'claude', text: 'Mine.', mentions: [] },
  ];
  assert.equal(closeLine({ messages: all, seat: 'gemini', roster: ROSTER, budgetNotice: false }), null);
});

test('close line: notebook block comes after the close line', () => {
  const p = buildHybridPrompt({ messages: XMSGS, cursor: 2, seat: 'claude', roster: ROSTER, firstTurn: false, budgetNotice: false, notebookContext: 'Fact [1]' });
  const i = p.indexOf(CLOSE_LINE);
  const j = p.indexOf('[Notebook');
  assert.ok(i > -1 && j > i, `close at ${i}, notebook at ${j}`);
});
