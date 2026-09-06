export function parseArgv(argv) {
  const [cmd, name] = argv;
  switch (cmd) {
    case 'new': return { cmd: 'new', name: name ?? 'main' };
    case 'resume': return { cmd: 'resume', name: name ?? null };
    case 'ls': return { cmd: 'ls', name: null };
    case 'digest': return { cmd: 'digest', name: name ?? null };
    default: return { cmd: 'open', name: null };
  }
}

export const PLAN_USAGE =
  'usage: /plan [@seat] <what to plan> — start planning mode (default planner from config); /plan off — end it';

// /plan [@seat] <text> | /plan off | /plan
export function parsePlanCommand(text, roster) {
  const m = text.match(/^\/plan(?:\s+([\s\S]*))?$/);
  if (!m) return null;
  const rest = (m[1] ?? '').trim();
  if (!rest) return { kind: 'usage' };
  if (rest === 'off') return { kind: 'off' };
  const seat = rest.match(/^@(\w+)(?:\s+([\s\S]*))?$/);
  if (!seat) return { kind: 'start', planner: null, text: rest };
  const name = seat[1].toLowerCase();
  if (!roster.includes(name)) return { kind: 'bad-seat', seat: name };
  const body = (seat[2] ?? '').trim();
  if (!body) return { kind: 'usage' };
  return { kind: 'start', planner: name, text: body };
}
