// Every failure the window can show. Each message names the app and says what
// to do next; the adapters and preflight only ever pick from this catalog.
export const ERRORS = {
  appNotRunning: (app) => `${app} is not running. Open it, then send again.`,
  noChatOpen: (app) => `No chat is open in ${app} — its message box was not found. Open a chat in ${app}, then send again.`,
  accessibilityDenied: (app) =>
    `macOS denied accessibility access while reading ${app}. Open System Settings → Privacy & Security → Accessibility, turn on AgentsUnite Desktop, then relaunch it.`,
  automationDenied: (app) =>
    `macOS denied automation access while reading ${app}. Open System Settings → Privacy & Security → Automation, allow AgentsUnite Desktop to control System Events, then relaunch it.`,
  selectorsNotFound: (app, what, file) => `Could not find the ${what} in ${app}. The app's layout probably changed — update ${file}.`,
  replyTimedOut: (app, sec) => `${app} did not finish a reply within ${sec}s. Check the ${app} window, then send again.`,
  appBusy: (app) => `${app} was still generating when this turn started and did not finish in time. Wait for it to finish, then send again.`,
  noWindow: (app, observed = {}) => {
    const bits = [];
    if (observed.count != null) bits.push(`windows=${observed.count}`);
    if (observed.minimized != null) bits.push(`minimized=${observed.minimized}`);
    if (observed.frontmost != null) bits.push(`frontmost=${observed.frontmost}`);
    if (observed.activate) {
      const a = observed.activate;
      const state = !a.attempted ? 'not-attempted' : a.succeeded ? 'succeeded' : (a.error || 'failed');
      bits.push(`activate=${state}`);
    }
    const obs = bits.length ? ` Observed: ${bits.join(' ')}.` : '';
    return `${app} is running but macOS reports no readable window.${obs} Bring the ${app} window on screen, then send again.`;
  },
  minimized: (app) => `${app} is minimized to the Dock. Click it in the Dock to restore the window.`,
  emptyReply: (app, observed = {}) => {
    if ((observed.thinkingChars ?? 0) > 0) {
      return `${app} looks idle but thinking text is still on screen and no new chat message appeared. Observed: messages ${observed.messagesBefore ?? '?'}→${observed.messagesAfter ?? '?'}, thinkingChars=${observed.thinkingChars}. Wait for it to finish, then send again.`;
    }
    const obs = observed.messagesAfter != null ? ` Observed: messages ${observed.messagesBefore}→${observed.messagesAfter}.` : '';
    return `${app} finished but no new text appeared in the chat.${obs} Check the ${app} window, then send again.`;
  },
  conversationUnreadable: (app, file, observed = {}) => {
    const think = observed.thinkingChars != null ? ` (thinkingChars=${observed.thinkingChars})` : '';
    return `${app} is idle but none of its conversation text could be read${think}. Its message layout probably changed — update ${file}, or check the ${app} window.`;
  },
  axTooSlow: (app) => `Reading the ${app} window took too long. Bring the chat into view and try again.`,
  accessibilityPending: () =>
    `Waiting for Accessibility. Open System Settings → Privacy & Security → Accessibility, turn on AgentsUnite Desktop, then quit and reopen this app.`,
  claudeNotOnPath: () =>
    `claude is not on PATH. Install Claude Code and make sure \`claude\` is on your PATH, then run again.`,
  agyNotOnPath: () =>
    `agy is not on PATH. Install the Antigravity CLI and make sure \`agy\` is on your PATH, then run again.`,
  notebooklmNotOnPath: () =>
    `notebooklm is not on PATH. Install notebooklm-py and make sure \`notebooklm\` is on your PATH, then run again.`,
  notebooklmLogin: () =>
    `NotebookLM session expired. Run \`notebooklm login\` in a browser, then send again.`,
};

export function describeAxError({ code, error }, app) {
  switch (code) {
    case 'accessibility': return ERRORS.accessibilityDenied(app);
    case 'automation': return ERRORS.automationDenied(app);
    case 'noProcess': return ERRORS.appNotRunning(app);
    case 'noWindow': return ERRORS.noWindow(app, error);
    case 'timeout': return ERRORS.axTooSlow(app);
    default: return `${app}: accessibility call failed — ${error}`;
  }
}
