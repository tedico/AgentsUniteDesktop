import { runJxa } from './jxa.js';
import { waitForWindows } from './wait.js';

const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

// The only accessibility surface the adapters and preflight touch: find is
// done in JS over a snapshot (src/ax/query.js); everything here is one
// osascript call. Every method returns a plain object so tests can replay
// saved trees (test/helpers/fake-helper.js). Replace `run` with a compiled
// sidecar later without touching the adapters.
export function makeAxHelper({ run = runJxa, sleep = defaultSleep, now = () => Date.now() } = {}) {
  const call = (command, text = '') => run({ command, text });
  return {
    async isRunning(bundleId) {
      const r = await call({ op: 'running', bundleId });
      return r.ok === true && r.running === true;
    },
    enableManualAccessibility: (bundleId) => call({ op: 'manualA11y', bundleId }),
    async windows(bundleId, { activateWaitMs = 300, waitMs, pollMs = 200 } = {}) {
      const probe = () => call({ op: 'windows', bundleId, activateWaitMs });
      if (waitMs == null) return probe();
      return waitForWindows({ probe, waitMs, pollMs, sleep, now });
    },
    snapshot: (bundleId, { path = [], maxDepth = 60, maxNodes = 6000, activateWaitMs = 300 } = {}) =>
      call({ op: 'snapshot', bundleId, path, maxDepth, maxNodes, activateWaitMs }),
    getValue: (bundleId, path) => call({ op: 'getValue', bundleId, path }),
    setValue: (bundleId, path, text) => call({ op: 'setValue', bundleId, path }, text),
    press: (bundleId, path) => call({ op: 'press', bundleId, path }),
    paste: (bundleId, path, text) => call({ op: 'paste', bundleId, path }, text),
  };
}
