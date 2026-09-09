import { readTranscript } from '../../vendor/agentsunite/lib/transcript.js';
import { parseMentions } from '../../vendor/agentsunite/lib/mentions.js';
import { currentRound, lastSeatTurn, seatTurnCount, tedMessage } from './round.js';

export const HAND_BACK = (seat) => `— over to @${seat}`;

// The engine queues a seat only when a reply @mentions it (engine.js:100).
// Gemini's app persona answers Ted and names nobody, so a hand-off from
// Claude would end the round without Claude's close. When Gemini is
// speaking because a peer handed off — not because Ted addressed it — and
// its reply names no seat, append a visible hand-back so the peer closes.
export function withHandBack(adapter, dir, { turnCap, roster = ['claude', 'gemini'] }) {
  return {
    seat: adapter.seat,
    async invoke(args) {
      const res = await adapter.invoke(args);
      if (!res.ok) return res;
      const messages = readTranscript(dir);
      const ted = tedMessage(messages);
      if (ted && ted.mentions.includes(adapter.seat)) return res;           // Ted addressed this seat
      const round = currentRound(messages);
      const prev = lastSeatTurn(round, roster);
      if (!prev || prev.from === adapter.seat) return res;                  // nobody handed off
      if (parseMentions(res.replyText, roster).length > 0) return res;      // it named someone itself
      if (seatTurnCount(round, roster) + 1 >= turnCap) return res;           // engine would suppress it
      return { ...res, replyText: `${res.replyText.trimEnd()}\n\n${HAND_BACK(prev.from)}` };
    },
  };
}

export function withHandBacks(adapters, dir, opts) {
  if (!adapters.gemini) return adapters;
  return { ...adapters, gemini: withHandBack(adapters.gemini, dir, opts) };
}
