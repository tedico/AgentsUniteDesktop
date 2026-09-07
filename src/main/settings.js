import fs from 'node:fs';
import path from 'node:path';
import { UNITE_DIR } from '../../vendor/agentsunite/lib/paths.js';
import { DEFAULT_CONFIG } from '../../vendor/agentsunite/lib/config.js';

// Desktop-only settings (which project folder, which chat) live in Electron's
// userData. Turn cap and timeout belong to the room, so they live in the
// CLI's own <root>/.unite/config.json and both tools see the same values.
export const DEFAULTS = { root: null, chat: 'main' };
const CHAT_NAME_RE = /^[A-Za-z0-9._-]+$/;
const LIMITS = { turnCap: [1, 50], timeoutMs: [5000, 1800000] };

export function loadSettings(userDataDir) {
  try {
    return normalize(JSON.parse(fs.readFileSync(path.join(userDataDir, 'settings.json'), 'utf8')));
  } catch { return { ...DEFAULTS }; }
}

export function saveSettings(userDataDir, next) {
  const merged = normalize(next);
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.writeFileSync(path.join(userDataDir, 'settings.json'), JSON.stringify(merged, null, 2));
  return merged;
}

function normalize(s) {
  const root = typeof s?.root === 'string' && s.root ? s.root : null;
  const chat = typeof s?.chat === 'string' && CHAT_NAME_RE.test(s.chat) && s.chat !== '.' && s.chat !== '..' ? s.chat : DEFAULTS.chat;
  return { root, chat };
}

const configPath = (root) => path.join(root, UNITE_DIR, 'config.json');

function readConfigFile(root) {
  try { return JSON.parse(fs.readFileSync(configPath(root), 'utf8')); }
  catch { return {}; }
}

export function readRoomConfig(root) {
  const file = root ? readConfigFile(root) : {};
  return {
    turnCap: inRange(file.turnCap, LIMITS.turnCap) ? file.turnCap : DEFAULT_CONFIG.turnCap,
    timeoutMs: inRange(file.timeoutMs, LIMITS.timeoutMs) ? file.timeoutMs : DEFAULT_CONFIG.timeoutMs,
  };
}

export function writeRoomConfig(root, { turnCap, timeoutMs }) {
  const file = readConfigFile(root);
  if (inRange(turnCap, LIMITS.turnCap)) file.turnCap = turnCap;
  if (inRange(timeoutMs, LIMITS.timeoutMs)) file.timeoutMs = timeoutMs;
  fs.mkdirSync(path.dirname(configPath(root)), { recursive: true });
  fs.writeFileSync(configPath(root), JSON.stringify(file, null, 2) + '\n');
  return readRoomConfig(root);
}

function inRange(v, [lo, hi]) {
  return Number.isInteger(v) && v >= lo && v <= hi;
}
