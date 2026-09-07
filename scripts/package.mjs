#!/usr/bin/env node
// Builds dist/…/AgentsUnite Desktop.app. Refuses to package a vendor/ that
// drifted from engine.pin.json, drops everything the app never loads, adds
// the Apple Events purpose string, and ad-hoc signs so the Accessibility and
// Automation grants stick to this bundle across rebuilds.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const IGNORE = [
  /^\/(test|docs|scripts|dist|node_modules|\.unite|\.git|\.claude)(\/|$)/,
  /^\/(engine\.pin\.json|SPRINT\.md|\.gitignore|package-lock\.json)$/,
  /\.DS_Store$/,
];
export const EXTEND_INFO = {
  NSAppleEventsUsageDescription: 'AgentsUnite Desktop reads and types into the Claude and Gemini windows through System Events.',
  LSMinimumSystemVersion: '14.0',
};
export const shouldIgnore = (p) => IGNORE.some((re) => re.test(p));

async function main() {
  const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
  const pin = JSON.parse(fs.readFileSync(path.join(root, 'engine.pin.json'), 'utf8'));
  const vendored = fs.readFileSync(path.join(root, 'vendor/agentsunite/COMMIT'), 'utf8').trim();
  if (vendored !== pin.commit) {
    console.error(`vendor/agentsunite is at ${vendored}; engine.pin.json says ${pin.commit} — run npm run vendor:engine`);
    process.exit(1);
  }
  const { packager } = await import('@electron/packager');
  const [outDir] = await packager({
    dir: root,
    out: path.join(root, 'dist'),
    overwrite: true,
    platform: 'darwin',
    arch: process.arch,
    name: 'AgentsUnite Desktop',
    appBundleId: 'com.tedsandico.agentsunite-desktop',
    ignore: shouldIgnore,
    prune: true,
    asar: false, // ax.jxa must stay a real file so osascript can load it
    extendInfo: EXTEND_INFO,
  });
  const appPath = path.join(outDir, 'AgentsUnite Desktop.app');
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], { stdio: 'inherit' });
  console.log(`packaged ${appPath}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) await main();
