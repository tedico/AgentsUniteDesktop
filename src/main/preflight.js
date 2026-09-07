import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { findNode } from '../ax/query.js';
import { ERRORS, describeAxError } from '../shared/errors.js';

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
  if (w.count === 0) return { ...base, message: ERRORS.noWindow(appName) };
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

export async function checkHybrid({ helper, geminiSelectors, which, binary } = {}) {
  const claude = await checkClaudeCli({ which, binary });
  const gemini = await checkSeat({ helper, selectors: geminiSelectors });
  return { seats: [claude, gemini], ready: claude.ready && gemini.ready };
}
