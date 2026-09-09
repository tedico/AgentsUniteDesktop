import { app, BrowserWindow, dialog, ipcMain, shell, systemPreferences } from 'electron';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import CH from '../shared/channels.cjs';
import { makeAxHelper } from '../ax/helper.js';
import { claudeDesktopAdapter } from '../adapters/claude-desktop.js';
import { geminiDesktopAdapter } from '../adapters/gemini-desktop.js';
import claudeSelectors from '../selectors/claude.js';
import geminiSelectors from '../selectors/gemini.js';
import { makeRelay } from './relay.js';
import { tickPreflight } from './preflight.js';
import { loadSettings, saveSettings, readRoomConfig, writeRoomConfig } from './settings.js';
import { groundRound } from './notebook.js';
import { notebooklmCliAdapter } from '../adapters/notebooklm-cli.js';
import { loadConfig } from '../../vendor/agentsunite/lib/config.js';
import { ensureChat } from '../../vendor/agentsunite/lib/paths.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SEATS = ['claude', 'gemini'];
const SELECTORS = { claude: claudeSelectors, gemini: geminiSelectors };
const PREFLIGHT_MS = 2000;

let win = null;
let relay = null;
let settings = null;
let preflightRunning = false;
const helper = makeAxHelper();

const emit = (evt) => { if (win && !win.isDestroyed()) win.webContents.send(CH.EVENT, evt); };

function createWindow() {
  win = new BrowserWindow({
    width: 960, height: 760, minWidth: 640, minHeight: 420, title: 'AgentsUnite Desktop',
    webPreferences: {
      preload: path.join(HERE, '..', 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false, // so the preload can require ../shared/channels.cjs
    },
  });
  win.loadFile(path.join(HERE, '..', 'renderer', 'index.html'));
  win.webContents.on('did-finish-load', () => { if (relay) announceRoom(); });
  win.on('closed', () => { win = null; });
}

async function chooseRoot() {
  const r = await dialog.showOpenDialog(win, {
    title: 'Choose the project folder that holds .unite',
    properties: ['openDirectory', 'createDirectory'],
  });
  return r.canceled ? null : r.filePaths[0];
}

// (Re)build the room from settings: chat dir, CLI config with the two
// desktop seats, adapters, relay. Called at start and after settings change.
function openRoom() {
  const dir = ensureChat(settings.root, settings.chat);
  const room = readRoomConfig(settings.root);
  const config = { ...loadConfig(settings.root), roster: SEATS, notebookId: room.notebookId };
  const adapters = {
    claude: claudeDesktopAdapter({ helper, timeoutMs: config.timeoutMs }),
    gemini: geminiDesktopAdapter({ helper, timeoutMs: config.timeoutMs }),
  };
  const groundNotebook = config.notebookId
    ? (opts) => groundRound({
      ...opts,
      ask: (args) => notebooklmCliAdapter({
        notebookId: config.notebookId,
        allowNew: config.notebookNew === true,
        timeoutMs: 120000,
      }).invoke(args),
    })
    : undefined;
  relay = makeRelay({ dir, adapters, config, emit, groundNotebook });
  announceRoom();
}

function announceRoom() {
  emit({ type: 'settings', ...settings, ...readRoomConfig(settings.root) });
  relay.loadHistory();
}

async function preflightTick() {
  if (!win || preflightRunning || relay?.busy) return;
  preflightRunning = true;
  try {
    const trusted = systemPreferences.isTrustedAccessibilityClient(false);
    emit({ type: 'preflight', ...(await tickPreflight({ trusted, helper, selectorList: SEATS.map((s) => SELECTORS[s]) })) });
  } finally { preflightRunning = false; }
}

app.whenReady().then(async () => {
  settings = loadSettings(app.getPath('userData'));
  createWindow();
  // Shows the macOS Accessibility prompt on first launch; silent afterwards.
  systemPreferences.isTrustedAccessibilityClient(true);
  if (!settings.root) {
    const root = await chooseRoot();
    if (!root) { app.quit(); return; }
    settings = saveSettings(app.getPath('userData'), { ...settings, root });
  }
  openRoom();
  setInterval(preflightTick, PREFLIGHT_MS);
  preflightTick();
});

ipcMain.on(CH.SUBMIT, (_e, text) => relay?.submit(text));
ipcMain.on(CH.SKIP, (_e, seat) => relay?.skip(seat));
ipcMain.on(CH.OPEN_APP, (_e, seat) => {
  const sel = SELECTORS[seat];
  if (sel) shell.openPath(`/Applications/${sel.appName}.app`);
});
ipcMain.handle(CH.GET_SETTINGS, () => ({ ...settings, ...readRoomConfig(settings.root) }));
ipcMain.handle(CH.PICK_ROOT, () => chooseRoot());
ipcMain.handle(CH.SET_SETTINGS, (_e, next = {}) => {
  if (relay?.busy) return { ...settings, ...readRoomConfig(settings.root), error: 'A turn is running — change settings after it finishes.' };
  settings = saveSettings(app.getPath('userData'), { ...settings, ...pick(next, ['root', 'chat']) });
  writeRoomConfig(settings.root, pick(next, ['turnCap', 'timeoutMs', 'notebookId']));
  openRoom();
  return { ...settings, ...readRoomConfig(settings.root) };
});

function pick(obj, keys) {
  return Object.fromEntries(keys.filter((k) => obj[k] !== undefined).map((k) => [k, obj[k]]));
}

app.on('window-all-closed', () => app.quit());
