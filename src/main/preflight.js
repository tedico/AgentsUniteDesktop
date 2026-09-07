import { findNode } from '../ax/query.js';
import { ERRORS, describeAxError } from '../shared/errors.js';

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
