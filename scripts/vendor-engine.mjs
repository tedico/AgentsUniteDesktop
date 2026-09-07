#!/usr/bin/env node
// Copies the engine modules this repo imports out of the AgentsUnite repo
// at the pinned commit into vendor/agentsunite/. Only the listed modules
// and their relative-import closure are copied — never anything outside
// lib/. Runtime must not import from ../AgentsUnite.
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, 'vendor', 'agentsunite');
const RELATIVE_IMPORT = /from\s+'(\.\.?\/[^']+)'/g;

export function vendorEngine({ pin, root = ROOT, out = OUT, git = gitShow }) {
  const repo = path.resolve(root, pin.repo);
  const wanted = [...pin.modules];
  const done = new Map();
  while (wanted.length > 0) {
    const mod = wanted.shift();
    if (done.has(mod)) continue;
    if (!mod.startsWith('lib/')) throw new Error(`refusing to vendor ${mod}: only lib/ modules are allowed`);
    const src = git(repo, pin.commit, mod);
    done.set(mod, src);
    for (const [, rel] of src.matchAll(RELATIVE_IMPORT)) {
      wanted.push(path.posix.normalize(path.posix.join(path.posix.dirname(mod), rel)));
    }
  }
  fs.rmSync(out, { recursive: true, force: true });
  for (const [mod, src] of done) {
    const dest = path.join(out, mod);
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.writeFileSync(dest, src);
  }
  fs.writeFileSync(path.join(out, 'COMMIT'), `${pin.commit}\n`);
  return [...done.keys()].sort();
}

function gitShow(repo, commit, file) {
  try {
    return execFileSync('git', ['-C', repo, 'show', `${commit}:${file}`], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] });
  } catch (err) {
    throw new Error(`cannot read ${file} at ${commit} from ${repo}: ${(err.stderr ?? err.message).toString().trim()}`);
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const pin = JSON.parse(fs.readFileSync(path.join(ROOT, 'engine.pin.json'), 'utf8'));
  const files = vendorEngine({ pin });
  console.log(`vendored ${files.length} modules at ${pin.commit}:\n  ${files.join('\n  ')}`);
}
