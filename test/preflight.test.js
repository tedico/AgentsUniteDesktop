import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSeat, checkAll, tickPreflight, checkClaudeCli, checkAgyCli, checkHybrid, checkNotebooklm } from '../src/main/preflight.js';
import { ERRORS } from '../src/shared/errors.js';
import { makeFakeHelper } from './helpers/fake-helper.js';
import { makeTree } from './helpers/trees.js';
import { TEST_SELECTORS as SEL } from './helpers/test-selectors.js';

test('not running → not ready, offers to open the app', async () => {
  const r = await checkSeat({ helper: makeFakeHelper({ running: false }), selectors: SEL });
  assert.deepEqual(r, { seat: 'test', appName: 'TestApp', ready: false, message: ERRORS.appNotRunning('TestApp'), canOpen: true });
});

test('running, zero accessible windows → observed-state message, no guessed Space', async () => {
  const windows = { ok: true, count: 0, minimized: 0, frontmost: false, activate: { attempted: true, succeeded: false, error: null } };
  const r = await checkSeat({ helper: makeFakeHelper({ windows }), selectors: SEL });
  assert.equal(r.ready, false);
  assert.equal(r.message, ERRORS.noWindow('TestApp', windows));
  assert.match(r.message, /windows=0/);
  assert.doesNotMatch(r.message, /full-screen on another Space/);
  assert.equal(r.canOpen, undefined);
});

test('all windows minimized → Dock message', async () => {
  const r = await checkSeat({ helper: makeFakeHelper({ windows: { ok: true, count: 1, minimized: 1 } }), selectors: SEL });
  assert.equal(r.message, ERRORS.minimized('TestApp'));
});

test('windows call denied → the permission message', async () => {
  const r = await checkSeat({ helper: makeFakeHelper({ windows: { ok: false, code: 'automation', error: 'x' } }), selectors: SEL });
  assert.equal(r.message, ERRORS.automationDenied('TestApp'));
});

test('no composer → no chat open', async () => {
  const t = makeTree();
  t.children[0].children = t.children[0].children.filter((n) => n.role !== 'AXTextArea');
  const r = await checkSeat({ helper: makeFakeHelper({ trees: [t] }), selectors: SEL });
  assert.equal(r.message, ERRORS.noChatOpen('TestApp'));
});

test('composer present → ready; manual accessibility enabled first when the seat asks', async () => {
  const helper = makeFakeHelper({ trees: [makeTree()] });
  const r = await checkSeat({ helper, selectors: { ...SEL, manualAccessibility: true } });
  assert.deepEqual(r, { seat: 'test', appName: 'TestApp', ready: true, message: 'TestApp: chat open' });
  assert.deepEqual(helper.ops(), ['isRunning', 'manualA11y', 'windows', 'snapshot']);
});

test('untrusted Accessibility: waiting state, helper never called', async () => {
  const helper = makeFakeHelper({ trees: [makeTree()] });
  const other = { ...SEL, seat: 'other', appName: 'Other' };
  const r = await tickPreflight({ trusted: false, helper, selectorList: [SEL, other] });
  assert.equal(r.ready, false);
  assert.deepEqual(r.seats.map((s) => s.seat), ['test', 'other']);
  for (const s of r.seats) {
    assert.equal(s.ready, false);
    assert.equal(s.message, ERRORS.accessibilityPending());
  }
  assert.deepEqual(helper.ops(), []);
});

test('trusted Accessibility: tickPreflight runs the normal checklist', async () => {
  const helper = makeFakeHelper({ trees: [makeTree()] });
  const r = await tickPreflight({ trusted: true, helper, selectorList: [SEL] });
  assert.equal(r.ready, true);
  assert.ok(helper.ops().includes('snapshot'));
});

test('checkClaudeCli: missing binary is not ready', async () => {
  const r = await checkClaudeCli({ which: async () => null });
  assert.equal(r.ready, false);
  assert.equal(r.seat, 'claude');
  assert.match(r.message, /claude is not on PATH/i);
});

