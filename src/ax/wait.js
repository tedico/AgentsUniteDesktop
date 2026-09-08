// Poll a windows() probe until a window appears or the deadline hits.
// Used by the Node helper so the 0→1 case is testable without Gemini.app.
export async function waitForWindows({
  probe,
  waitMs = 2000,
  pollMs = 200,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  now = () => Date.now(),
} = {}) {
  const deadline = now() + waitMs;
  let last = { ok: true, count: 0 };
  for (;;) {
    last = await probe();
    if (!last?.ok && last?.code !== 'noWindow') return last;
    if (last?.ok && last.count > 0) return last;
    if (now() >= deadline) return last;
    await sleep(pollMs);
  }
}
