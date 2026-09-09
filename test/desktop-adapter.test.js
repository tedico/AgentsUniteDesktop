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
  assert.equal(res.ok, true);
  assert.equal(res.replyText, 'Hello back!');
  assert.equal(res.sessionRef, 'desktop:test');
  assert.deepEqual(helper.ops(), ['isRunning', 'snapshot', 'setValue', 'snapshot', 'getValue', 'press', 'snapshot', 'snapshot', 'snapshot', 'snapshot']);
  assert.deepEqual(helper.calls[2].slice(1), [[0, 1], PROMPT]);           // composer path from the tree
  assert.deepEqual(helper.calls[5][1], [0, 2]);                           // send button path
  assert.deepEqual(evts.map((e) => e.phase), ['pasting', 'sent', 'streaming', 'streaming', 'streaming', 'streaming', 'done']);
  assert.ok(evts.at(-1).chars > 0);
  assert.equal(sessionRefFor('gemini'), 'desktop:gemini');
});

test('sessionRef is constant even on failure so the engine never warns about a missing one', async () => {
  const res = await adapter(makeFakeHelper({ running: false })).a.invoke({ prompt: PROMPT });
  assert.equal(res.sessionRef, 'desktop:test');
});

test('app not running', async () => {
  const res = await adapter(makeFakeHelper({ running: false })).a.invoke({ prompt: PROMPT });
  assert.equal(res.ok, false);
  assert.equal(res.error, ERRORS.appNotRunning('TestApp'));
  assert.equal(res.sessionRef, 'desktop:test');
  assert.equal(res.errorCode, 'appNotRunning');
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
  const helper = makeFakeHelper({ trees: [idle, idle, same, same] });
  const res = await adapter(helper).a.invoke({ prompt: PROMPT });
  assert.equal(res.error, ERRORS.emptyReply('TestApp', { messagesBefore: 2, messagesAfter: 3, thinkingChars: 0 }));
  assert.match(res.stderr, /code=emptyReply/);
  assert.match(res.stderr, /elapsedMs=/);
  assert.match(res.stderr, /seat=test/);
  const polls = (res.diagnostics?.trace ?? []).filter((row) => row.phase === 'awaiting-reply');
  assert.ok(polls.length >= 2, 'settle polls must be traced');
  for (let i = 1; i < polls.length; i++) {
    assert.ok(polls[i].elapsedMs >= polls[i - 1].elapsedMs, 'elapsed is monotonic');
  }
  assert.ok(polls.every((row) => row.busy === true || row.busy === false));
  assert.ok(polls.every((row) => ['stop', 'send', 'idle', 'none', 'thinking'].includes(row.via)));
  // Text rides on the rows where it changed; unchanged polls omit it.
  assert.ok(polls.some((row) => Array.isArray(row.texts)));
  assert.ok(polls.some((row) => row.texts?.includes(PROMPT)));
  assert.match(res.stderr, /old q/);
});

test('successful round attaches a poll trace for retention, not stderr', async () => {
  const helper = makeFakeHelper({ trees: [idle, idle, streaming, done] });
  const res = await adapter(helper).a.invoke({ prompt: PROMPT });
  assert.equal(res.ok, true);
  assert.equal(res.stderr, undefined);
  assert.ok(res.diagnostics?.trace?.length >= 2);
  assert.ok(res.diagnostics.trace.every((row) => typeof row.elapsedMs === 'number'));
  assert.ok(res.diagnostics.trace.some((row) => row.texts?.includes('Hello back!')));
  assert.deepEqual(helper.ops(), ['isRunning', 'snapshot', 'setValue', 'snapshot', 'getValue', 'press', 'snapshot', 'snapshot', 'snapshot', 'snapshot']);
});

test('two identical idle polls are not enough; a third is required before emptyReply', async () => {
  const same = makeTree({ messages: ['old q', 'old a', PROMPT] });
  const later = makeTree({ messages: ['old q', 'old a', PROMPT, 'Hello back!'] });
  const helper = makeFakeHelper({ trees: [idle, idle, same, same, later] });
  const res = await adapter(helper).a.invoke({ prompt: PROMPT });
  assert.equal(res.ok, true, res.error);
  assert.equal(res.replyText, 'Hello back!');
});

test('citations stripped when the selector file asks for it; manual accessibility enabled when asked', async () => {
  const withCites = makeTree({ messages: [PROMPT, 'Paris[span_0](start_span) is nice(end_span).'] });
  const helper = makeFakeHelper({ trees: [makeTree(), makeTree(), withCites] });
  const sel = { ...SEL, stripCitations: true, manualAccessibility: true };
  const res = await adapter(helper, { selectors: sel }).a.invoke({ prompt: PROMPT });
  assert.equal(res.replyText, 'Paris is nice.');
  assert.equal(helper.ops()[1], 'manualA11y');
});

