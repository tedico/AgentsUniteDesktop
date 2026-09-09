#!/usr/bin/env node
import readline from 'node:readline';
import process from 'node:process';
import { parseArgv, parsePlanCommand, PLAN_USAGE } from '../vendor/agentsunite/lib/cli.js';
import { desktopConfig } from '../src/cli/desktop-config.js';
import { getStorageRoot, ensureChat, listChats, latestChat, syncTranscriptMarkdown } from '../src/cli/desktop-paths.js';
import { runRound, RoundControl, endPlanning } from '../vendor/agentsunite/lib/engine.js';
import { makeUi } from '../src/cli/ui.js';
import { readTranscript, lastError, appendRoundError, loadState, saveState } from '../vendor/agentsunite/lib/transcript.js';
import { claudeCliAdapter } from '../src/adapters/claude-cli.js';
import { geminiDesktopAdapter } from '../src/adapters/gemini-desktop.js';
import { makeAxHelper } from '../src/ax/helper.js';
import geminiSelectors from '../src/selectors/gemini.js';
import { buildHybridPrompt } from '../src/main/preamble.js';
import { checkHybrid } from '../src/main/preflight.js';
import { withErrorLogs } from '../src/main/log-adapter.js';
import { groundRound } from '../src/main/notebook.js';
import { notebooklmCliAdapter } from '../src/adapters/notebooklm-cli.js';

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

const rawArgs = process.argv.slice(2);
const isGlobal = rawArgs.includes('--global') || rawArgs.includes('-g');
const argv = rawArgs.filter((a) => a !== '--global' && a !== '-g');

const storageRoot = getStorageRoot({ isGlobal });
if (isGlobal) {
  if (!fs.existsSync(storageRoot)) fs.mkdirSync(storageRoot, { recursive: true });
  process.chdir(storageRoot);
}

const root = process.cwd();
const config = desktopConfig(root);
const ui = makeUi();
const helper = makeAxHelper();
const adapters = {
  claude: claudeCliAdapter({
    binary: config.binaries?.claude ?? 'claude',
    model: config.models?.claude,
    timeoutMs: config.timeoutMs,
    mcp: config.mcp,
    permissionMode: 'acceptEdits',
  }),
  gemini: geminiDesktopAdapter({ helper, timeoutMs: config.timeoutMs }),
};

const { cmd, name } = parseArgv(argv);
if (cmd === 'ls') {
  for (const c of listChats(storageRoot)) console.log(c);
  process.exit(0);
}

const STARTUP_MESSAGES = [
  '☕ Brewing digital coffee for @claude & poking Gemini.app...',
  '⚡ Summoning the council (herding @claude & waking up Gemini.app)...',
  '🧙‍♂️ Casting macOS accessibility spells on Gemini.app & @claude...',
  '🤝 Negotiating peace between Claude CLI and Gemini Desktop...',
  '📡 Aligning satellite dishes between terminal and Gemini.app...',
  '🦾 Assembling the hybrid alliance (untangling cables)...',
];

const intro = STARTUP_MESSAGES[Math.floor(Math.random() * STARTUP_MESSAGES.length)];
let loaderTimer = null;
const frames = ['⠋', '⠙', '⠹', '⠸', '⠼', '⠴', '⠦', '⠧', '⠇', '⠏'];
let frameIndex = 0;
if (process.stdout.isTTY) {
  process.stdout.write(`\n${frames[0]} ${intro}`);
  loaderTimer = setInterval(() => {
    frameIndex = (frameIndex + 1) % frames.length;
    process.stdout.write(`\r${frames[frameIndex]} ${intro}`);
  }, 80);
  loaderTimer.unref();
} else {
  console.log(`\n${intro}`);
}

let pre;
try {
  pre = await checkHybrid({
    helper,
    geminiSelectors,
    binary: config.binaries?.claude ?? 'claude',
    notebookId: config.notebookId ?? null,
  });
} finally {
  if (loaderTimer) clearInterval(loaderTimer);
  if (process.stdout.isTTY) process.stdout.write(`\r\x1b[2K✨ ${intro}\n\n`);
}
for (const s of pre.seats) console.log(`${s.ready ? 'ok' : '!!'}  ${s.message}`);
if (!pre.seats.find((s) => s.seat === 'claude')?.ready) process.exit(1);

const rl = readline.createInterface({ input: process.stdin, output: process.stdout, prompt: ui.prompt() });
const question = (q) => new Promise((res) => rl.question(q, res));

let activeControl = null;
let sigints = 0;
let pickerActive = false;

rl.on('SIGINT', () => {
  if (pickerActive) {
    console.log();
    process.exit(0);
  } else if (activeControl) {
    sigints++;
    if (sigints === 1) { ui.printSystem('(skipping current turn — ^C again to drain the queue)'); activeControl.skipTurn(); }
    else activeControl.drain();
  } else {
    ui.printSystem('(/quit to exit)');
    rl.prompt();
  }
});

