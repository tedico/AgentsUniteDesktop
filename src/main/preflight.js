import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { findNode } from '../ax/query.js';
import { ERRORS, describeAxError } from '../shared/errors.js';
import { isNotebooklmAuthError } from '../shared/diagnostics.js';

const execFileP = promisify(execFile);

export async function defaultWhich(bin) {
  try {
    const { stdout } = await execFileP('which', [bin]);
    const p = stdout.trim();
    return p || null;
  } catch {
    return null;
  }
}

// The start-up checklist, re-run every couple of seconds while the window is
// open. Send is enabled only when every seat is ready. Windows may sit behind
// others, but a full-screen window on another Space (or a hidden app) shows
// zero accessible windows, and a minimized one shows AXMinimized.
export async function checkSeat({ helper, selectors }) {
  const { seat, appName, bundleId } = selectors;
  const base = { seat, appName, ready: false };
  if (!(await helper.isRunning(bundleId))) return { ...base, message: ERRORS.appNotRunning(appName), canOpen: true };
  if (selectors.manualAccessibility) await helper.enableManualAccessibility(bundleId);
  const w = await helper.windows(bundleId);
  if (!w.ok) return { ...base, message: describeAxError(w, appName) };
  if (w.count === 0) return { ...base, message: ERRORS.noWindow(appName, w) };
  if (w.minimized >= w.count) return { ...base, message: ERRORS.minimized(appName) };
  const snap = await helper.snapshot(bundleId);
  if (!snap.ok) return { ...base, message: describeAxError(snap, appName) };
  if (!findNode(snap.tree, selectors.composer)) return { ...base, message: ERRORS.noChatOpen(appName) };
  return { ...base, ready: true, message: `${appName}: chat open` };
}

export async function checkAll({ helper, selectorList }) {
  const seats = [];
  for (const selectors of selectorList) seats.push(await checkSeat({ helper, selectors }));
  return { seats, ready: seats.every((s) => s.ready) };
}

// Gate for the 2s tick: if the process is not a trusted Accessibility
// client, do not call osascript. One waiting message on every seat.
export async function tickPreflight({ trusted, helper, selectorList }) {
  if (!trusted) {
    return {
      ready: false,
      seats: selectorList.map(({ seat, appName }) => ({
        seat, appName, ready: false, message: ERRORS.accessibilityPending(),
      })),
    };
  }
  return checkAll({ helper, selectorList });
}

export async function checkClaudeCli({ which = defaultWhich, binary = 'claude' } = {}) {
  const resolved = await which(binary);
  if (!resolved) return { seat: 'claude', appName: 'Claude', ready: false, message: ERRORS.claudeNotOnPath() };
  return { seat: 'claude', appName: 'Claude', ready: true, message: `Claude CLI: ${resolved}` };
}

export async function checkAgyCli({ which = defaultWhich, binary = 'agy' } = {}) {
  const resolved = await which(binary);
  if (!resolved) return { seat: 'gemini', appName: 'Antigravity', ready: false, message: ERRORS.agyNotOnPath() };
  return { seat: 'gemini', appName: 'Antigravity', ready: true, message: `Antigravity CLI: ${resolved}` };
}

export async function checkNotebooklm({
  which = defaultWhich,
  binary = 'notebooklm',
  notebookId,
  run,
} = {}) {
  const base = { seat: 'notebook', appName: 'NotebookLM', ready: false };
  if (!notebookId) return { ...base, ready: true, message: 'NotebookLM: not bound' };
  const resolved = await which(binary);
  if (!resolved) return { ...base, message: ERRORS.notebooklmNotOnPath() };
  if (run) {
    const r = await run({ cmd: binary, args: ['source', 'list', '-n', notebookId], timeoutMs: 30000 });
    const text = `${r.stderr ?? ''}\n${r.stdout ?? ''}`;
    if (r.spawnError) return { ...base, message: ERRORS.notebooklmNotOnPath() };
    if (isNotebooklmAuthError(text)) return { ...base, message: ERRORS.notebooklmLogin() };
  }
  return { ...base, ready: true, message: `NotebookLM: ${resolved}` };
}

// geminiSeat 'agy' (the default since 2026-09-10) resolves the Antigravity
// binary and never touches the accessibility helper; 'desktop' walks
// Gemini.app's tree as before.
export async function checkHybrid({
  helper, geminiSelectors, which, binary, notebookId, notebookRun,
  geminiSeat = 'agy', geminiBinary = 'agy',
} = {}) {
  const claude = await checkClaudeCli({ which, binary });
  const gemini = geminiSeat === 'desktop'
    ? await checkSeat({ helper, selectors: geminiSelectors })
    : await checkAgyCli({ which, binary: geminiBinary });
  const seats = [claude, gemini];
  if (notebookId) seats.push(await checkNotebooklm({ which, notebookId, run: notebookRun }));
  return { seats, ready: claude.ready && gemini.ready };
}
