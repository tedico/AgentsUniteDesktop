// Pure helpers over a serialized accessibility tree. No I/O. The shape is
// what src/ax/ax.jxa emits; real examples live in test/fixtures/.
//
// Node: { role, subrole, name, title, description, help, value, enabled,
//         path: number[], children: Node[] }   (string fields may be null)
// Selector: { role?, subrole?, nameIncludes?, titleIncludes?,
//             descriptionIncludes?, descriptionEquals?, helpIncludes?,
//             nameExcludes?, hasValue? }

const TEXT_CRITERIA = [
  ['name', 'nameIncludes'],
  ['title', 'titleIncludes'],
  ['description', 'descriptionIncludes'],
  ['help', 'helpIncludes'],
];

export function matches(node, sel) {
  if (!node || !sel) return false;
  if (sel.role != null && node.role !== sel.role) return false;
  if (sel.subrole != null && node.subrole !== sel.subrole) return false;
  for (const [field, key] of TEXT_CRITERIA) {
    const needle = sel[key];
    if (needle == null) continue;
    const hay = node[field];
    if (typeof hay !== 'string' || !hay.toLowerCase().includes(String(needle).toLowerCase())) return false;
  }
  if (sel.hasValue && typeof node.value !== 'string') return false;
  if (sel.descriptionEquals != null) {
    if (typeof node.description !== 'string' || node.description.toLowerCase() !== String(sel.descriptionEquals).toLowerCase()) return false;
  }
  if (sel.nameExcludes != null) {
    const hay = node.name;
    if (typeof hay === 'string' && hay.toLowerCase().includes(String(sel.nameExcludes).toLowerCase())) return false;
  }
  return true;
}

export function* walk(node) {
  if (!node) return;
  yield node;
  for (const child of node.children ?? []) yield* walk(child);
}

export function findNode(root, sel) {
  for (const node of walk(root)) if (matches(node, sel)) return node;
  return null;
}

// Matches in document order. A matched node's subtree is skipped so nested
// bubbles (a quoted message inside a message) are not counted twice.
// `sel` may be one selector or a list; a node matches if any selector does.
export function findAll(root, sel) {
  const sels = Array.isArray(sel) ? sel : [sel];
  const out = [];
  const stack = root ? [root] : [];
  while (stack.length > 0) {
    const node = stack.shift();
    if (sels.some((s) => matches(node, s))) { out.push(node); continue; }
    stack.unshift(...(node.children ?? []));
  }
  return out;
}

// Visible text of a subtree: a node contributes its value if it has one,
// else its name. Static text nodes carry values; labels carry names.
export function collectText(node) {
  const lines = [];
  for (const n of walk(node)) {
    const text = pick(n.value) ?? pick(n.name);
    if (text) lines.push(text);
  }
  return lines.join('\n');
}

function pick(s) {
  return typeof s === 'string' && s.trim() ? s.trim() : null;
}

// The conversation as one string per message bubble. Without a bubble
// selector (or when it matches nothing) the whole container is one item, so
// callers can still diff before/after text.
// Character total of nodes the message selector deliberately excludes
// (Gemini thinking panels: AXTextArea "text entry area").
export function thinkingChars(root, thinkingSel) {
  if (!root || !thinkingSel) return 0;
  return findAll(root, thinkingSel).reduce((n, node) => n + collectText(node).length, 0);
}

export function itemTexts(container, itemSel) {
  if (!container) return [];
  const items = itemSel ? findAll(container, itemSel) : [];
  const texts = items.map(collectText).filter(Boolean);
  // Fall back to the whole container when the selector matched nothing
  // readable — a match on an empty node must not hide text the selector missed.
  if (texts.length === 0) {
    const all = collectText(container);
    return all ? [all] : [];
  }
  return texts;
}
