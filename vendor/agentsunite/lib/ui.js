const COLORS = {
  ted: '\x1b[36m',      // cyan
  claude: '\x1b[35m',   // magenta
  gemini: '\x1b[34m',   // blue
  cursor: '\x1b[33m',   // yellow
  system: '\x1b[90m',   // dim
};
const RESET = '\x1b[0m';
const CLEAR = '\r\x1b[2K';
const FRAMES = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];

export function formatStatus(frame, seat, elapsedSec, pos, total, live) {
  const spin = FRAMES[frame % FRAMES.length];
  if (!live) return `${spin} @${seat} is thinking… (${elapsedSec}s) — turn ${pos}/${total}`;
  const parts = [`@${seat} ${live.phase ?? 'thinking'}`];
  if (live.toolCount) {
    const inTool = String(live.phase).startsWith('tool:');
    const last = live.lastTool && !inTool ? ` (last ${live.lastTool})` : '';
    parts.push(`${live.toolCount} tool${live.toolCount === 1 ? '' : 's'}${last}`);
  }
  if (live.idleSec != null) parts.push(`last activity ${live.idleSec}s ago`);
  return `${spin} ${parts.join(' · ')} (${elapsedSec}s) — turn ${pos}/${total}`;
}

export function makeUi(out = process.stdout) {
  return {
    startStatus(seat, pos, total) {
      const t0 = Date.now();
      let frame = 0;
      let stopped = false;
      let lastTs = null;
      const live = { phase: 'starting', lastTool: undefined, toolCount: 0, idleSec: null };
      const render = () => {
        const now = Date.now();
        live.idleSec = lastTs == null ? null : Math.round((now - lastTs) / 1000);
        out.write(CLEAR + formatStatus(frame, seat, Math.round((now - t0) / 1000), pos, total, live));
      };
      render();
      const timer = setInterval(() => { frame++; render(); }, 250);
      return {
        // Mutate only; the spinner tick renders. Chatty streams (cursor emits
        // a thinking delta per few words) must not turn into a write storm.
        update(evt) {
          if (stopped || !evt) return;
          lastTs = evt.ts ?? Date.now();
          if (evt.phase) live.phase = evt.phase;
          if (evt.lastTool) live.lastTool = evt.lastTool;
          if (evt.toolCount != null) live.toolCount = evt.toolCount;
        },
        stop() { if (stopped) return; stopped = true; clearInterval(timer); out.write(CLEAR); },
      };
    },
    printReply(seat, text) {
      out.write(`${COLORS[seat] ?? ''}${seat}>${RESET} ${text}\n\n`);
    },
    printSystem(text) {
      out.write(`${COLORS.system}${text}${RESET}\n`);
    },
    prompt() {
      return `${COLORS.ted}ted>${RESET} `;
    },
  };
}
