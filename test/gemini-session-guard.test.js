import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resetDesktopSession } from '../src/cli/gemini-session-guard.js';

test('a desktop:gemini session is reset to no session and cursor 0, mirroring the engine self-heal', () => {
  const state = { agents: { claude: { sessionRef: 'sess-1', cursor: 40 }, gemini: { sessionRef: 'desktop:gemini', cursor: 37 } }, policyVersion: 2, planner: null };
  assert.equal(resetDesktopSession(state, 'gemini'), true);
  assert.deepEqual(state.agents.gemini, { sessionRef: null, cursor: 0 });
  assert.deepEqual(state.agents.claude, { sessionRef: 'sess-1', cursor: 40 });
  assert.equal(state.policyVersion, 2);
});

test('an Antigravity conversation id, a null session, or a fresh seat is left alone', () => {
  const agy = { agents: { gemini: { sessionRef: '1f3bbda9-7072-464a-ab62-fc540dc5ce0e', cursor: 12 } } };
  assert.equal(resetDesktopSession(agy, 'gemini'), false);
  assert.deepEqual(agy.agents.gemini, { sessionRef: '1f3bbda9-7072-464a-ab62-fc540dc5ce0e', cursor: 12 });
  const fresh = { agents: { gemini: { sessionRef: null, cursor: 0 } } };
  assert.equal(resetDesktopSession(fresh, 'gemini'), false);
  assert.deepEqual(fresh.agents.gemini, { sessionRef: null, cursor: 0 });
});

test('a missing seat entry, a missing agents map, or a non-string ref never throws and returns false', () => {
  assert.equal(resetDesktopSession({ agents: {} }, 'gemini'), false);
  assert.equal(resetDesktopSession({}, 'gemini'), false);
  assert.equal(resetDesktopSession(null, 'gemini'), false);
  assert.equal(resetDesktopSession({ agents: { gemini: { sessionRef: 42, cursor: 1 } } }, 'gemini'), false);
});

test('the seat defaults to gemini', () => {
  const state = { agents: { gemini: { sessionRef: 'desktop:gemini', cursor: 5 } } };
  assert.equal(resetDesktopSession(state), true);
  assert.deepEqual(state.agents.gemini, { sessionRef: null, cursor: 0 });
});
