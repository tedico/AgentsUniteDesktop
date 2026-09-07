#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const target = path.join(root, 'Collaboration.md');

if (!fs.existsSync(target)) {
  console.error(`File not found: ${target}`);
  process.exit(1);
}

const initialMtime = fs.statSync(target).mtimeMs;
console.log(`[board-watcher] Watching ${target} (mtime: ${initialMtime})...`);

const timer = setInterval(() => {
  try {
    const currentMtime = fs.statSync(target).mtimeMs;
    if (currentMtime > initialMtime) {
      clearInterval(timer);
      console.log(`[board-watcher] Collaboration.md updated at ${new Date().toISOString()}`);
      execFile('osascript', ['-e', 'display notification "Collaboration.md has been updated!" with title "Collaboration Hub" sound name "Glass"']);
      process.exit(0);
    }
  } catch {
    // Ignore transient file lock / write errors
  }
}, 1000);
