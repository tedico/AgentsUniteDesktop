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
  stopButton: { role: 'AXButton', helpIncludes: 'Stop' }, // not exposed in 2026-09-06 fixtures; live AX has no Stop string
  conversation: { role: 'AXWindow' },
  messageItem: { role: 'AXTextArea', descriptionIncludes: 'text entry area' },
};
