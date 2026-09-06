#!/usr/bin/env node
// Phase 1 probe. Answers the spec's five yes/no questions per app and saves
// accessibility trees as fixtures. Run only against a throwaway "hello" chat:
// fixtures are committed and contain whatever is on screen.
//
//   node scripts/probe.mjs <claude|gemini> snapshot <idle|streaming|done>
//   node scripts/probe.mjs <claude|gemini> value <path>      e.g. 0,3,1
//   node scripts/probe.mjs <claude|gemini> write <path>      setValue "probe hello" then read back
//   node scripts/probe.mjs <claude|gemini> paste <path>      clipboard fallback, then read back
//   node scripts/probe.mjs <claude|gemini> press <path>      press a button (e.g. Send)
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { makeAxHelper } from '../src/ax/helper.js';
import { runJxa } from '../src/ax/jxa.js';
import { findAll, collectText, walk } from '../src/ax/query.js';

const APPS = {
  claude: { appName: 'Claude', bundleId: 'com.anthropic.claudefordesktop', manualAccessibility: true },
  gemini: { appName: 'Gemini', bundleId: 'com.google.GeminiMacOS', manualAccessibility: false },
};
const PROBE_TEXT = 'probe hello';
const [app, mode, arg] = process.argv.slice(2);
if (!APPS[app] || !['snapshot', 'value', 'write', 'paste', 'press'].includes(mode)) usage();
if (mode === 'snapshot' && !['idle', 'streaming', 'done'].includes(arg)) usage();
if (mode !== 'snapshot' && !/^\d+(,\d+)*$/.test(arg ?? '')) usage();

const { appName, bundleId, manualAccessibility } = APPS[app];
// Chromium trees are deep (composer ~depth 27) and the sidebar can be huge;
// 20s / maxDepth 60 timed out or threw "Can't get object" on Claude.
const helper = makeAxHelper({
  run: ({ command, text }) => runJxa({
    command,
    text,
    timeoutMs: command.op === 'snapshot' ? 180000 : 20000,
  }),
});
const parsePath = (s) => s.split(',').map(Number);

if (!(await helper.isRunning(bundleId))) { console.error(`${appName} is not running`); process.exit(1); }
try { execFileSync('osascript', ['-l', 'JavaScript', '-e', `Application('${bundleId}').activate()`]); } catch { /* probe continues; windows() reports the result */ }
await new Promise((r) => setTimeout(r, 500));
if (manualAccessibility) {
  console.log('manualA11y:', await helper.enableManualAccessibility(bundleId));
  await new Promise((r) => setTimeout(r, 1000));
}
console.log('windows:', await helper.windows(bundleId));

if (mode === 'snapshot') {
  const t0 = Date.now();
  const composerHit = (tree) => [...walk(tree)].some((n) => n.role === 'AXTextArea' && /Ask Gemini|Write your prompt|prompt/i.test(`${n.description ?? ''} ${n.help ?? ''}`));
  let snap;
  // Gemini's expanded sidebar (100+ outline rows) eats a full-window walk;
  // the conversation lives in the split pane at [0,0,0,2].
  if (app === 'gemini') {
    snap = await helper.snapshot(bundleId, { path: [0, 0, 0, 2], maxDepth: 25, maxNodes: 3000 });
    if (!snap.ok || !composerHit(snap.tree)) snap = await helper.snapshot(bundleId, { maxDepth: 40, maxNodes: 8000 });
  } else {
    snap = await helper.snapshot(bundleId, { maxDepth: 40, maxNodes: 8000 });
  }
  const ms = Date.now() - t0;
  if (!snap.ok) { console.error('snapshot failed:', snap); process.exit(1); }
  const nodes = [...walk(snap.tree)].length;
  console.log(`snapshot: ${nodes} nodes in ${ms}ms${snap.truncated ? ' — TRUNCATED, raise maxNodes in src/ax/helper.js' : ''}`);
  const out = path.join('test', 'fixtures', `${app}-${arg}.json`);
  fs.mkdirSync(path.dirname(out), { recursive: true });
  fs.writeFileSync(out, JSON.stringify({ capturedAt: new Date().toISOString(), app, state: arg, bundleId, nodes, snapshotMs: ms, tree: snap.tree }, null, 1));
  console.log('saved', out);

  const roles = {};
  for (const n of walk(snap.tree)) roles[n.role] = (roles[n.role] ?? 0) + 1;
  console.log('\nroles:', roles);
  const brief = (h) => JSON.stringify({ path: h.path, role: h.role, subrole: h.subrole, name: h.name, title: h.title, description: h.description, help: h.help, value: (h.value ?? '').slice(0, 60), enabled: h.enabled });
  const show = (label, sel) => {
    const hits = findAll(snap.tree, sel);
    console.log(`\n${label}: ${hits.length}`);
    for (const h of hits.slice(0, 12)) console.log(' ', brief(h));
  };
  show('AXTextArea (composer candidates)', { role: 'AXTextArea' });
  show('AXTextField', { role: 'AXTextField' });
  show('AXButton', { role: 'AXButton' });
  const groups = [...walk(snap.tree)].filter((n) => n.role === 'AXGroup')
    .map((g) => ({ path: g.path, textLen: collectText(g).length, description: g.description, name: g.name, help: g.help, children: g.children.length }))
    .sort((a, b) => b.textLen - a.textLen).slice(0, 6);
  console.log('\nlargest AXGroups by text (conversation candidates):');
  for (const g of groups) console.log(' ', JSON.stringify(g));
  process.exit(0);
}

const p = parsePath(arg);
if (mode === 'value') { console.log(await helper.getValue(bundleId, p)); process.exit(0); }
if (mode === 'press') { console.log(await helper.press(bundleId, p)); process.exit(0); }
const r = mode === 'write' ? await helper.setValue(bundleId, p, PROBE_TEXT) : await helper.paste(bundleId, p, PROBE_TEXT);
console.log(`${mode}:`, r);
const back = await helper.getValue(bundleId, p);
console.log('read back:', back);
console.log(back.ok && back.value?.trim() === PROBE_TEXT ? `YES — ${mode} landed` : `NO — ${mode} did not land`);

function usage() {
  console.error('usage: node scripts/probe.mjs <claude|gemini> snapshot <idle|streaming|done> | value <path> | write <path> | paste <path> | press <path>');
  process.exit(2);
}
