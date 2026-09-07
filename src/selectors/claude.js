// Accessibility roles and labels for the Claude desktop window (Electron).
// If Claude redesigns, this is the one file to fix; test/selectors.test.js
// checks every entry against the saved trees in test/fixtures/.
export default {
  seat: 'claude',
  appName: 'Claude',
  bundleId: 'com.anthropic.claudefordesktop',
  file: 'src/selectors/claude.js',
  manualAccessibility: true,   // Chromium hides its page until asked
  stripCitations: false,
  composer: { role: 'AXTextArea', descriptionIncludes: 'Write your prompt' },
  sendButton: { role: 'AXButton', descriptionIncludes: 'Send message' },
  stopButton: { role: 'AXButton', descriptionIncludes: 'Stop' },
  conversation: { role: 'AXGroup', descriptionIncludes: 'Primary pane' },
  messageItem: { role: 'AXGroup', descriptionIncludes: 'Message ' },
};
