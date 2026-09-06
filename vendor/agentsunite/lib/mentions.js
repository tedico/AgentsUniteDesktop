export function parseMentions(text, roster) {
  const out = [];
  for (const [, name] of text.matchAll(/@(\w+)/g)) {
    const seat = name.toLowerCase();
    if (seat === 'all') {
      for (const s of roster) if (!out.includes(s)) out.push(s);
    } else if (roster.includes(seat) && !out.includes(seat)) {
      out.push(seat);
    }
  }
  return out;
}
