import fs from 'node:fs';
import path from 'node:path';
export { isNotebooklmAuthError } from '../shared/diagnostics.js';

const FILE = 'notebook.json';

export function loadNotebookSession(dir) {
  try { return JSON.parse(fs.readFileSync(path.join(dir, FILE), 'utf8')); }
  catch { return { sessionRef: null }; }
}

export function saveNotebookSession(dir, state) {
  fs.writeFileSync(path.join(dir, FILE), JSON.stringify(state, null, 2));
}

export async function groundRound({ question, dir, notebookId, ask }) {
  const prev = loadNotebookSession(dir);
  const res = await ask({ prompt: question, sessionRef: prev.sessionRef, notebookId });
  if (!res.ok) return res;
  saveNotebookSession(dir, { sessionRef: res.sessionRef ?? prev.sessionRef, notebookId });
  return { ok: true, text: res.replyText, sessionRef: res.sessionRef };
}
