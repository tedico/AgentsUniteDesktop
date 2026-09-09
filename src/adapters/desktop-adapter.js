import { findNode, itemTexts, thinkingChars } from '../ax/query.js';
import { extractReply } from './reply.js';
import { stripCitations } from './citations.js';
import { ERRORS, describeAxError } from '../shared/errors.js';
import { formatDiagnostic, formatTraceRow, inferErrorCode } from '../shared/diagnostics.js';

export const sessionRefFor = (seat) => `desktop:${seat}`;
// Identical non-busy polls required before settle() returns. Owner, 2026-09-08:
// 3 polls ≈ 3s at pollMs=1000. `stable` counts matches after the first sighting.
export const STABLE_IDLE_POLLS = 3;
const defaultSleep = (ms) => new Promise((r) => setTimeout(r, ms));

const phaseLabel = (phase) => (phase == null ? 'pre-wait' : phase === 'streaming' ? 'awaiting-reply' : phase);

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
      const t0 = now();
      const trace = [];
      const fail = (error, obs = {}) => {
        const code = obs.code ?? inferErrorCode(error);
        const extra = { promptChars: String(prompt ?? '').length, replyChars: 0, polls: trace.length, ...obs };
        delete extra.code;
        const diagnostics = { ...extra, trace };
        const stderr = [
          formatDiagnostic({ seat, code, elapsedMs: now() - t0, extra }),
          ...trace.map(formatTraceRow),
        ].join('\n');
        return { ok: false, error, sessionRef, errorCode: code, stderr, diagnostics };
      };
      const progress = (phase, extra = {}) => onProgress?.({ ts: now(), phase, ...extra });
      const deadline = now() + timeoutMs;

      const snapshot = async () => {
        const s = await helper.snapshot(bundleId, { activateWaitMs: selectors.activateWaitMs ?? 300 });
        return s.ok ? s : { ok: false, error: describeAxError(s, appName) };
      };
      const items = (tree) => itemTexts(findNode(tree, selectors.conversation), selectors.messageItem);
      const holds = async (path) => {
        const v = await helper.getValue(bundleId, path);
        return v.ok && typeof v.value === 'string' && v.value.replace(/\r\n/g, '\n').trim() === prompt.replace(/\r\n/g, '\n').trim();
      };
      // Claude: Stop visible. Gemini: Send hidden while generating, but Send
      // is also hidden when idle+empty (mic shows). Busy = no Stop/Send/mic.
      const busySignal = (tree) => {
        if (findNode(tree, selectors.stopButton)) return { busy: true, via: 'stop' };
        if (!selectors.busyWhenSendAbsent) {
          return { busy: false, via: findNode(tree, selectors.sendButton) ? 'send' : 'none' };
        }
        if (findNode(tree, selectors.sendButton)) return { busy: false, via: 'send' };
        if (selectors.idleButton && findNode(tree, selectors.idleButton)) return { busy: false, via: 'idle' };
        return { busy: true, via: 'none' };
      };
      const isBusy = (tree) => busySignal(tree).busy;

      // Poll until not busy and the conversation text is unchanged across
      // STABLE_IDLE_POLLS consecutive polls. Used for "already generating" and the reply.
      const settle = async (phase, baseChars) => {
        let last = null;
        let stable = 0;
        let lastThink = -1;
        const label = phaseLabel(phase);
        for (;;) {
          if (signal?.aborted) return { aborted: true };
          if (now() >= deadline) return { timedOut: true };
          await sleep(pollMs);
          if (signal?.aborted) return { aborted: true };
          const tSnap = now();
          const s = await snapshot();
          const snapMs = now() - tSnap;
          if (!s.ok) return { error: s.error };
          const current = items(s.tree);
          const text = current.join('\n\n');
          const sig = busySignal(s.tree);
          const think = thinkingChars(s.tree, selectors.thinkingItem);
          const thinkGrew = lastThink >= 0 && think > lastThink;
          const busy = sig.busy || thinkGrew;
          const via = thinkGrew ? 'thinking' : sig.via;
          lastThink = think;
          if (phase) progress(phase, { chars: Math.max(0, text.length - baseChars) });
          // An empty read is not evidence the conversation stopped changing —
          // it is evidence we cannot see it. Never let it count toward stability.
          const changed = text !== last;
          if (busy || !text) stable = 0;
          else stable = text === last ? stable + 1 : 0;
          last = text;
          trace.push({
            elapsedMs: now() - t0,
            busy,
            via,
            items: current.length,
            chars: text.length,
            think,
            stable,
            phase: label,
            snapMs,
            truncated: s.truncated === true,
            // Text only where it changed; no `texts` means "same as the row above".
            texts: changed ? current : undefined,
          });
          if (busy) continue;
          if (stable >= STABLE_IDLE_POLLS - 1) return { ok: true, tree: s.tree, items: current };
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
      if (!replyText.trim()) {
        const after = finished.items;
        const think = thinkingChars(finished.tree, selectors.thinkingItem);
        const observed = {
          messagesBefore: before.length,
          messagesAfter: after.length,
          thinkingChars: think,
        };
        return fail(ERRORS.emptyReply(appName, observed), {
          code: think > 0 ? 'stillGenerating' : 'emptyReply',
          ...observed,
          candidateLengths: after.map((t) => t.length),
          selector: selectors.messageItem?.role ?? 'unknown',
        });
      }
      progress('done', { chars: replyText.length });
      return {
        ok: true,
        replyText,
        sessionRef,
        diagnostics: {
          promptChars: String(prompt ?? '').length,
          replyChars: replyText.length,
          polls: trace.length,
          trace,
        },
      };
    },
  };
}
