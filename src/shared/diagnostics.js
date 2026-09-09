// Diagnostic blocks for errors.log / traces.log. Trace rows carry full
// message item text (owner, 2026-09-08). Header fields stay machine state.

export function formatDiagnostic({ seat, code, elapsedMs, extra = {} }) {
  const lines = [`seat=${seat}`, `code=${code}`, `elapsedMs=${elapsedMs ?? 0}`];
  for (const [key, value] of Object.entries(extra)) {
    if (value == null) continue;
    lines.push(`${key}=${typeof value === 'object' ? JSON.stringify(value) : value}`);
  }
  return lines.join('\n');
}

export function formatDenials(seat, denials) {
  const lines = [`seat=${seat}`, `code=harnessDenied`, `denialCount=${denials.length}`];
  for (const d of denials) {
    const tool = d.tool ? ` tool=${d.tool}` : '';
    lines.push(`denial${tool} reason=${String(d.reason ?? '').slice(0, 400)}`);
  }
  return lines.join('\n');
}

export function harnessDenialLine(denials) {
  const bits = denials.map((d) => {
    const tool = d.tool ? `${d.tool}: ` : '';
    return `${tool}${String(d.reason ?? 'denied').slice(0, 200)}`;
  });
  return `Claude Code harness denied a tool (this is not a macOS Screen Recording or Accessibility failure): ${bits.join('; ')}`;
}

export function formatTraceRow(row) {
  const snap = row.snapMs != null ? ` snap=${row.snapMs}` : '';
  const trunc = row.truncated != null ? ` trunc=${row.truncated}` : '';
  const texts = Array.isArray(row.texts) ? ` texts=${JSON.stringify(row.texts)}` : '';
  return `t=${row.elapsedMs} busy=${row.busy} via=${row.via} items=${row.items} chars=${row.chars} think=${row.think} stable=${row.stable} phase=${row.phase}${snap}${trunc}${texts}`;
}

export function isNotebooklmAuthError(text) {
  return /not logged in|not authenticated|please run.*login|unauthoriz|storage_state|session.*expir|auth(?:entication)? (?:failed|required|expired)|notebooklm login/i.test(String(text ?? ''));
}

export function inferErrorCode(error) {
  const s = String(error ?? '');
  if (/thinking text is still on screen/i.test(s)) return 'stillGenerating';
  if (/no new text appeared/i.test(s)) return 'emptyReply';
  if (/no readable window/i.test(s)) return 'noWindow';
  if (/did not finish a reply/i.test(s)) return 'replyTimedOut';
  if (/still generating when this turn started/i.test(s)) return 'appBusy';
  if (/is not running/i.test(s)) return 'appNotRunning';
  if (/No chat is open/i.test(s)) return 'noChatOpen';
  if (/denied accessibility/i.test(s)) return 'accessibilityDenied';
  if (/denied automation/i.test(s)) return 'automationDenied';
  if (/Could not find/i.test(s)) return 'selectorsNotFound';
  if (/minimized to the Dock/i.test(s)) return 'minimized';
  if (/took too long/i.test(s)) return 'axTooSlow';
  if (/notebooklm login/i.test(s)) return 'notebooklmLogin';
  if (/notebooklm is not on PATH/i.test(s)) return 'notebooklmNotOnPath';
  if (/claude is not on PATH/i.test(s)) return 'claudeNotOnPath';
  return 'error';
}
