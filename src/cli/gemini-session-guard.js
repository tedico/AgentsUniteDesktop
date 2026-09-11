// A room that ran @gemini through Gemini.app stores "desktop:gemini" as the
// seat's sessionRef. `agy --conversation desktop:gemini` does not fail: it
// warns on stderr, starts a fresh conversation, and exits 0 (verified
// 2026-09-10), so the engine would keep firstTurn false and the new seat would
// never receive the preamble. Reset the seat the way the engine's own
// self-heal does (engine.js line 75): no session, cursor 0, full replay.
export function resetDesktopSession(state, seat = 'gemini') {
  const agent = state?.agents?.[seat];
  if (!agent || typeof agent.sessionRef !== 'string' || !agent.sessionRef.startsWith('desktop:')) return false;
  agent.sessionRef = null;
  agent.cursor = 0;
  return true;
}