test('Gemini-style: settle stays busy while Send and mic are both absent', async () => {
  const node = (role, extra = {}, children = []) => ({
    role, subrole: null, name: null, title: null, description: null, help: null, value: null, enabled: true, path: [], children, ...extra,
  });
  const assign = (n, path = []) => {
    n.path = path;
    n.children.forEach((c, i) => assign(c, [...path, i]));
    return n;
  };
  const tree = ({ messages, chrome }) => assign(node('AXApplication', {}, [
    node('AXWindow', {}, [
      node('AXGroup', { description: 'conversation' },
        messages.map((text, i) => node('AXGroup', { description: i % 2 === 0 ? 'user message' : 'assistant message' }, [node('AXStaticText', { value: text })]))),
      node('AXTextArea', { value: chrome === 'send' ? PROMPT : '', description: 'Message' }),
      chrome === 'send' ? node('AXButton', { name: 'Send', help: 'Send (return)' }) : null,
      chrome === 'mic' ? node('AXButton', { help: 'Use microphone' }) : null,
      chrome === 'busy' ? node('AXButton', { description: 'button', help: null }) : null,
    ].filter(Boolean)),
  ]));
  const sel = {
    ...SEL,
    sendButton: { role: 'AXButton', helpIncludes: 'Send' },
    stopButton: { role: 'AXButton', nameIncludes: 'Stop' },
    idleButton: { role: 'AXButton', helpIncludes: 'microphone' },
    busyWhenSendAbsent: true,
  };
  const withText = tree({ messages: ['old q', 'old a'], chrome: 'send' });
  const generating = tree({ messages: ['old q', 'old a', PROMPT], chrome: 'busy' });
  const finished = tree({ messages: ['old q', 'old a', PROMPT, 'Hello back!'], chrome: 'mic' });
  const helper = makeFakeHelper({ trees: [withText, withText, generating, generating, generating, finished] });
  const res = await adapter(helper, { selectors: sel }).a.invoke({ prompt: PROMPT });
  assert.equal(res.ok, true, res.error);
  assert.equal(res.replyText, 'Hello back!');
});

test('thinking-panel growth keeps settle busy even when mic looks idle, then returns the answer', async () => {
  const node = (role, extra = {}, children = []) => ({
    role, subrole: null, name: null, title: null, description: null, help: null, value: null, enabled: true, path: [], children, ...extra,
  });
  const assign = (n, path = []) => {
    n.path = path;
    n.children.forEach((c, i) => assign(c, [...path, i]));
    return n;
  };
  const tree = ({ messages, think, chrome }) => assign(node('AXApplication', {}, [
    node('AXWindow', {}, [
      node('AXGroup', { description: 'conversation' },
        messages.map((text, i) => node('AXGroup', { description: i % 2 === 0 ? 'user message' : 'assistant message' }, [node('AXStaticText', { value: text })]))),
      ...(think ? [node('AXTextArea', { description: 'text entry area', value: think })] : []),
      node('AXTextArea', { value: chrome === 'send' ? PROMPT : '', description: 'Message' }),
      chrome === 'send' ? node('AXButton', { name: 'Send', help: 'Send (return)' }) : null,
      chrome === 'mic' ? node('AXButton', { help: 'Use microphone' }) : null,
    ].filter(Boolean)),
  ]));
  const sel = {
    ...SEL,
    sendButton: { role: 'AXButton', helpIncludes: 'Send' },
    stopButton: { role: 'AXButton', nameIncludes: 'Stop' },
    idleButton: { role: 'AXButton', helpIncludes: 'microphone' },
    busyWhenSendAbsent: true,
    thinkingItem: { role: 'AXTextArea', descriptionEquals: 'text entry area' },
  };
  const withText = tree({ messages: ['old q', 'old a'], chrome: 'send' });
  const think1 = tree({ messages: ['old q', 'old a', PROMPT], think: 'Refining', chrome: 'mic' });
  const think2 = tree({ messages: ['old q', 'old a', PROMPT], think: 'Refining the Format now', chrome: 'mic' });
  const think3 = tree({ messages: ['old q', 'old a', PROMPT], think: 'Refining the Format now even more', chrome: 'mic' });
  const finished = tree({ messages: ['old q', 'old a', PROMPT, 'Hello back!'], think: 'Refining the Format now even more', chrome: 'mic' });
  const helper = makeFakeHelper({ trees: [withText, withText, think1, think2, think3, finished, finished] });
  const res = await adapter(helper, { selectors: sel }).a.invoke({ prompt: PROMPT });
  assert.equal(res.ok, true, res.error);
  assert.equal(res.replyText, 'Hello back!');
});

