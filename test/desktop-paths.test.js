import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  getStorageRoot,
  chatDir,
  ensureChat,
  listChats,
  latestChat,
  syncTranscriptMarkdown,
} from '../src/cli/desktop-paths.js';

test('getStorageRoot: global returns Documents/AgentsUnite/global; project returns .unite/chats', () => {
  const tmpHome = '/tmp/fakehome';
  const tmpCwd = '/tmp/fakecwd';
  assert.equal(
    getStorageRoot({ isGlobal: true, home: tmpHome }),
    path.join(tmpHome, 'Documents', 'AgentsUnite', 'global'),
  );
  assert.equal(
    getStorageRoot({ isGlobal: false, cwd: tmpCwd }),
    path.join(tmpCwd, '.unite', 'chats'),
  );
});

test('ensureChat & listChats & latestChat work with visible storage', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unite-test-'));
  const storageRoot = path.join(tmpDir, 'Documents', 'AgentsUnite', 'global');

  const c1 = ensureChat(storageRoot, 'chat-alpha', { isGlobal: true });
  assert.ok(fs.existsSync(c1));

  const c2 = ensureChat(storageRoot, 'chat-beta', { isGlobal: true });
  assert.ok(fs.existsSync(c2));

  // Add transcript.jsonl with simulated mtime
  fs.writeFileSync(path.join(c1, 'transcript.jsonl'), '{"from":"ted","text":"hi"}\n');
  fs.writeFileSync(path.join(c2, 'transcript.jsonl'), '{"from":"ted","text":"hello"}\n');

  // Adjust mtime so c2 is newer
  const tOld = new Date(Date.now() - 10000);
  const tNew = new Date();
  fs.utimesSync(path.join(c1, 'transcript.jsonl'), tOld, tOld);
  fs.utimesSync(path.join(c2, 'transcript.jsonl'), tNew, tNew);

  const list = listChats(storageRoot);
  assert.deepEqual(list, ['chat-beta', 'chat-alpha']);
  assert.equal(latestChat(storageRoot), 'chat-beta');

  fs.rmSync(tmpDir, { recursive: true, force: true });
});

test('syncTranscriptMarkdown generates clean markdown from transcript.jsonl', () => {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'unite-md-'));
  const chat = path.join(tmpDir, 'test-chat');
  fs.mkdirSync(chat, { recursive: true });

  const jsonl = [
    JSON.stringify({ from: 'ted', text: '@gemini tell me about Architecture', ts: '2026-09-07T11:00:00.000Z' }),
    JSON.stringify({ from: 'gemini', text: 'Architecture covers core system design.', ts: '2026-09-07T11:00:05.000Z' }),
    JSON.stringify({ from: 'system', text: '(planning mode enabled)', ts: '2026-09-07T11:00:10.000Z' }),
  ].join('\n');

  fs.writeFileSync(path.join(chat, 'transcript.jsonl'), jsonl + '\n');
  syncTranscriptMarkdown(chat, 'test-chat');

  const mdPath = path.join(chat, 'transcript.md');
  assert.ok(fs.existsSync(mdPath));
  const content = fs.readFileSync(mdPath, 'utf8');

  assert.match(content, /# Chat: test-chat/);
  assert.match(content, /### \*\*Ted\*\*/);
  assert.match(content, /@gemini tell me about Architecture/);
  assert.match(content, /### \*\*Gemini\*\*/);
  assert.match(content, /Architecture covers core system design\./);
  assert.match(content, /> \*\*\[System/);

  fs.rmSync(tmpDir, { recursive: true, force: true });
});
