// Splits message text at ``` fences so code blocks render as <pre><code>.
// Everything is still inserted with textContent; this only decides the tag.
const FENCE = /```([\w+-]*)[ \t]*\n([\s\S]*?)(?:\n```|$)/g;

export function splitFences(text) {
  const parts = [];
  const pushText = (t) => { const trimmed = t.replace(/^\n+|\n+$/g, ''); if (trimmed.trim()) parts.push({ type: 'text', text: trimmed }); };
  let last = 0;
  for (const m of text.matchAll(FENCE)) {
    if (m.index > last) pushText(text.slice(last, m.index));
    parts.push({ type: 'code', lang: m[1] || null, text: m[2] });
    last = m.index + m[0].length;
  }
  if (last < text.length) pushText(text.slice(last));
  return parts;
}
