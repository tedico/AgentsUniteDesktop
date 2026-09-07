import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { makeRelay } from '../src/main/relay.js';
import { readTranscript, loadState } from '../vendor/agentsunite/lib/transcript.js';
import { PLAN_USAGE } from '../vendor/agentsunite/lib/cli.js';

const CONFIG = { roster: ['claude', 'gemini'], turnCap: 8, timeoutMs: 1000, binaries: {}, models: {}, planner: 'claude' };
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'unite-relay-'));
const tick = () => new Promise((r) => setImmediate(r));

function fakeAdapter(seat, replies = []) {
  const calls = [];
  return {
    seat, calls,
    async invoke({ prompt, sessionRef, signal, onProgress }) {
      calls.push({ prompt, sessionRef });
      onProgress?.({ ts: Date.now(), phase: 'streaming', chars: 12 });
      return replies.shift() ?? { ok: true, replyText: `${seat} says ok`, sessionRef: `desktop:${seat}` };
    },
  };
}

function setup(adapters, config = CONFIG) {
  const dir = tmp();
  const events = [];
  const relay = makeRelay({ dir, adapters, config, emit: (e) => events.push(e) });
  return { dir, events, relay, types: () => events.map((e) => e.type) };
}

test('one mention: ted echo, round/turn events, reply, transcript written, desktop preamble used', async () => {
  const claude = fakeAdapter('claude');
  const { dir, events, relay, types } = setup({ claude, gemini: fakeAdapter('gemini') });
  await relay.submit('  hey @claude  ');
  // The engine stops the status (turn:end) before it prints the reply.
  assert.deepEqual(types(), ['message', 'round:start', 'turn:start', 'turn:progress', 'turn:end', 'message', 'round:end']);
  assert.equal(events[0].from, 'ted');
  assert.equal(events[0].text, 'hey @claude');
  assert.deepEqual(events[2], { type: 'turn:start', seat: 'claude', pos: 1, total: 1 });
  assert.equal(events[3].phase, 'streaming');
  assert.equal(events[3].chars, 12);
  assert.equal(typeof events[3].elapsedSec, 'number');
  assert.equal(events[5].from, 'claude');
  assert.equal(events[5].text, 'claude says ok');
  const t = readTranscript(dir);
  assert.deepEqual(t.map((m) => m.from), ['ted', 'claude']);
  assert.match(claude.calls[0].prompt, /^You are Claude, in a group chat/);
  assert.doesNotMatch(claude.calls[0].prompt, /terminal/);
  assert.equal(relay.busy, false);
});

test('no mention: recorded, no turn', async () => {
  const { dir, relay, types } = setup({ claude: fakeAdapter('claude'), gemini: fakeAdapter('gemini') });
  await relay.submit('just a note');
  assert.deepEqual(types(), ['message', 'round:start', 'round:end']);
  assert.equal(readTranscript(dir).length, 1);
});

test('hand-off: a reply mentioning the other seat crosses over; cap trips back to Ted', async () => {
  const claude = fakeAdapter('claude', [{ ok: true, replyText: 'ping @gemini', sessionRef: 'desktop:claude' }]);
  const gemini = fakeAdapter('gemini', [{ ok: true, replyText: 'pong @claude', sessionRef: 'desktop:gemini' }]);
  const { events, relay } = setup({ claude, gemini }, { ...CONFIG, turnCap: 2 });
  await relay.submit('@claude go');
  const seats = events.filter((e) => e.type === 'turn:start').map((e) => e.seat);
  assert.deepEqual(seats, ['claude', 'gemini']);
  const sys = events.filter((e) => e.type === 'message' && e.from === 'system').map((e) => e.text);
  assert.ok(sys.some((s) => /turn budget \(2\) reached/.test(s)), sys.join(' | '));
});

