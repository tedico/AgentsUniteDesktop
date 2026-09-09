import { test } from 'node:test';
import assert from 'node:assert/strict';
import { currentRound, lastSeatTurn, seatTurnCount, tedMessage } from '../src/main/round.js';

const ROSTER = ['claude', 'gemini'];
const m = (from, text, mentions = []) => ({ ts: 't', from, text, mentions });

test('currentRound: messages after the last ted message; empty when ted is last or absent', () => {
  const msgs = [m('ted', 'a', ['claude']), m('claude', 'b'), m('ted', 'c', ['claude']), m('claude', 'd', ['gemini']), m('gemini', 'e')];
  assert.deepEqual(currentRound(msgs).map((x) => x.text), ['d', 'e']);
  assert.deepEqual(currentRound([m('ted', 'a')]), []);
  assert.deepEqual(currentRound([]), []);
  assert.deepEqual(currentRound([m('claude', 'x')]).map((x) => x.text), ['x']);
});

test('lastSeatTurn skips system lines and ignores non-roster speakers', () => {
  const round = [m('claude', 'd', ['gemini']), m('system', 'harness denied a tool'), m('cursor', 'z')];
  assert.equal(lastSeatTurn(round, ROSTER).from, 'claude');
  assert.equal(lastSeatTurn([m('system', 's')], ROSTER), null);
  assert.equal(lastSeatTurn([], ROSTER), null);
});

test('seatTurnCount counts only roster seats', () => {
  const round = [m('claude', 'd'), m('system', 's'), m('gemini', 'e'), m('claude', 'f')];
  assert.equal(seatTurnCount(round, ROSTER), 3);
  assert.equal(seatTurnCount([], ROSTER), 0);
});

test('tedMessage returns the last ted message or null', () => {
  const msgs = [m('ted', 'a', ['claude']), m('claude', 'b'), m('ted', 'c', ['gemini'])];
  assert.deepEqual(tedMessage(msgs).mentions, ['gemini']);
  assert.equal(tedMessage([m('claude', 'b')]), null);
});
