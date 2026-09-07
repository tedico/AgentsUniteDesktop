import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

const CHAT_NAME_RE = /^[A-Za-z0-9._-]+$/;

export function assertChatName(name) {
  if (!name || name === '.' || name === '..' || !CHAT_NAME_RE.test(name)) {
    throw new Error(`invalid chat name "${name}"; must match ${CHAT_NAME_RE} and cannot be "." or ".."`);
  }
}

export function getStorageRoot({ isGlobal = false, cwd = process.cwd(), home = os.homedir() } = {}) {
  if (isGlobal) {
    return path.join(home, 'Documents', 'AgentsUnite', 'global');
  }
  return path.join(cwd, '.unite', 'chats');
}

export function chatDir(storageRoot, chatName) {
  assertChatName(chatName);
  return path.join(storageRoot, chatName);
}

export function ensureChat(storageRoot, chatName, { isGlobal = false, cwd = process.cwd() } = {}) {
  assertChatName(chatName);
  const dir = chatDir(storageRoot, chatName);
  fs.mkdirSync(dir, { recursive: true });
  if (!isGlobal) {
    const gitignorePath = path.join(cwd, '.unite', '.gitignore');
    if (!fs.existsSync(gitignorePath)) {
      try {
        fs.mkdirSync(path.dirname(gitignorePath), { recursive: true });
        fs.writeFileSync(gitignorePath, '*\n');
      } catch { /* best effort */ }
    }
  }
  return dir;
}

function transcriptMtime(dir) {
  try {
    return fs.statSync(path.join(dir, 'transcript.jsonl')).mtimeMs;
  } catch {
    return 0;
  }
}

export function listChats(storageRoot) {
  if (!fs.existsSync(storageRoot)) return [];
  return fs.readdirSync(storageRoot, { withFileTypes: true })
    .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
    .map((e) => e.name)
    .sort((a, b) => transcriptMtime(chatDir(storageRoot, b)) - transcriptMtime(chatDir(storageRoot, a)));
}

export function latestChat(storageRoot) {
  return listChats(storageRoot)[0] ?? null;
}

export function syncTranscriptMarkdown(dir, chatName) {
  const jsonlPath = path.join(dir, 'transcript.jsonl');
  if (!fs.existsSync(jsonlPath)) return;
  const raw = fs.readFileSync(jsonlPath, 'utf8');
  const messages = raw
    .split('\n')
    .filter(Boolean)
    .map((line) => {
      try { return JSON.parse(line); } catch { return null; }
    })
    .filter(Boolean);

  const lines = [
    `# Chat: ${chatName}`,
    `*AgentsUnite Desktop Transcript — ${new Date().toLocaleString()}*`,
    '',
    '---',
    '',
  ];

  for (const m of messages) {
    const timeStr = m.ts ? new Date(m.ts).toLocaleTimeString() : '';
    const name = m.from === 'ted' ? 'Ted' : m.from === 'claude' ? 'Claude' : m.from === 'gemini' ? 'Gemini' : 'System';
    const header = m.from === 'system'
      ? `> **[System${timeStr ? ` · ${timeStr}` : ''}]**`
      : `### **${name}** ${timeStr ? `\`${timeStr}\`` : ''}`;

    lines.push(header);
    lines.push('');
    lines.push(m.text);
    lines.push('');
    lines.push('---');
    lines.push('');
  }

  const mdPath = path.join(dir, 'transcript.md');
  fs.writeFileSync(mdPath, lines.join('\n'), 'utf8');
}
