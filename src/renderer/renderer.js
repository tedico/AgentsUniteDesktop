import { splitFences } from './fences.js';

const $ = (sel) => document.querySelector(sel);
const el = {
  room: $('#room'), turns: $('#turns'), status: $('#status'), transcript: $('#transcript'),
  composer: $('#composer'), send: $('#send'),
  settings: $('#settings'), toggle: $('#settings-toggle'),
  setRoot: $('#set-root'), setPick: $('#set-pick'), setChat: $('#set-chat'), setCap: $('#set-cap'), setTimeout: $('#set-timeout'), setSave: $('#set-save'), setMsg: $('#set-msg'),
};
const SEATS = ['claude', 'gemini'];
const NAME = { ted: 'Ted', claude: 'Claude', gemini: 'Gemini', system: 'System' };
const state = { ready: false, busy: false, turnCap: 8, seats: {} };

// --- transcript ------------------------------------------------------------
// Message text comes from other apps: only ever textContent, never innerHTML.
function addMessage({ from, text, ts }) {
  const art = document.createElement('article');
  art.className = `msg msg--${from}`;
  const head = document.createElement('header');
  const when = ts ? new Date(ts).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '';
  head.textContent = `${NAME[from] ?? from}${when ? ' · ' + when : ''}`;
  const body = document.createElement('div');
  body.className = 'body';
  for (const part of splitFences(String(text ?? ''))) {
    if (part.type === 'code') {
      const pre = document.createElement('pre');
      const code = document.createElement('code');
      if (part.lang) code.dataset.lang = part.lang;
      code.textContent = part.text;
      pre.append(code);
      body.append(pre);
    } else {
      const p = document.createElement('p');
      p.textContent = part.text;
      body.append(p);
    }
  }
  art.append(head, body);
  el.transcript.append(art);
  el.transcript.scrollTop = el.transcript.scrollHeight;
}

// --- status strip ----------------------------------------------------------
function renderStatus() {
  el.status.replaceChildren();
  for (const seat of SEATS) {
    const s = state.seats[seat] ?? { ready: false, message: 'checking…' };
    const row = document.createElement('div');
    row.className = `seat ${s.turn ? 'seat--busy' : s.ready ? 'seat--ready' : 'seat--blocked'}`;
    const label = document.createElement('span');
    if (s.turn) {
      const secs = Math.round((Date.now() - s.turn.startedAt) / 1000);
      const chars = s.turn.chars ? ` · ${s.turn.chars} chars` : '';
      label.textContent = `${NAME[seat]} — ${s.turn.phase}${chars} · ${secs}s`;
    } else {
      label.textContent = `${NAME[seat]} — ${s.message}`;
    }
    row.append(label);
    if (s.turn) {
      const skip = document.createElement('button');
      skip.textContent = 'Skip';
      skip.addEventListener('click', () => window.unite.skip(seat));
      row.append(skip);
    } else if (s.canOpen) {
      const open = document.createElement('button');
      open.textContent = `Open ${NAME[seat]}`;
      open.addEventListener('click', () => window.unite.openApp(seat));
      row.append(open);
    }
    el.status.append(row);
  }
  const canSend = state.ready && !state.busy;
  el.composer.disabled = !canSend;
  el.send.disabled = !canSend;
}
setInterval(() => { if (state.busy) renderStatus(); }, 1000); // elapsed time ticks between progress events

// --- events from main ------------------------------------------------------
window.unite.onEvent((evt) => {
  switch (evt.type) {
    case 'transcript:load': el.transcript.replaceChildren(); evt.messages.forEach(addMessage); break;
    case 'message': addMessage(evt); break;
    case 'preflight':
      for (const s of evt.seats) state.seats[s.seat] = { ...state.seats[s.seat], ...s };
      state.ready = evt.ready;
      break;
    case 'round:start': state.busy = true; break;
    case 'round:end':
      state.busy = false;
      for (const s of Object.values(state.seats)) s.turn = null;
      el.turns.textContent = '';
      break;
    case 'turn:start':
      state.seats[evt.seat] = { ...state.seats[evt.seat], turn: { phase: 'starting', chars: 0, startedAt: Date.now() } };
      el.turns.textContent = `turn ${evt.pos} of ${evt.total} · cap ${state.turnCap}`;
      break;
    case 'turn:progress':
      if (state.seats[evt.seat]?.turn) Object.assign(state.seats[evt.seat].turn, { phase: evt.phase, chars: evt.chars });
      break;
    case 'turn:end': if (state.seats[evt.seat]) state.seats[evt.seat].turn = null; break;
    case 'settings':
      state.turnCap = evt.turnCap;
      el.room.textContent = `${evt.root} · ${evt.chat}`;
      fillSettings(evt);
      break;
  }
  renderStatus();
});

// --- composer --------------------------------------------------------------
function submit() {
  const text = el.composer.value.trim();
  if (!text || el.composer.disabled) return;
  el.composer.value = '';
  window.unite.submit(text);
}
el.composer.addEventListener('keydown', (e) => {
  if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
});
el.send.addEventListener('click', submit);

// --- settings panel --------------------------------------------------------
function fillSettings(s) {
  el.setRoot.value = s.root ?? '';
  el.setChat.value = s.chat ?? 'main';
  el.setCap.value = s.turnCap;
  el.setTimeout.value = Math.round(s.timeoutMs / 1000);
}
el.toggle.addEventListener('click', async () => {
  el.settings.hidden = !el.settings.hidden;
  if (!el.settings.hidden) fillSettings(await window.unite.getSettings());
});
el.setPick.addEventListener('click', async () => {
  const root = await window.unite.pickRoot();
  if (root) el.setRoot.value = root;
});
el.setSave.addEventListener('click', async () => {
  const r = await window.unite.setSettings({
    root: el.setRoot.value || undefined,
    chat: el.setChat.value.trim() || 'main',
    turnCap: Number(el.setCap.value),
    timeoutMs: Number(el.setTimeout.value) * 1000,
  });
  el.setMsg.textContent = r.error ?? 'Saved.';
  if (!r.error) { fillSettings(r); state.turnCap = r.turnCap; }
});
