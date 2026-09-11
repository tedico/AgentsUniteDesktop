import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export function makeStub(dir, { stdout = '', stderr = '', code = 0 }) {
  const p = path.join(dir, `stub-${Math.random().toString(36).slice(2)}`);
  fs.writeFileSync(p, `#!/usr/bin/env node
const fs = require('node:fs');
let stdin = '';
try { stdin = fs.readFileSync(0, 'utf8'); } catch {}
fs.writeFileSync(process.env.STUB_OUT, JSON.stringify({ argv: process.argv.slice(2), stdin }));
process.stdout.write(${JSON.stringify(stdout)});
process.stderr.write(${JSON.stringify(stderr)});
process.exit(${code});
`);
  fs.chmodSync(p, 0o755);
  return p;
}

export function readStubCall() {
  return JSON.parse(fs.readFileSync(process.env.STUB_OUT, 'utf8'));
}

export function stubDir() {
  const d = fs.mkdtempSync(path.join(os.tmpdir(), 'unite-stub-'));
  process.env.STUB_OUT = path.join(d, 'call.json');
  return d;
}
