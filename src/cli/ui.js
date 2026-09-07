import { formatStatus, makeUi as makeVendorUi } from '../../vendor/agentsunite/lib/ui.js';

const CLEAR = '\r\x1b[2K';

export function clampStatus(line, columns) {
  const width = Math.max(1, (Number(columns) || 80) - 1);
  return line.length <= width ? line : line.slice(0, width);
}

// Same contract as vendored makeUi, but the spinner is clipped to one
// terminal row so \\r\\x1b[2K actually clears it (A7).
export function makeUi(out = process.stdout) {
  const inner = makeVendorUi(out);
  return {
    ...inner,
    startStatus(seat, pos, total) {
      const t0 = Date.now();
      let frame = 0;
      let stopped = false;
      let lastTs = null;
      const live = { phase: 'starting', lastTool: undefined, toolCount: 0, idleSec: null };
      const render = () => {
        const now = Date.now();
        live.idleSec = lastTs == null ? null : Math.round((now - lastTs) / 1000);
        const line = formatStatus(frame, seat, Math.round((now - t0) / 1000), pos, total, live);
        out.write(CLEAR + clampStatus(line, out.columns));
      };
      render();
      const timer = setInterval(() => { frame++; render(); }, 250);
      return {
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
  };
}
