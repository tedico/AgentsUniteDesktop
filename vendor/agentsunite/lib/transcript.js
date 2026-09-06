import fs from 'node:fs';
import path from 'node:path';

export function appendMessage(dir, msg) {
  fs.appendFileSync(path.join(dir, 'transcript.jsonl'), JSON.stringify(msg) + '\n');
}

export function readTranscript(dir) {
  const p = path.join(dir, 'transcript.jsonl');
  if (!fs.existsSync(p)) return [];
  return fs.readFileSync(p, 'utf8').split('\n').filter(Boolean).map((l) => JSON.parse(l));
}

export function loadState(dir, roster) {
  let state = { agents: {} };
  try { state = JSON.parse(fs.readFileSync(path.join(dir, 'state.json'), 'utf8')); }
  catch { /* fresh chat */ }
  state.agents ??= {};
  for (const seat of roster) state.agents[seat] ??= { sessionRef: null, cursor: 0 };
  state.policyVersion ??= 1; // chats from before the tool-policy change
  state.planner ??= null;    // seat driving /plan mode, or null
  return state;
}

export function saveState(dir, state) {
  fs.writeFileSync(path.join(dir, 'state.json'), JSON.stringify(state, null, 2));
}

export function appendErrorLog(dir, seat, text) {
  fs.appendFileSync(path.join(dir, 'errors.log'),
    `--- ${new Date().toISOString()} ${seat}\n${text}\n`);
}

export function lastError(dir) {
  const p = path.join(dir, 'errors.log');
  if (!fs.existsSync(p)) return null;
  const blocks = fs.readFileSync(p, 'utf8').split(/^--- /m).filter(Boolean);
  return blocks.at(-1) ?? null;
}

export function appendRoundError(dir, err) {
  appendErrorLog(dir, 'round', err?.stack ?? String(err));
}
