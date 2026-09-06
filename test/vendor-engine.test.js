import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { vendorEngine } from '../scripts/vendor-engine.mjs';

const FILES = {
  'lib/engine.js': "import { x } from './deltas.js';\nimport { y } from './transcript.js';\nexport const a = 1;\n",
  'lib/deltas.js': 'export const x = 1;\n',
  'lib/transcript.js': "import fs from 'node:fs';\nexport const y = 2;\n",
  'lib/adapters/claude.js': 'export const never = true;\n',
};
const fakeGit = (repo, commit, file) => {
  if (!(file in FILES)) throw new Error(`cannot read ${file} at ${commit}`);
  return FILES[file];
};
const outDir = () => fs.mkdtempSync(path.join(os.tmpdir(), 'unite-vendor-'));

test('vendors listed modules plus their relative-import closure, nothing else', () => {
  const out = outDir();
  const got = vendorEngine({ pin: { repo: '.', commit: 'abc123', modules: ['lib/engine.js'] }, root: '/x', out, git: fakeGit });
  assert.deepEqual(got, ['lib/deltas.js', 'lib/engine.js', 'lib/transcript.js']);
  assert.equal(fs.readFileSync(path.join(out, 'lib/engine.js'), 'utf8'), FILES['lib/engine.js']);
  assert.equal(fs.readFileSync(path.join(out, 'COMMIT'), 'utf8'), 'abc123\n');
  assert.ok(!fs.existsSync(path.join(out, 'lib/adapters/claude.js')), 'CLI adapters must not be vendored');
});

test('node: imports are not followed', () => {
  const out = outDir();
  const got = vendorEngine({ pin: { repo: '.', commit: 'abc123', modules: ['lib/transcript.js'] }, root: '/x', out, git: fakeGit });
  assert.deepEqual(got, ['lib/transcript.js']);
});

test('refuses a module outside lib/', () => {
  assert.throws(
    () => vendorEngine({ pin: { repo: '.', commit: 'abc123', modules: ['bin/unite.js'] }, root: '/x', out: outDir(), git: fakeGit }),
    /only lib\/ modules/,
  );
});

test('throws when a module is missing at the pinned commit', () => {
  assert.throws(
    () => vendorEngine({ pin: { repo: '.', commit: 'abc123', modules: ['lib/nope.js'] }, root: '/x', out: outDir(), git: fakeGit }),
    /cannot read lib\/nope\.js/,
  );
});

test('a previous vendor directory is replaced, not merged', () => {
  const out = outDir();
  fs.mkdirSync(path.join(out, 'lib'), { recursive: true });
  fs.writeFileSync(path.join(out, 'lib/stale.js'), 'stale');
  vendorEngine({ pin: { repo: '.', commit: 'abc123', modules: ['lib/deltas.js'] }, root: '/x', out, git: fakeGit });
  assert.ok(!fs.existsSync(path.join(out, 'lib/stale.js')));
});
