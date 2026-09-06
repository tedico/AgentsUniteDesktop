import fs from 'node:fs';
import path from 'node:path';
import { UNITE_DIR } from './paths.js';

export const DEFAULT_CONFIG = {
  roster: ['claude', 'gemini', 'cursor'],
  turnCap: 8,
  timeoutMs: 300000,
  binaries: { claude: 'claude', gemini: 'agy', cursor: 'cursor-agent' },
  models: {},
  mcp: false,          // claude seat: load Ted's claude.ai MCP connectors? The room never needs them.
  planner: 'claude',   // seat that drives /plan by default (only seat with superpowers today)
};

export function loadConfig(root) {
  let user = {};
  try {
    user = JSON.parse(fs.readFileSync(path.join(root, UNITE_DIR, 'config.json'), 'utf8'));
  } catch { /* no config file is fine */ }
  return {
    ...DEFAULT_CONFIG,
    ...user,
    roster: [...(user.roster ?? DEFAULT_CONFIG.roster)],
    binaries: { ...DEFAULT_CONFIG.binaries, ...(user.binaries ?? {}) },
    models: { ...DEFAULT_CONFIG.models, ...(user.models ?? {}) },
  };
}