test('checkHybrid with the desktop seat is ready only when claude is on PATH and Gemini chat is open', async () => {
  const helper = makeFakeHelper({ trees: [makeTree()] });
  const gemini = { ...SEL, seat: 'gemini', appName: 'Gemini' };
  const bad = await checkHybrid({ helper, geminiSelectors: gemini, geminiSeat: 'desktop', which: async () => null });
  assert.equal(bad.ready, false);
  assert.deepEqual(bad.seats.map((s) => s.seat), ['claude', 'gemini']);
  const good = await checkHybrid({ helper, geminiSelectors: gemini, geminiSeat: 'desktop', which: async () => '/usr/local/bin/claude' });
  assert.equal(good.ready, true);
  assert.ok(helper.ops().includes('snapshot'), 'desktop seat walks the accessibility tree');
});

test('checkAgyCli: found → ready with the path; missing → the not-on-PATH message', async () => {
  const ok = await checkAgyCli({ which: async () => '/Users/teds/.local/bin/agy' });
  assert.deepEqual(ok, { seat: 'gemini', appName: 'Antigravity', ready: true, message: 'Antigravity CLI: /Users/teds/.local/bin/agy' });
  const missing = await checkAgyCli({ which: async () => null });
  assert.deepEqual(missing, { seat: 'gemini', appName: 'Antigravity', ready: false, message: ERRORS.agyNotOnPath() });
});

test('checkHybrid with the agy seat resolves the binary and never touches the accessibility helper', async () => {
  const throwing = () => { throw new Error('helper must not be called for the agy seat'); };
  const helper = { isRunning: throwing, enableManualAccessibility: throwing, windows: throwing, snapshot: throwing };
  const which = async (bin) => ({ claude: '/bin/claude', agy: '/bin/agy' })[bin] ?? null;
  const r = await checkHybrid({ helper, geminiSelectors: null, geminiSeat: 'agy', which });
  assert.equal(r.ready, true);
  assert.deepEqual(r.seats.map((s) => [s.seat, s.ready]), [['claude', true], ['gemini', true]]);
  assert.equal(r.seats[1].message, 'Antigravity CLI: /bin/agy');
  const noAgy = await checkHybrid({ helper, geminiSelectors: null, geminiSeat: 'agy', which: async (bin) => (bin === 'claude' ? '/bin/claude' : null) });
  assert.equal(noAgy.ready, false);
  assert.equal(noAgy.seats[1].message, ERRORS.agyNotOnPath());
});

test('checkHybrid defaults to the agy seat and honours geminiBinary', async () => {
  const throwing = () => { throw new Error('helper must not be called by default'); };
  const helper = { isRunning: throwing, enableManualAccessibility: throwing, windows: throwing, snapshot: throwing };
  const asked = [];
  const which = async (bin) => { asked.push(bin); return `/opt/${bin}`; };
  const r = await checkHybrid({ helper, geminiSelectors: null, which, geminiBinary: 'agy-nightly' });
  assert.equal(r.ready, true);
  assert.deepEqual(asked, ['claude', 'agy-nightly']);
  assert.equal(r.seats[1].message, 'Antigravity CLI: /opt/agy-nightly');
});

test('checkNotebooklm: unbound is skipped; missing binary and auth lapse are named', async () => {
  const skip = await checkNotebooklm({ notebookId: null, which: async () => '/bin/notebooklm' });
  assert.equal(skip.ready, true);
  assert.match(skip.message, /not bound/i);
  const missing = await checkNotebooklm({ notebookId: 'nb-1', which: async () => null });
  assert.equal(missing.ready, false);
  assert.equal(missing.message, ERRORS.notebooklmNotOnPath());
  const expired = await checkNotebooklm({
    notebookId: 'nb-1',
    which: async () => '/bin/notebooklm',
    run: async () => ({ code: 1, stdout: '', stderr: 'Not authenticated. Run notebooklm login.', spawnError: false }),
  });
  assert.equal(expired.ready, false);
  assert.equal(expired.message, ERRORS.notebooklmLogin());
});

test('checkAll is ready only when every seat is', async () => {
  const good = makeFakeHelper({ trees: [makeTree()] });
  const a = await checkAll({ helper: good, selectorList: [SEL, { ...SEL, seat: 'other', appName: 'Other' }] });
  assert.equal(a.ready, true);
  assert.deepEqual(a.seats.map((s) => s.seat), ['test', 'other']);
  const mixed = { ...good, isRunning: async () => false };
  const b = await checkAll({ helper: mixed, selectorList: [SEL] });
  assert.equal(b.ready, false);
});
