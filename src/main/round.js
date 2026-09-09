// Pure helpers over a transcript array ({ ts, from, text, mentions }[]).
// A "round" is everything since Ted's most recent message.

export function tedMessage(messages) {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].from === 'ted') return messages[i];
  return null;
}

export function currentRound(messages) {
  for (let i = messages.length - 1; i >= 0; i--) if (messages[i].from === 'ted') return messages.slice(i + 1);
  return messages.slice();
}

export function lastSeatTurn(round, roster) {
  for (let i = round.length - 1; i >= 0; i--) if (roster.includes(round[i].from)) return round[i];
  return null;
}

export function seatTurnCount(round, roster) {
  return round.filter((x) => roster.includes(x.from)).length;
}
