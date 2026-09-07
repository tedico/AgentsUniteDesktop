// Accessibility roles and labels for the Gemini desktop window.
// If Gemini redesigns, this is the one file to fix; test/selectors.test.js
// checks every entry against the saved trees in test/fixtures/.
export default {
  seat: 'gemini',
  appName: 'Gemini',
  bundleId: 'com.google.GeminiMacOS',
  file: 'src/selectors/gemini.js',
  manualAccessibility: false,
  stripCitations: true,        // [span_N](start_span) … (end_span) markers
  composer: { role: 'AXTextArea', descriptionIncludes: 'Ask Gemini' },
  sendButton: { role: 'AXButton', helpIncludes: 'Send' },
  stopButton: { role: 'AXButton', helpIncludes: 'Stop' }, // not exposed; live AX has no Stop string
  // Idle empty composer shows a mic, not Send. Generating replaces both
  // with an unlabeled button (help null). See busyWhenSendAbsent.
  idleButton: { role: 'AXButton', helpIncludes: 'microphone' },
  busyWhenSendAbsent: true,
  conversation: { role: 'AXWindow' },
  // Answers are AXStaticText description "text". Thinking panels are
  // AXTextArea "text entry area" plus a "Show thinking" label.
  messageItem: { role: 'AXStaticText', descriptionEquals: 'text', nameExcludes: 'Show thinking' },
};
