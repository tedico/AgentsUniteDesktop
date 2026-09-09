import { test } from 'node:test';
import assert from 'node:assert/strict';
import { matches, findNode, findAll, walk, collectText, itemTexts, thinkingChars } from '../src/ax/query.js';

const n = (role, extra = {}, children = []) => ({
  role, subrole: null, name: null, title: null, description: null, help: null, value: null, enabled: true, path: [], children, ...extra,
});

const TREE = n('AXApplication', {}, [
  n('AXWindow', { name: 'Claude' }, [
    n('AXGroup', { description: 'conversation' }, [
      n('AXGroup', { description: 'user message' }, [n('AXStaticText', { value: 'hi there' })]),
      n('AXGroup', { description: 'assistant message' }, [
        n('AXStaticText', { value: 'Hello!' }),
        n('AXGroup', { description: 'code block' }, [n('AXStaticText', { value: 'console.log(1)' })]),
      ]),
    ]),
    n('AXTextArea', { value: '', description: 'Message Claude', help: 'Write your prompt' }),
    n('AXButton', { name: 'Send Message', enabled: true }),
  ]),
]);

test('matches: exact role/subrole, case-insensitive substring on text fields', () => {
  const btn = n('AXButton', { name: 'Send Message', subrole: 'AXPrimary' });
  assert.equal(matches(btn, { role: 'AXButton' }), true);
  assert.equal(matches(btn, { role: 'AXButton', nameIncludes: 'send' }), true);
  assert.equal(matches(btn, { role: 'AXButton', nameIncludes: 'stop' }), false);
  assert.equal(matches(btn, { role: 'AXGroup' }), false);
  assert.equal(matches(btn, { subrole: 'AXPrimary' }), true);
  assert.equal(matches(btn, { subrole: 'AXSecondary' }), false);
  assert.equal(matches(btn, { nameIncludes: 'x', role: undefined }), false);
});

test('matches: descriptionEquals is exact; nameExcludes drops thinking chrome', () => {
  const answer = n('AXStaticText', { description: 'text', name: 'Hello @claude!' });
  const think = n('AXStaticText', { description: 'text', name: 'Show thinking' });
  const area = n('AXTextArea', { description: 'text entry area', name: null });
  const sel = { role: 'AXStaticText', descriptionEquals: 'text', nameExcludes: 'Show thinking' };
  assert.equal(matches(answer, sel), true);
  assert.equal(matches(think, sel), false);
  assert.equal(matches(area, sel), false);
});

test('matches: a text criterion against a null field is false; hasValue needs a string value', () => {
  assert.equal(matches(n('AXButton'), { nameIncludes: 'send' }), false);
  assert.equal(matches(n('AXTextArea', { value: null }), { hasValue: true }), false);
  assert.equal(matches(n('AXTextArea', { value: '' }), { hasValue: true }), true);
});

test('findNode: depth-first first match, null when absent', () => {
  assert.equal(findNode(TREE, { role: 'AXTextArea' }).description, 'Message Claude');
  assert.equal(findNode(TREE, { role: 'AXButton', nameIncludes: 'send' }).name, 'Send Message');
  assert.equal(findNode(TREE, { role: 'AXButton', nameIncludes: 'stop' }), null);
  assert.equal(findNode(null, { role: 'AXButton' }), null);
});

test('findAll: every match in document order, not descending into a match', () => {
  const msgs = findAll(TREE, { role: 'AXGroup', descriptionIncludes: 'message' });
  assert.deepEqual(msgs.map((m) => m.description), ['user message', 'assistant message']);
  const groups = findAll(TREE, { role: 'AXGroup' });
  assert.deepEqual(groups.map((g) => g.description), ['conversation']); // nested groups hidden behind the match
});

test('walk yields every node once', () => {
  assert.equal([...walk(TREE)].length, 11);
});

test('collectText: values and names in order, one per line, blanks skipped', () => {
  const conv = findNode(TREE, { descriptionIncludes: 'conversation' });
  assert.equal(collectText(conv), 'hi there\nHello!\nconsole.log(1)');
  assert.equal(collectText(findNode(TREE, { role: 'AXTextArea' })), '');
  assert.equal(collectText(null), '');
});

test('itemTexts: one string per bubble when the item selector matches', () => {
  const conv = findNode(TREE, { descriptionIncludes: 'conversation' });
  assert.deepEqual(itemTexts(conv, { role: 'AXGroup', descriptionIncludes: 'message' }), ['hi there', 'Hello!\nconsole.log(1)']);
});

test('thinkingChars: character total of thinking panels; 0 when selector missing', () => {
  const tree = n('AXApplication', {}, [
    n('AXWindow', {}, [
      n('AXTextArea', { description: 'text entry area', value: 'Refining the Format' }),
      n('AXTextArea', { description: 'text entry area', value: 'Perfecting' }),
      n('AXTextArea', { description: 'Ask Gemini', value: 'composer' }),
    ]),
  ]);
  const sel = { role: 'AXTextArea', descriptionEquals: 'text entry area' };
  assert.equal(thinkingChars(tree, sel), 'Refining the Format'.length + 'Perfecting'.length);
  assert.equal(thinkingChars(tree, null), 0);
  assert.equal(thinkingChars(null, sel), 0);
});

test('itemTexts: whole container as one item when no selector or no match; [] for empty', () => {
  const conv = findNode(TREE, { descriptionIncludes: 'conversation' });
  assert.deepEqual(itemTexts(conv, null), ['hi there\nHello!\nconsole.log(1)']);
  assert.deepEqual(itemTexts(conv, { role: 'AXTable' }), ['hi there\nHello!\nconsole.log(1)']);
  assert.deepEqual(itemTexts(n('AXGroup'), null), []);
  assert.deepEqual(itemTexts(null, null), []);
});
