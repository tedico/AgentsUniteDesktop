import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { claudeDesktopAdapter } from '../src/adapters/claude-desktop.js';
import { geminiDesktopAdapter } from '../src/adapters/gemini-desktop.js';
import { makeFakeHelper } from './helpers/fake-helper.js';

const fixture = (name) => JSON.parse(fs.readFileSync(`test/fixtures/${name}.json`, 'utf8')).tree;
const FACTORY = { claude: claudeDesktopAdapter, gemini: geminiDesktopAdapter };

for (const seat of ['claude', 'gemini']) {
  test(`${seat}: a real idle→streaming→done sequence yields a non-empty reply`, async () => {
    const helper = makeFakeHelper({ trees: [fixture(`${seat}-idle`), fixture(`${seat}-idle`), fixture(`${seat}-streaming`), fixture(`${seat}-done`)] });
    const a = FACTORY[seat]({ helper, timeoutMs: 10000 });
    // The probe's prompt text is whatever Ted typed; the reply is everything
    // new after it, so a non-matching prompt still leaves the reply intact.
    const res = await a.invoke({ prompt: 'Reply with one sentence and then a three-line JavaScript code block.', sessionRef: null });
    assert.equal(res.ok, true, res.error);
    assert.equal(res.sessionRef, `desktop:${seat}`);
    assert.ok(res.replyText.length > 0);
    assert.equal(a.seat, seat);
  });
}

test('gemini strips citation markers from a real done fixture', async () => {
  const helper = makeFakeHelper({ trees: [fixture('gemini-idle'), fixture('gemini-idle'), fixture('gemini-done')] });
  const res = await geminiDesktopAdapter({ helper, timeoutMs: 10000 }).invoke({ prompt: 'x', sessionRef: null });
  assert.equal(res.ok, true, res.error);
  assert.doesNotMatch(res.replyText, /\(start_span\)|\(end_span\)/);
});
