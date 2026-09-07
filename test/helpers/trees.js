// Synthetic trees in the exact shape src/ax/ax.jxa emits, matched by
// test/helpers/test-selectors.js. Real trees live in test/fixtures/.
export function makeTree({ composerValue = '', messages = [], busy = false, shiftComposer = false } = {}) {
  const node = (role, extra = {}, children = []) => ({
    role, subrole: null, name: null, title: null, description: null, help: null, value: null, enabled: true, path: [], children, ...extra,
  });
  const bubbles = messages.map((text, i) =>
    node('AXGroup', { description: i % 2 === 0 ? 'user message' : 'assistant message' }, [node('AXStaticText', { value: text })]));
  const buttons = [node('AXButton', { name: 'Send' })];
  if (busy) buttons.push(node('AXButton', { name: 'Stop generating' }));
  const chrome = shiftComposer ? [node('AXGroup', { description: 'inserted chrome' })] : [];
  const win = node('AXWindow', { name: 'TestApp' }, [
    node('AXGroup', { description: 'conversation' }, bubbles),
    ...chrome,
    node('AXTextArea', { value: composerValue, description: 'Message' }),
    ...buttons,
  ]);
  return assignPaths(node('AXApplication', {}, [win]), []);
}

function assignPaths(n, path) {
  n.path = path;
  n.children.forEach((c, i) => assignPaths(c, [...path, i]));
  return n;
}
