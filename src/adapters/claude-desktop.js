import selectors from '../selectors/claude.js';
import { makeDesktopAdapter } from './desktop-adapter.js';

export function claudeDesktopAdapter({ helper, timeoutMs }) {
  return makeDesktopAdapter({ seat: 'claude', selectors, helper, timeoutMs });
}
