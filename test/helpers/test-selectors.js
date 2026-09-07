export const TEST_SELECTORS = {
  seat: 'test',
  appName: 'TestApp',
  bundleId: 'com.example.test',
  file: 'test/helpers/test-selectors.js',
  manualAccessibility: false,
  stripCitations: false,
  composer: { role: 'AXTextArea' },
  sendButton: { role: 'AXButton', nameIncludes: 'Send' },
  stopButton: { role: 'AXButton', nameIncludes: 'Stop' },
  conversation: { role: 'AXGroup', descriptionIncludes: 'conversation' },
  messageItem: { role: 'AXGroup', descriptionIncludes: 'message' },
};
