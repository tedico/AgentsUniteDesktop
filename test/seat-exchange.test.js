import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runRound, RoundControl } from '../vendor/agentsunite/lib/engine.js';
import { readTranscript } from '../vendor/agentsunite/lib/transcript.js';
import { buildHybridPrompt, CLOSE_LINE } from '../src/main/preamble.js';
import { withHandBacks } from '../src/main/handback-adapter.js';

const CONFIG = { roster: ['claude', 'gemini'], turnCap: 4, planner: 'claude' };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'unite-exchange-'));
const ui = { startStatus: () => ({ update() {}, stop() {} }), printReply() {}, printSystem() {} };

function seat(name, replies) {
  const calls = [];
  return {
    calls,
    adapter: {
      seat: name,
      async invoke(args) { calls.push(args); return { ok: true, replyText: replies.shift() ?? `${name} ok`, sessionRef: `s:${name}` }; },
    },
  };
}

async function round(dir, adapters, humanText, extra = {}) {
  await runRound({ dir, adapters: withHandBacks(adapters, dir, CONFIG), config: CONFIG, ui, control: new RoundControl(), buildPrompt: buildHybridPrompt, humanText, ...extra });
  return readTranscript(dir).filter((m) => CONFIG.roster.includes(m.from));
}

test('@claude with a hand-off: three turns, Claude closes under the close instruction', async () => {
  const dir = tmp();
  const claude = seat('claude', ['Mostly. @gemini does the prior hold?', 'Closing for Ted.']);
  const gemini = seat('gemini', ['It holds, Claude.']);
  const turns = await round(dir, { claude: claude.adapter, gemini: gemini.adapter }, '@claude is the math sound?');
  assert.deepEqual(turns.map((m) => m.from), ['claude', 'gemini', 'claude']);
  assert.equal(turns[1].text, 'It holds, Claude.\n\n— over to @claude');
  assert.ok(claude.calls[1].prompt.endsWith(CLOSE_LINE));
  assert.deepEqual(turns[2].mentions, []);
});

test('@claude without a hand-off: one turn', async () => {
  const dir = tmp();
  const claude = seat('claude', ['Done: 42.']);
  const gemini = seat('gemini', []);
  const turns = await round(dir, { claude: claude.adapter, gemini: gemini.adapter }, '@claude what is the answer?');
  assert.deepEqual(turns.map((m) => m.from), ['claude']);
  assert.equal(gemini.calls.length, 0);
});

test('@gemini: one turn, no hand-back', async () => {
  const dir = tmp();
  const claude = seat('claude', []);
  const gemini = seat('gemini', ['Four.']);
  const turns = await round(dir, { claude: claude.adapter, gemini: gemini.adapter }, '@gemini what is 2+2?');
  assert.deepEqual(turns.map((m) => m.from), ['gemini']);
  assert.equal(turns[0].text, 'Four.');
  assert.equal(claude.calls.length, 0);
});

test('@all: two turns, no synthetic close', async () => {
  const dir = tmp();
  const claude = seat('claude', ['Mine.']);
  const gemini = seat('gemini', ['And mine.']);
  const turns = await round(dir, { claude: claude.adapter, gemini: gemini.adapter }, '@all thoughts?');
  assert.deepEqual(turns.map((m) => m.from), ['claude', 'gemini']);
  assert.equal(turns[1].text, 'And mine.');
  assert.equal(claude.calls.length, 1);
});

test('planning mode: plain text goes to Claude, and the hand-off still closes', async () => {
  const dir = tmp();
  const claude = seat('claude', ['Proposal. @gemini review?', 'Closing.']);
  const gemini = seat('gemini', ['Looks right, Claude.']);
  const turns = await round(dir, { claude: claude.adapter, gemini: gemini.adapter }, 'design the thing', { planStart: true, planner: 'claude' });
  assert.deepEqual(turns.map((m) => m.from), ['claude', 'gemini', 'claude']);
  assert.equal(turns[1].text, 'Looks right, Claude.\n\n— over to @claude');
});

test('cap 4: a second hand-off runs a fourth turn and stops there without a hand-back line', async () => {
  const dir = tmp();
  const claude = seat('claude', ['Q1 @gemini?', 'Follow-up @gemini?']);
  const gemini = seat('gemini', ['A1.', 'A2.']);
  const turns = await round(dir, { claude: claude.adapter, gemini: gemini.adapter }, '@claude go');
  assert.deepEqual(turns.map((m) => m.from), ['claude', 'gemini', 'claude', 'gemini']);
  assert.equal(turns[3].text, 'A2.');           // final turn: no hand-back appended
  assert.equal(claude.calls.length, 2);
});
