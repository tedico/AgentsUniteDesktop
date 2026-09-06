import fs from 'node:fs';
import path from 'node:path';

export const UNITE_DIR = '.unite';
const CHAT_NAME_RE = /^[A-Za-z0-9._-]+$/;

function assertChatName(name) {
  if (name === '.' || name === '..' || !CHAT_NAME_RE.test(name)) {
    throw new Error(`invalid chat name "${name}"; must match ${CHAT_NAME_RE} and cannot be "." or ".."`);
  }
}

export function chatDir(root, name) {
  assertChatName(name);
  return path.join(root, UNITE_DIR, 'chats', name);
}

export function ensureChat(root, name) {
  assertChatName(name);
  const dir = chatDir(root, name);
  fs.mkdirSync(dir, { recursive: true });
  // F6: the spec promises .unite/ is gitignored in target projects, not just
  // this repo. Make it self-ignoring, idempotently, so a fresh target project
  // never gets .unite/ chat transcripts committed by accident.
  const giPath = path.join(root, UNITE_DIR, '.gitignore');
  if (!fs.existsSync(giPath)) fs.writeFileSync(giPath, '*\n');
  return dir;
}

function transcriptMtime(dir) {
  try { return fs.statSync(path.join(dir, 'transcript.jsonl')).mtimeMs; }
  catch { return 0; }
}

export function listChats(root) {
  const base = path.join(root, UNITE_DIR, 'chats');
  if (!fs.existsSync(base)) return [];
  return fs.readdirSync(base, { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => e.name)
    .sort((a, b) => transcriptMtime(chatDir(root, b)) - transcriptMtime(chatDir(root, a)));
}

export function latestChat(root) {
  return listChats(root)[0] ?? null;
}
