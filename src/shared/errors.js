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
  noWindow: (app) =>
    `${app} is running but macOS reports no readable window. If it is full-screen on another Space, exit full-screen (⌃⌘F); if it is hidden, show it (⌘Tab to it).`,
  minimized: (app) => `${app} is minimized to the Dock. Click it in the Dock to restore the window.`,
  emptyReply: (app) => `${app} finished but no new text appeared in the chat. Check the ${app} window, then send again.`,
  axTooSlow: (app) => `Reading the ${app} window took too long. Bring the chat into view and try again.`,
};

export function describeAxError({ code, error }, app) {
  switch (code) {
    case 'accessibility': return ERRORS.accessibilityDenied(app);
    case 'automation': return ERRORS.automationDenied(app);
    case 'noProcess': return ERRORS.appNotRunning(app);
    case 'noWindow': return ERRORS.noWindow(app);
    case 'timeout': return ERRORS.axTooSlow(app);
    default: return `${app}: accessibility call failed — ${error}`;
  }
}
