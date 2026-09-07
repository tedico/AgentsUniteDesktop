import selectors from '../selectors/gemini.js';
import { makeDesktopAdapter } from './desktop-adapter.js';

export function geminiDesktopAdapter({ helper, timeoutMs }) {
  return makeDesktopAdapter({ seat: 'gemini', selectors, helper, timeoutMs });
}