test('adapter failure surfaces as a system line with the catalog message', async () => {
  const claude = fakeAdapter('claude', [{ ok: false, error: 'Claude is not running. Open it, then send again.', sessionRef: 'desktop:claude' }]);
  const { events, relay } = setup({ claude, gemini: fakeAdapter('gemini') });
  await relay.submit('@claude go');
  const sys = events.find((e) => e.type === 'message' && e.from === 'system');
  assert.match(sys.text, /offline: Claude is not running/);
});

test('skip only aborts the seat whose turn it is', async () => {
  const claude = { seat: 'claude', async invoke({ signal }) { return new Promise((res) => signal.addEventListener('abort', () => res({ ok: false, error: 'skipped', sessionRef: 'desktop:claude' }))); } };
  const { dir, relay } = setup({ claude, gemini: fakeAdapter('gemini') });
  const p = relay.submit('@claude go');
  await tick();
  assert.equal(relay.activeSeat, 'claude');
  relay.skip('gemini');
  await tick();
  assert.equal(relay.busy, true, 'skipping the wrong seat is a no-op');
  relay.skip('claude');
  await p;
  const sys = readTranscript(dir).find((m) => m.from === 'system');
  assert.match(sys.text, /@claude skipped by Ted/);
});

test('a second submit during a round is refused with a system line and not recorded', async () => {
  const claude = { seat: 'claude', async invoke() { await new Promise((r) => setTimeout(r, 20)); return { ok: true, replyText: 'ok', sessionRef: 'desktop:claude' }; } };
  const { dir, events, relay } = setup({ claude, gemini: fakeAdapter('gemini') });
  const p = relay.submit('@claude one');
  await tick();
  await relay.submit('@claude two');
  await p;
  assert.equal(readTranscript(dir).filter((m) => m.from === 'ted').length, 1);
  assert.ok(events.some((e) => e.type === 'message' && e.from === 'system' && /A turn is running/.test(e.text)));
});

test('a throwing adapter becomes an offline line, not a crash', async () => {
  const claude = { seat: 'claude', async invoke() { throw new Error('boom'); } };
  const { events, relay } = setup({ claude, gemini: fakeAdapter('gemini') });
  await relay.submit('@claude go');
  assert.ok(events.some((e) => e.type === 'message' && e.from === 'system' && /offline: boom/.test(e.text)));
  assert.equal(relay.busy, false);
});

test('a throwing round is caught, reported, logged to errors.log', async () => {
  const { dir, events, relay } = setup({ claude: fakeAdapter('claude'), gemini: fakeAdapter('gemini') });
  fs.writeFileSync(path.join(dir, 'transcript.jsonl'), 'not json\n'); // readTranscript throws inside runRound
  await relay.submit('@claude go');
  assert.ok(events.some((e) => e.type === 'message' && e.from === 'system' && /Round failed/.test(e.text)));
  assert.ok(fs.existsSync(path.join(dir, 'errors.log')));
  assert.equal(relay.busy, false);
  assert.equal(events.at(-1).type, 'round:end');
});

test('/plan: usage, off when not on, start sets the planner', async () => {
  const claude = fakeAdapter('claude');
  const { dir, events, relay } = setup({ claude, gemini: fakeAdapter('gemini') });
  await relay.submit('/plan');
  assert.equal(events.at(-1).text, PLAN_USAGE);
  await relay.submit('/plan off');
  assert.match(events.at(-1).text, /was not on/);
  await relay.submit('/plan @gemini design the thing');
  assert.equal(loadState(dir, CONFIG.roster).planner, 'gemini');
  await relay.submit('/plan off');
  assert.equal(loadState(dir, CONFIG.roster).planner, null);
});

test('loadHistory emits the transcript', async () => {
  const { dir, events, relay } = setup({ claude: fakeAdapter('claude'), gemini: fakeAdapter('gemini') });
  await relay.submit('@claude hi');
  events.length = 0;
  relay.loadHistory();
  assert.equal(events[0].type, 'transcript:load');
  assert.equal(events[0].messages.length, 2);
  assert.equal(readTranscript(dir).length, 2);
});
