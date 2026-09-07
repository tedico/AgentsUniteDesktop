// Deterministic time for polling code: sleep() advances the clock instead of waiting.
export function makeClock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    sleep: async (ms) => { t += ms; },
    advance: (ms) => { t += ms; },
  };
}
