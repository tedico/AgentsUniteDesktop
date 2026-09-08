import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { DEFAULTS, loadSettings, saveSettings, readRoomConfig, writeRoomConfig } from '../src/main/settings.js';

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'unite-settings-'));

test('loadSettings: defaults when nothing is saved or the file is broken', () => {
  const d = tmp();
  assert.deepEqual(loadSettings(d), { root: null, chat: 'main' });
  fs.writeFileSync(path.join(d, 'settings.json'), '{oops');
  assert.deepEqual(loadSettings(d), DEFAULTS);
});

test('saveSettings round-trips and normalizes', () => {
  const d = tmp();
  const saved = saveSettings(d, { root: '/tmp/proj', chat: 'design-room' });
  assert.deepEqual(saved, { root: '/tmp/proj', chat: 'design-room' });
  assert.deepEqual(loadSettings(d), saved);
  assert.deepEqual(saveSettings(d, { root: '', chat: '../evil' }), { root: null, chat: 'main' });
  assert.deepEqual(saveSettings(d, { root: '/x', chat: 42 }), { root: '/x', chat: 'main' });
});

test('readRoomConfig: CLI defaults when no config file; file values otherwise', () => {
  const root = tmp();
  assert.deepEqual(readRoomConfig(root), { turnCap: 8, timeoutMs: 300000, notebookId: null });
  fs.mkdirSync(path.join(root, '.unite'), { recursive: true });
  fs.writeFileSync(path.join(root, '.unite', 'config.json'), JSON.stringify({ turnCap: 3, timeoutMs: 60000, roster: ['claude'] }));
  assert.deepEqual(readRoomConfig(root), { turnCap: 3, timeoutMs: 60000, notebookId: null });
  assert.deepEqual(readRoomConfig(null), { turnCap: 8, timeoutMs: 300000, notebookId: null });
});

test('writeRoomConfig: merges only turnCap/timeoutMs, keeps other CLI keys, validates ranges', () => {
  const root = tmp();
  fs.mkdirSync(path.join(root, '.unite'), { recursive: true });
  fs.writeFileSync(path.join(root, '.unite', 'config.json'), JSON.stringify({ roster: ['claude', 'gemini', 'cursor'], mcp: true }));
  assert.deepEqual(writeRoomConfig(root, { turnCap: 4, timeoutMs: 120000 }), { turnCap: 4, timeoutMs: 120000, notebookId: null });
  const file = JSON.parse(fs.readFileSync(path.join(root, '.unite', 'config.json'), 'utf8'));
  assert.deepEqual(file, { roster: ['claude', 'gemini', 'cursor'], mcp: true, turnCap: 4, timeoutMs: 120000 });
  // out of range → unchanged
  assert.deepEqual(writeRoomConfig(root, { turnCap: 0, timeoutMs: 1 }), { turnCap: 4, timeoutMs: 120000, notebookId: null });
  assert.deepEqual(writeRoomConfig(root, { turnCap: 51, timeoutMs: 999999999 }), { turnCap: 4, timeoutMs: 120000, notebookId: null });
});

test('writeRoomConfig persists a chat-scoped notebookId', () => {
  const root = tmp();
  assert.deepEqual(writeRoomConfig(root, { turnCap: 8, timeoutMs: 300000, notebookId: 'nb-abc' }), {
    turnCap: 8, timeoutMs: 300000, notebookId: 'nb-abc',
  });
  assert.equal(readRoomConfig(root).notebookId, 'nb-abc');
});

test('writeRoomConfig creates .unite/config.json when absent', () => {
  const root = tmp();
  writeRoomConfig(root, { turnCap: 2, timeoutMs: 30000 });
  assert.deepEqual(readRoomConfig(root), { turnCap: 2, timeoutMs: 30000, notebookId: null });
});
