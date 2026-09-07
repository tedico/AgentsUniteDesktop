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
        return v.ok && typeof v.value === 'string' && v.value.replace(/\r\n/g, '\n').trim() === prompt.replace(/\r\n/g, '\n').trim();
      };
      // Claude: Stop visible. Gemini: Send hidden while generating, but Send
      // is also hidden when idle+empty (mic shows). Busy = no Stop/Send/mic.
      const isBusy = (tree) => {
        if (findNode(tree, selectors.stopButton)) return true;
        if (!selectors.busyWhenSendAbsent) return false;
        if (findNode(tree, selectors.sendButton)) return false;
        if (selectors.idleButton && findNode(tree, selectors.idleButton)) return false;
        return true;
      };

      // Poll until not busy and the conversation text is the same across two
      // consecutive polls. Used both for "already generating" and the reply.
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
          if (isBusy(s.tree)) { stable = 0; last = text; continue; }
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
      if (!findNode(tree, selectors.conversation)) return fail(ERRORS.selectorsNotFound(appName, 'conversation area', selectors.file));

      if (isBusy(tree)) {
        const idle = await settle(null, 0);
        if (idle.aborted) return fail('skipped');
        if (idle.timedOut) return fail(ERRORS.appBusy(appName));
        if (idle.error) return fail(idle.error);
        tree = idle.tree;
      }
      const before = items(tree);

      // 2. Write: direct value set, verified; clipboard paste as the fallback.
      // Chromium mutates the AX tree when the composer fills, so the pre-write
      // path is stale for getValue. Re-snapshot and re-find before holds().
      progress('pasting');
      let composer = findNode(tree, selectors.composer);
      const confirmLanded = async () => {
        const after = await snapshot();
        if (!after.ok) return after;
        tree = after.tree;
        composer = findNode(tree, selectors.composer);
        return { ok: true, landed: composer ? await holds(composer.path) : false };
      };
      let landed = (await helper.setValue(bundleId, composer.path, prompt)).ok;
      let confirmed = landed ? await confirmLanded() : { ok: true, landed: false };
      if (!confirmed.ok) return fail(confirmed.error);
      landed = confirmed.landed;
      if (!landed) {
        if (!composer) return fail(ERRORS.selectorsNotFound(appName, 'message box (text did not land)', selectors.file));
        const p = await helper.paste(bundleId, composer.path, prompt);
        confirmed = await confirmLanded();
        if (!confirmed.ok) return fail(confirmed.error);
        landed = p.ok && confirmed.landed;
      }
      if (!landed) return fail(ERRORS.selectorsNotFound(appName, 'message box (text did not land)', selectors.file));

      // Send is found on the post-write tree (same snapshot as holds()).
      const send = findNode(tree, selectors.sendButton);
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
