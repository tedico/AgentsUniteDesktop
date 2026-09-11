import { test } from 'node:test';
import assert from 'node:assert/strict';
import { FALLBACK_GEMINI_MODEL, pickTopGeminiModel, resolveGeminiModel } from '../src/main/gemini-model.js';

// Real `agy models` stdout, captured 2026-09-10 (agy 1.2.0). The status line
// "Fetching available models..." goes to stderr and is not part of stdout.
const MODELS_2026_09_10 = [
  'gemini-3.8-flash-high\tGemini 3.8 Flash (High)',
  'gemini-3.8-flash-medium\tGemini 3.8 Flash (Medium)',
  'gemini-3.8-flash-low\tGemini 3.8 Flash (Low)',
  'gemini-3.7-flash-high\tGemini 3.7 Flash (High)',
  'gemini-3.7-flash-medium\tGemini 3.7 Flash (Medium)',
  'gemini-3.7-flash-low\tGemini 3.7 Flash (Low)',
  'gemini-3.6-flash-high\tGemini 3.6 Flash (High)',
  'gemini-3.6-flash-medium\tGemini 3.6 Flash (Medium)',
  'gemini-3.6-flash-low\tGemini 3.6 Flash (Low)',
  'gemini-3.1-pro-high\tGemini 3.1 Pro (High)',
  'gemini-3.1-pro-low\tGemini 3.1 Pro (Low)',
  'claude-sonnet-4-6\tClaude Sonnet 4.6 (Thinking)',
  'claude-opus-4-6-thinking\tClaude Opus 4.6 (Thinking)',
  'gpt-oss-120b-medium\tGPT-OSS 120B (Medium)',
].join('\n') + '\n';

test('the fallback is the Pro high id Ted approved on 2026-09-10', () => {
  assert.equal(FALLBACK_GEMINI_MODEL, 'gemini-3.1-pro-high');
});

test('pickTopGeminiModel: the captured list yields gemini-3.1-pro-high, never a newer Flash', () => {
  assert.equal(pickTopGeminiModel(MODELS_2026_09_10), 'gemini-3.1-pro-high');
});

test('pickTopGeminiModel: a newer Pro high wins on (major, minor), numerically not lexically', () => {
  const withNewer = MODELS_2026_09_10 + 'gemini-4.0-pro-high\tGemini 4.0 Pro (High)\n';
  assert.equal(pickTopGeminiModel(withNewer), 'gemini-4.0-pro-high');
  const tenBeatsNine = 'gemini-9.9-pro-high\tx\ngemini-10.2-pro-high\ty\n';
  assert.equal(pickTopGeminiModel(tenBeatsNine), 'gemini-10.2-pro-high');
  const minorOrder = 'gemini-3.1-pro-high\tx\ngemini-3.10-pro-high\ty\n';
  assert.equal(pickTopGeminiModel(minorOrder), 'gemini-3.10-pro-high');
});

test('pickTopGeminiModel: Pro at lower effort, Flash-only lists, garbage and empty input give null', () => {
  assert.equal(pickTopGeminiModel('gemini-3.1-pro-low\tGemini 3.1 Pro (Low)\ngemini-3.8-flash-high\tx\n'), null);
  assert.equal(pickTopGeminiModel('gemini-3.8-flash-high\tGemini 3.8 Flash (High)\n'), null);
  assert.equal(pickTopGeminiModel('Fetching available models...\nnope\n'), null);
  assert.equal(pickTopGeminiModel(''), null);
  assert.equal(pickTopGeminiModel(undefined), null);
});

test('resolveGeminiModel: a configured model wins and no subprocess runs', async () => {
  let called = false;
  const run = async () => { called = true; return { code: 0, stdout: MODELS_2026_09_10, stderr: '', timedOut: false, spawnError: false }; };
  const r = await resolveGeminiModel({ configured: '  gemini-3.8-flash-high ', run });
  assert.deepEqual(r, { model: 'gemini-3.8-flash-high', source: 'config' });
  assert.equal(called, false);
});

test('resolveGeminiModel: picks from `agy models` with the seat binary and a 15 s cap', async () => {
  let seen;
  const run = async (opts) => { seen = opts; return { code: 0, stdout: MODELS_2026_09_10, stderr: 'Fetching available models...\n', timedOut: false, spawnError: false }; };
  const r = await resolveGeminiModel({ configured: '', binary: 'agy-nightly', run });
  assert.deepEqual(r, { model: 'gemini-3.1-pro-high', source: 'agy models' });
  assert.equal(seen.cmd, 'agy-nightly');
  assert.deepEqual(seen.args, ['models']);
  assert.equal(seen.timeoutMs, 15000);
});

test('resolveGeminiModel: spawn error, non-zero exit, timeout, no Pro, and a throwing runner all fall back', async () => {
  const cases = [
    async () => ({ code: 0, stdout: '', stderr: '', timedOut: false, spawnError: true }),
    async () => ({ code: 1, stdout: MODELS_2026_09_10, stderr: 'You are not logged into Antigravity.', timedOut: false, spawnError: false }),
    async () => ({ code: null, stdout: '', stderr: '', timedOut: true, spawnError: false }),
    async () => ({ code: 0, stdout: 'gemini-3.8-flash-high\tGemini 3.8 Flash (High)\n', stderr: '', timedOut: false, spawnError: false }),
    async () => { throw new Error('boom'); },
  ];
  for (const run of cases) {
    const r = await resolveGeminiModel({ configured: undefined, run });
    assert.deepEqual(r, { model: 'gemini-3.1-pro-high', source: 'fallback' });
  }
});
