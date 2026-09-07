import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkSeat, checkAll } from '../src/main/preflight.js';
import { ERRORS } from '../src/shared/errors.js';
import { makeFakeHelper } from './helpers/fake-helper.js';
import { makeTree } from './helpers/trees.js';
import { TEST_SELECTORS as SEL } from './helpers/test-selectors.js';

test('not running → not ready, offers to open the app', async () => {
  const r = await checkSeat({ helper: makeFakeHelper({ running: false }), selectors: SEL });
  assert.deepEqual(r, { seat: 'test', appName: 'TestApp', ready: false, message: ERRORS.appNotRunning('TestApp'), canOpen: true });
});

test('running, zero accessible windows → full-screen/hidden message', async () => {
  const r = await checkSeat({ helper: makeFakeHelper({ windows: { ok: true, count: 0, minimized: 0 } }), selectors: SEL });
  assert.equal(r.ready, false);
  assert.equal(r.message, ERRORS.noWindow('TestApp'));
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

test('checkAll is ready only when every seat is', async () => {
  const good = makeFakeHelper({ trees: [makeTree()] });
  const a = await checkAll({ helper: good, selectorList: [SEL, { ...SEL, seat: 'other', appName: 'Other' }] });
  assert.equal(a.ready, true);
  assert.deepEqual(a.seats.map((s) => s.seat), ['test', 'other']);
  const mixed = { ...good, isRunning: async () => false };
  const b = await checkAll({ helper: mixed, selectorList: [SEL] });
  assert.equal(b.ready, false);
});
