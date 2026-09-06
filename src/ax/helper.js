import { runJxa } from './jxa.js';

// The only accessibility surface the adapters and preflight touch: find is
// done in JS over a snapshot (src/ax/query.js); everything here is one
// osascript call. Every method returns a plain object so tests can replay
// saved trees (test/helpers/fake-helper.js). Replace `run` with a compiled
// sidecar later without touching the adapters.
export function makeAxHelper({ run = runJxa } = {}) {
  const call = (command, text = '') => run({ command, text });
  return {
    async isRunning(bundleId) {
      const r = await call({ op: 'running', bundleId });
      return r.ok === true && r.running === true;
    },
    enableManualAccessibility: (bundleId) => call({ op: 'manualA11y', bundleId }),
    windows: (bundleId) => call({ op: 'windows', bundleId }),
    snapshot: (bundleId, { path = [], maxDepth = 60, maxNodes = 6000 } = {}) =>
      call({ op: 'snapshot', bundleId, path, maxDepth, maxNodes }),
    getValue: (bundleId, path) => call({ op: 'getValue', bundleId, path }),
    setValue: (bundleId, path, text) => call({ op: 'setValue', bundleId, path }, text),
    press: (bundleId, path) => call({ op: 'press', bundleId, path }),
    paste: (bundleId, path, text) => call({ op: 'paste', bundleId, path }, text),
  };
}