test('press failure is described', async () => {
  const helper = makeFakeHelper({ trees: [idle], pressResult: { ok: false, code: 'script', error: 'no AXPress' } });
  const res = await adapter(helper).a.invoke({ prompt: PROMPT });
  assert.match(res.error, /TestApp: accessibility call failed — no AXPress/);
});

// Regression, observed live 2026-09-08 23:41: every poll read items=0 chars=0
// while the mic button showed idle. `stable` compared "" to "" twice and the
// adapter declared the round finished. It cannot tell "the conversation stopped
// changing" from "I cannot see the conversation" — only the latter is true here.
test('an unreadable (empty) conversation never counts toward stability', async () => {
  const node = (role, extra = {}, children = []) => ({
    role, subrole: null, name: null, title: null, description: null, help: null, value: null, enabled: true, path: [], children, ...extra,
  });
  const assign = (n, path = []) => {
    n.path = path;
    n.children.forEach((c, i) => assign(c, [...path, i]));
    return n;
  };
  const tree = ({ messages, chrome }) => assign(node('AXApplication', {}, [
    node('AXWindow', {}, [
      node('AXGroup', { description: 'conversation' },
        messages.map((text, i) => node('AXGroup', { description: i % 2 === 0 ? 'user message' : 'assistant message' }, [node('AXStaticText', { value: text })]))),
      node('AXTextArea', { value: chrome === 'send' ? PROMPT : '', description: 'Message' }),
      chrome === 'send' ? node('AXButton', { name: 'Send', help: 'Send (return)' }) : null,
      chrome === 'mic' ? node('AXButton', { help: 'Use microphone' }) : null,
    ].filter(Boolean)),
  ]));
  const sel = {
    ...SEL,
    sendButton: { role: 'AXButton', helpIncludes: 'Send' },
    stopButton: { role: 'AXButton', nameIncludes: 'Stop' },
    idleButton: { role: 'AXButton', helpIncludes: 'microphone' },
    busyWhenSendAbsent: true,
  };
  const withText = tree({ messages: ['old q', 'old a'], chrome: 'send' });
  const hollow = tree({ messages: [], chrome: 'mic' });   // idle chrome, nothing readable
  const helper = makeFakeHelper({ trees: [withText, withText, hollow] });
  const res = await adapter(helper, { selectors: sel }).a.invoke({ prompt: PROMPT });
  assert.equal(res.ok, false);
  assert.equal(res.errorCode, 'replyTimedOut', `got ${res.errorCode}: ${res.error}`);
});

// Observed live 2026-09-09: poll interval grew 4.7s → 15.8s across four rounds
// while pollMs stayed 1000. Nothing recorded where the time went, and ax.jxa's
// `truncated` flag was returned on every snapshot and read by no one.
test('trace rows record snapshot cost and the truncation flag', async () => {
  const clock = makeClock();
  const helper = makeFakeHelper({ trees: [idle, idle, streaming, done], truncated: true, onSnapshot: () => clock.advance(3500) });
  // 3.5s per snapshot on the fake clock; give the round room to finish.
  const res = await adapter(helper, { now: clock.now, sleep: clock.sleep, timeoutMs: 60000 }).a.invoke({ prompt: PROMPT });
  assert.equal(res.ok, true, res.error);
  assert.ok(res.diagnostics.trace.length >= 2);
  assert.ok(res.diagnostics.trace.every((row) => row.snapMs === 3500), JSON.stringify(res.diagnostics.trace.map((r) => r.snapMs)));
  assert.ok(res.diagnostics.trace.every((row) => row.truncated === true));
});

// One live round wrote 104 KB to traces.log against a 256 KB cap because every
// row repeated the full conversation text. Text belongs on the row where it changed.
test('trace rows carry texts only when the conversation text changed since the previous poll', async () => {
  const same = makeTree({ messages: ['old q', 'old a', PROMPT] });
  const later = makeTree({ messages: ['old q', 'old a', PROMPT, 'Hello back!'] });
  const helper = makeFakeHelper({ trees: [idle, idle, same, same, later] });
  const res = await adapter(helper).a.invoke({ prompt: PROMPT });
  assert.equal(res.ok, true, res.error);
  const texts = res.diagnostics.trace.map((row) => row.texts);
  assert.ok(Array.isArray(texts[0]), 'first poll carries texts');
  assert.equal(texts[1], undefined, 'unchanged poll omits texts');
  assert.ok(texts.some((t) => t?.includes('Hello back!')), 'the poll where the reply appeared carries texts');
  assert.equal(texts.at(-1), undefined, 'trailing stability-confirmation polls omit texts');
});
