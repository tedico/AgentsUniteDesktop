import { findNode, itemTexts } from '../ax/query.js';
import { extractReply } from './reply.js';
import { stripCitations } from './citations.js';
import { ERRORS, describeAxError } from '../shared/errors.js';

export const sessionRefFor = (seat) => `desktop:${seat}`;
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

// One adapter for both desktop apps; the differences live in `selectors`.
// Same contract as the CLI adapters: invoke({ prompt, sessionRef, signal,
// onProgress }) → { ok:true, replyText, sessionRef } | { ok:false, error }.
// The open chat is the session, so sessionRef is a constant per seat.
export function makeDesktopAdapter({ seat, selectors, helper, timeoutMs = 300000, pollMs = 1000, sleep = defaultSleep, now = () => Date.now() }) {
  const { appName, bundleId } = selectors;
  const sessionRef = sessionRefFor(seat);

  return {
    seat,
    async invoke({ prompt, signal, onProgress }) {
      const fail = (error) => ({ ok: false, error, sessionRef });
      const progress = (phase, extra = {}) => onProgress?.({ ts: now(), phase, ...extra });
      const deadline = now() + timeoutMs;

      const snapshot = async () => {
        const s = await helper.snapshot(bundleId);
        return s.ok ? s : { ok: false, error: describeAxError(s, appName) };
      };
      const items = (tree) => itemTexts(findNode(tree, selectors.conversation), selectors.messageItem);
      const holds = async (path) => {
        const v = await helper.getValue(bundleId, path);
        return v.ok && typeof v.value === 'string' && v.value.trim() === prompt.trim();
      };

      // Poll until the stop button is gone and the conversation text is the
      // same across two consecutive polls. Used both for "the app was already
      // generating when the turn started" and for the reply itself.
      const settle = async (phase, baseChars) => {
        let last = null;
        let stable = 0;
        for (;;) {
          if (signal?.aborted) return { aborted: true };
          if (now() >= deadline) return { timedOut: true };
          await sleep(pollMs);
          if (signal?.aborted) return { aborted: true };
          const s = await snapshot();
          if (!s.ok) return { error: s.error };
          const current = items(s.tree);
          const text = current.join('\n\n');
          if (phase) progress(phase, { chars: Math.max(0, text.length - baseChars) });
          if (findNode(s.tree, selectors.stopButton)) { stable = 0; last = text; continue; }
          stable = text === last ? stable + 1 : 0;
          last = text;
          if (stable >= 1) return { ok: true, tree: s.tree, items: current };
        }
      };

      // 1. Find.
      if (!(await helper.isRunning(bundleId))) return fail(ERRORS.appNotRunning(appName));
      if (selectors.manualAccessibility) await helper.enableManualAccessibility(bundleId);
      let s = await snapshot();
      if (!s.ok) return fail(s.error);
      let tree = s.tree;
      if (!findNode(tree, selectors.composer)) return fail(ERRORS.noChatOpen(appName));
      if (!findNode(tree, selectors.sendButton)) return fail(ERRORS.selectorsNotFound(appName, 'send button', selectors.file));
      if (!findNode(tree, selectors.conversation)) return fail(ERRORS.selectorsNotFound(appName, 'conversation area', selectors.file));

      if (findNode(tree, selectors.stopButton)) {
        const idle = await settle(null, 0);
        if (idle.aborted) return fail('skipped');
        if (idle.timedOut) return fail(ERRORS.appBusy(appName));
        if (idle.error) return fail(idle.error);
        tree = idle.tree;
      }
      const before = items(tree);

      // 2. Write: direct value set, verified; clipboard paste as the fallback.
      progress('pasting');
      const composer = findNode(tree, selectors.composer);
      let landed = (await helper.setValue(bundleId, composer.path, prompt)).ok && (await holds(composer.path));
      if (!landed) {
        const p = await helper.paste(bundleId, composer.path, prompt);
        landed = p.ok && (await holds(composer.path));
      }
      if (!landed) return fail(ERRORS.selectorsNotFound(appName, 'message box (text did not land)', selectors.file));

      // Re-find the send button: the tree shifts when the composer fills.
      s = await snapshot();
      if (!s.ok) return fail(s.error);
      const send = findNode(s.tree, selectors.sendButton);
      if (!send) return fail(ERRORS.selectorsNotFound(appName, 'send button', selectors.file));
      const pressed = await helper.press(bundleId, send.path);
      if (!pressed.ok) return fail(describeAxError(pressed, appName));
      progress('sent');

      // 3. Wait.
      const finished = await settle('streaming', before.join('\n\n').length);
      if (finished.aborted) return fail('skipped');
      if (finished.timedOut) return fail(ERRORS.replyTimedOut(appName, Math.round(timeoutMs / 1000)));
      if (finished.error) return fail(finished.error);

      // 4. Read.
      let replyText = extractReply({ before, after: finished.items, prompt });
      if (selectors.stripCitations) replyText = stripCitations(replyText);
      if (!replyText.trim()) return fail(ERRORS.emptyReply(appName));
      progress('done', { chars: replyText.length });
      return { ok: true, replyText, sessionRef };
    },
  };
}
