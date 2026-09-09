import { loadConfig } from '../../vendor/agentsunite/lib/config.js';
import { readRoomConfig } from '../main/settings.js';

// The terminal runner's config: the vendored loader (room config over engine
// defaults) with the desktop's fixed two-seat roster and the desktop's own
// turn-cap default, so the CLI runner and the GUI agree on the cap.
export function desktopConfig(root) {
  return { ...loadConfig(root), roster: ['claude', 'gemini'], turnCap: readRoomConfig(root).turnCap };
}
