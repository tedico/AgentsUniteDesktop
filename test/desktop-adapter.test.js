import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeDesktopAdapter, sessionRefFor } from '../src/adapters/desktop-adapter.js';
import { ERRORS } from '../src/shared/errors.js';
import { makeFakeHelper } from './helpers/fake-helper.js';
import { makeTree } from './helpers/trees.js';
import { TEST_SELECTORS as SEL } from './helpers/test-selectors.js';
import { makeClock } from './helpers/clock.js';

const PROMPT = '[Ted]: hello @test';
const idle = makeTree({ messages: ['old q', 'old a'] });
const streaming = makeTree({ messages: ['old q', 'old a', PROMPT, 'Hel'], busy: true });
const done = makeTree({ messages: ['old q', 'old a', PROMPT, 'Hello back!'] });

function adapter(helper, extra = {}) {
  const clock = makeClock();
  return { clock, a: makeDesktopAdapter({ seat: 'test', selectors: SEL, helper, timeoutMs: 10000, pollMs: 1000, sleep: clock.sleep, now: clock.now, ...extra }) };
}

test('happy path: set value, press send, poll until stable, return the new reply', async () => {
  const helper = makeFakeHelper({ trees: [idle, idle, streaming, done] });
  const { a } = adapter(helper);
  const evts = [];
  const res = await a.invoke({ prompt: PROMPT, sessionRef: null, onProgress: (e) => evts.push(e) });
  assert.deepEqual(res, { ok: true, replyText: 'Hello back!', sessionRef: 'desktop:test' });
  assert.deepEqual(helper.ops(), ['isRunning', 'snapshot', 'setValue', 'snapshot', 'getValue', 'press', 'snapshot', 'snapshot', 'snapshot']);
  assert.deepEqual(helper.calls[2].slice(1), [[0, 1], PROMPT]);           // composer path from the tree
  assert.deepEqual(helper.calls[5][1], [0, 2]);                           // send button path
  assert.deepEqual(evts.map((e) => e.phase), ['pasting', 'sent', 'streaming', 'streaming', 'streaming', 'done']);
  assert.ok(evts.at(-1).chars > 0);
  assert.equal(sessionRefFor('gemini'), 'desktop:gemini');
});

test('sessionRef is constant even on failure so the engine never warns about a missing one', async () => {
  const res = await adapter(makeFakeHelper({ running: false })).a.invoke({ prompt: PROMPT });
  assert.equal(res.sessionRef, 'desktop:test');
});

test('app not running', async () => {
  const res = await adapter(makeFakeHelper({ running: false })).a.invoke({ prompt: PROMPT });
  assert.deepEqual(res, { ok: false, error: ERRORS.appNotRunning('TestApp'), sessionRef: 'desktop:test' });
});

test('accessibility denied and automation denied name System Settings', async () => {
  let res = await adapter(makeFakeHelper({ snapshotError: { code: 'accessibility', error: 'x' } })).a.invoke({ prompt: PROMPT });
  assert.equal(res.error, ERRORS.accessibilityDenied('TestApp'));
  res = await adapter(makeFakeHelper({ snapshotError: { code: 'automation', error: 'x' } })).a.invoke({ prompt: PROMPT });
  assert.equal(res.error, ERRORS.automationDenied('TestApp'));
});

test('no composer → no chat open', async () => {
  const noComposer = makeTree();
  noComposer.children[0].children = noComposer.children[0].children.filter((n) => n.role !== 'AXTextArea');
  const res = await adapter(makeFakeHelper({ trees: [noComposer] })).a.invoke({ prompt: PROMPT });
  assert.equal(res.error, ERRORS.noChatOpen('TestApp'));
});

test('no send button / no conversation → selectors not found, naming the selector file', async () => {
  const noSend = makeTree();
  noSend.children[0].children = noSend.children[0].children.filter((n) => n.role !== 'AXButton');
  let res = await adapter(makeFakeHelper({ trees: [noSend] })).a.invoke({ prompt: PROMPT });
  assert.equal(res.error, ERRORS.selectorsNotFound('TestApp', 'send button', SEL.file));
  const noConv = makeTree();
  noConv.children[0].children = noConv.children[0].children.filter((n) => n.description !== 'conversation');
  res = await adapter(makeFakeHelper({ trees: [noConv] })).a.invoke({ prompt: PROMPT });
  assert.equal(res.error, ERRORS.selectorsNotFound('TestApp', 'conversation area', SEL.file));
});

