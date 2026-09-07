// Replays a sequence of trees (the last one repeats) and records every call.
// `composerValue` tracks what setValue/paste wrote so getValue can verify.
export function makeFakeHelper({
  trees = [],
  running = true,
  windows = { ok: true, count: 1, minimized: 0 },
  snapshotError = null,
  setValueResult = { ok: true },
  pasteResult = { ok: true },
  pressResult = { ok: true },
  directSetSticks = true,
  onSnapshot = null,
  staleComposerPathAfterWrite = false,
} = {}) {
  const calls = [];
  let i = 0;
  let composerValue = '';
  let writtenPath = null;
  const pathKey = (path) => JSON.stringify(path);
  return {
    calls,
    ops: () => calls.map((c) => c[0]),
    async isRunning() { calls.push(['isRunning']); return running; },
    async enableManualAccessibility() { calls.push(['manualA11y']); return { ok: true, applied: true }; },
    async windows() { calls.push(['windows']); return windows; },
    async snapshot(bundleId, opts) {
      calls.push(['snapshot', opts]);
      onSnapshot?.(i);
      if (snapshotError) return { ok: false, ...snapshotError };
      const tree = trees[Math.min(i, trees.length - 1)];
      i++;
      return { ok: true, tree, truncated: false };
    },
    async getValue(b, path) {
      calls.push(['getValue', path]);
      if (staleComposerPathAfterWrite && writtenPath && pathKey(path) === pathKey(writtenPath)) {
        return { ok: false, code: 'script', error: 'Error: Invalid index.' };
      }
      return { ok: true, value: composerValue };
    },
    async setValue(b, path, text) {
      calls.push(['setValue', path, text]);
      writtenPath = path;
      if (setValueResult.ok && directSetSticks) composerValue = text;
      return setValueResult;
    },
    async press(b, path) { calls.push(['press', path]); return pressResult; },
    async paste(b, path, text) {
      calls.push(['paste', path, text]);
      if (pasteResult.ok) composerValue = text;
      return pasteResult;
    },
  };
}
