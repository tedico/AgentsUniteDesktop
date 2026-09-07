// Shared progress event, emitted by adapters, consumed only by the status
// line. It never enters the transcript.
//   { ts: number, phase?: string, lastTool?: string, toolCount?: number }
// Phases: starting (no bytes yet) → alive (bytes, no structure yet) →
// connected (init event) → thinking → tool: <name> → replying (result event).
export function makeTracker(onProgress) {
  const st = { phase: 'starting', lastTool: undefined, toolCount: 0 };
  const emit = () => onProgress?.({ ts: Date.now(), ...st });
  return {
    heartbeat() { if (st.phase === 'starting') st.phase = 'alive'; emit(); },
    phase(p) { st.phase = p; emit(); },
    tool(name) { st.toolCount++; st.lastTool = name; st.phase = `tool: ${name}`; emit(); },
  };
}
