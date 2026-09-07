// Turns a before/after read of the conversation into the reply text.
// `before` and `after` are arrays of message strings from ax/query.itemTexts:
// one per bubble when the app exposes bubbles, else one blob per container.

export function extractReply({ before, after, prompt }) {
  const { tail, blob } = newTail(before, after);
  const p = prompt.trim();
  const kept = [];
  let echoDropped = false;
  for (const item of tail) {
    const t = item.trim();
    if (!t) continue;
    // Everything up to and including our own echoed prompt is not the reply.
    // In the blob case that also discards a re-rendered earlier bubble.
    if (!echoDropped && isEcho(t, p)) { echoDropped = true; kept.length = 0; continue; }
    kept.push(t);
  }
  return kept.join(blob ? '\n' : '\n\n').trim();
}

// The app shows our own prompt as a user bubble; some truncate long ones.
function isEcho(text, prompt) {
  if (text === prompt) return true;
  if (text.length >= 40 && prompt.startsWith(text)) return true;
  if (prompt.length >= 40 && text.startsWith(prompt)) return true;
  return false;
}

function newTail(before, after) {
  // Per-bubble: the conversation only grew, so the new bubbles are the tail.
  if (after.length > before.length && before.every((b, i) => b === after[i])) {
    return { tail: after.slice(before.length), blob: false };
  }
  // Single blob, or a re-rendered history: diff the joined text on the
  // longest common prefix, backed up to a line boundary, one item per line.
  const a = after.join('\n\n');
  const b = before.join('\n\n');
  if (a.length <= b.length) return { tail: [], blob: true };
  let i = 0;
  while (i < b.length && a[i] === b[i]) i++;
  const cut = a.lastIndexOf('\n', i);
  return { tail: a.slice(cut === -1 ? 0 : cut + 1).split('\n'), blob: true };
}