let chatName;
if (cmd === 'new') {
  chatName = name;
} else if (cmd === 'resume') {
  const chats = listChats(storageRoot);
  if (chats.length === 0) { console.error('no chats yet — run: AgentsUniteD new <name>'); process.exit(1); }
  chats.forEach((c, i) => console.log(`  ${i + 1}. ${c}`));
  pickerActive = true;
  const answer = await question('chat number [1]: ');
  pickerActive = false;
  chatName = chats[(parseInt(answer, 10) || 1) - 1] ?? chats[0];
} else {
  chatName = latestChat(storageRoot) ?? 'main';
}
const dir = ensureChat(storageRoot, chatName, { isGlobal, cwd: root });
syncTranscriptMarkdown(dir, chatName);
const loggedAdapters = withErrorLogs(adapters, dir);

const bannerPrefix = isGlobal ? 'unite-desktop [GLOBAL] — ' : 'unite-desktop — ';
const chatLocation = isGlobal ? ' (~/Documents/AgentsUnite/global)' : '';
console.log(`${bannerPrefix}chat "${chatName}"${chatLocation} — @claude (CLI, tools on) · @gemini (Desktop)`);
console.log('mention someone to get a reply; /plan [@seat] <text> · /plan off · /who /last /last-error /quit\n');
{
  const planner = loadState(dir, config.roster).planner;
  if (planner) ui.printSystem(`(planning mode is on — @${planner} drives; plain text goes to @${planner}; /plan off to end)`);
}

async function startRound(extra) {
  activeControl = new RoundControl();
  sigints = 0;
  try {
    let notebookContext = null;
    if (config.notebookId) {
      const g = await groundRound({
        question: extra.humanText,
        dir,
        notebookId: config.notebookId,
        ask: (args) => notebooklmCliAdapter({
          notebookId: config.notebookId,
          allowNew: config.notebookNew === true,
          timeoutMs: 120000,
        }).invoke(args),
      });
      if (!g.ok) ui.printSystem(g.error);
      else notebookContext = g.text;
    }
    await runRound({
      dir, adapters: loggedAdapters, config, ui, control: activeControl,
      buildPrompt: (args) => buildHybridPrompt({ ...args, notebookContext }),
      ...extra,
    });
  } catch (err) {
    ui.printSystem(`(round failed: ${err?.message ?? err})`);
    appendRoundError(dir, err);
  } finally {
    syncTranscriptMarkdown(dir, chatName);
    activeControl = null;
    rl.prompt();
  }
}

async function handleInput(line) {
  if (activeControl) { ui.printSystem('(agents are thinking — ^C skips the turn)'); return; }
  const text = line.trim();
  if (!text) { rl.prompt(); return; }
  if (text === '/quit') { rl.close(); return; }
  if (text === '/who') {
    ui.printSystem('@claude → claude (acceptEdits)');
    ui.printSystem('@gemini → Gemini.app');
    rl.prompt(); return;
  }
  if (text === '/last') {
    const last = readTranscript(dir).filter((m) => m.from !== 'ted').at(-1);
    if (last) ui.printReply(last.from, last.text); else ui.printSystem('(no replies yet)');
    rl.prompt(); return;
  }
  if (text === '/last-error') {
    ui.printSystem(lastError(dir) ?? '(no errors logged)');
    rl.prompt(); return;
  }
  const normalizedText = text.replace(/^\/plans\b/, '/plan');
  const planBareMatch = normalizedText.match(/^\/plan(?:\s+@(\w+))?$/);
  if (planBareMatch) {
    const specified = planBareMatch[1]?.toLowerCase();
    if (specified && !config.roster.includes(specified)) {
      ui.printSystem(`unknown seat "@${specified}" — roster: ${config.roster.map((s) => '@' + s).join(' ')}`);
      rl.prompt(); return;
    }
    const state = loadState(dir, config.roster);
    if (!specified && state.planner) {
      const was = endPlanning(dir, config.roster);
      ui.printSystem(`(planning mode ended — @${was} no longer receives un-mentioned messages)`);
    } else {
      const planner = specified ?? config.planner ?? 'claude';
      state.planner = planner;
      saveState(dir, state);
      ui.printSystem(`(planning mode: @${planner} drives; plain text goes to @${planner}; @mentions still work; /plan to end)`);
    }
    rl.prompt();
    return;
  }
  const plan = parsePlanCommand(normalizedText, config.roster);
  if (plan) {
    if (plan.kind === 'usage') { ui.printSystem(PLAN_USAGE); rl.prompt(); return; }
    if (plan.kind === 'bad-seat') {
      ui.printSystem(`unknown seat "@${plan.seat}" — roster: ${config.roster.map((s) => '@' + s).join(' ')}`);
      rl.prompt(); return;
    }
    if (plan.kind === 'off') {
      const was = endPlanning(dir, config.roster);
      ui.printSystem(was ? `(planning mode ended — @${was} no longer receives un-mentioned messages)` : '(planning mode was not on)');
      rl.prompt(); return;
    }
    const planner = plan.planner ?? config.planner;
    if (!config.roster.includes(planner)) {
      ui.printSystem(`planner "@${planner}" is not in the roster`);
      rl.prompt(); return;
    }
    ui.printSystem(`(planning mode: @${planner} drives; plain text goes to @${planner}; @mentions still work; /plan to end)`);
    await startRound({ humanText: plan.text, planStart: true, planner });
    return;
  }
  await startRound({ humanText: text });
}

rl.on('line', handleInput);
rl.on('close', () => { console.log(); process.exit(0); });
rl.prompt();