test('composer path is re-found after write so a mutated AX tree still verifies and sends', async () => {
  const shifted = makeTree({ messages: ['old q', 'old a'], composerValue: PROMPT, shiftComposer: true });
  const helper = makeFakeHelper({
    trees: [idle, shifted, streaming, done],
    staleComposerPathAfterWrite: true,
  });
  const res = await adapter(helper).a.invoke({ prompt: PROMPT });
  assert.equal(res.ok, true, res.error);
  assert.equal(res.replyText, 'Hello back!');
  const get = helper.calls.find((c) => c[0] === 'getValue');
  assert.deepEqual(get[1], [0, 2], 'holds() must use the post-write composer path, not [0, 1]');
  assert.ok(helper.ops().includes('press'), 'send must be pressed after a successful holds()');
});

test('direct value set that does not stick falls back to the clipboard paste', async () => {
  const helper = makeFakeHelper({ trees: [idle, idle, done], directSetSticks: false });
  const res = await adapter(helper).a.invoke({ prompt: PROMPT });
  assert.equal(res.ok, true);
  const ops = helper.ops();
  assert.ok(ops.indexOf('paste') > ops.indexOf('setValue'));
  assert.equal(helper.calls.find((c) => c[0] === 'paste')[2], PROMPT);
});

test('neither set nor paste lands → message box error', async () => {
  const helper = makeFakeHelper({ trees: [idle], directSetSticks: false, pasteResult: { ok: false, code: 'script', error: 'nope' } });
  const res = await adapter(helper).a.invoke({ prompt: PROMPT });
  assert.equal(res.error, ERRORS.selectorsNotFound('TestApp', 'message box (text did not land)', SEL.file));
  assert.ok(!helper.ops().includes('press'));
});

test('app already generating: waits for idle first, then proceeds', async () => {
  const busyIdle = makeTree({ messages: ['old q', 'old a'], busy: true });
  const helper = makeFakeHelper({ trees: [busyIdle, busyIdle, idle, idle, idle, done] });
  const res = await adapter(helper).a.invoke({ prompt: PROMPT });
  assert.equal(res.ok, true);
  assert.equal(res.replyText, 'Hello back!');
});

test('app busy past the deadline → appBusy', async () => {
  const busyIdle = makeTree({ busy: true });
  const res = await adapter(makeFakeHelper({ trees: [busyIdle] }), { timeoutMs: 3000 }).a.invoke({ prompt: PROMPT });
  assert.equal(res.error, ERRORS.appBusy('TestApp'));
});

test('reply never settles → replyTimedOut with the timeout in seconds', async () => {
  const res = await adapter(makeFakeHelper({ trees: [idle, idle, streaming] }), { timeoutMs: 5000 }).a.invoke({ prompt: PROMPT });
  assert.equal(res.error, ERRORS.replyTimedOut('TestApp', 5));
});

test('skip: an aborted signal stops polling and leaves the app alone', async () => {
  const ac = new AbortController();
  const helper = makeFakeHelper({ trees: [idle, idle, streaming], onSnapshot: (n) => { if (n === 3) ac.abort(); } });
  const res = await adapter(helper).a.invoke({ prompt: PROMPT, signal: ac.signal });
  assert.equal(res.ok, false);
  assert.equal(res.error, 'skipped');
  assert.equal(helper.ops().filter((o) => o === 'press').length, 1, 'no second press (no stop button pressed)');
  assert.equal(helper.ops().at(-1), 'snapshot');
});

test('finished but nothing new → emptyReply', async () => {
  const same = makeTree({ messages: ['old q', 'old a', PROMPT] });
  const res = await adapter(makeFakeHelper({ trees: [idle, idle, same, same] })).a.invoke({ prompt: PROMPT });
  assert.equal(res.error, ERRORS.emptyReply('TestApp'));
});

test('citations stripped when the selector file asks for it; manual accessibility enabled when asked', async () => {
  const withCites = makeTree({ messages: [PROMPT, 'Paris[span_0](start_span) is nice(end_span).'] });
  const helper = makeFakeHelper({ trees: [makeTree(), makeTree(), withCites] });
  const sel = { ...SEL, stripCitations: true, manualAccessibility: true };
  const res = await adapter(helper, { selectors: sel }).a.invoke({ prompt: PROMPT });
  assert.equal(res.replyText, 'Paris is nice.');
  assert.equal(helper.ops()[1], 'manualA11y');
});

test('press failure is described', async () => {
  const helper = makeFakeHelper({ trees: [idle], pressResult: { ok: false, code: 'script', error: 'no AXPress' } });
  const res = await adapter(helper).a.invoke({ prompt: PROMPT });
  assert.match(res.error, /TestApp: accessibility call failed — no AXPress/);
});
