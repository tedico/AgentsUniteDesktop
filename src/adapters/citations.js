// Gemini annotates sources inline as [span_N](start_span) … (end_span). The
// markers are noise in a relayed message; the text between them is not.
const START = /\[span_\d+\]\(start_span\)/g;
const END = /\(end_span\)/g;

export function stripCitations(text) {
  return text
    .replace(START, '')
    .replace(END, '')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+$/gm, '');
}
