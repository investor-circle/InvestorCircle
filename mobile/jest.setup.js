// Global test setup.
//
// Kept deliberately small: only things that are true for EVERY test belong
// here. Per-feature stubs (API calls, auth state) live in the test that
// needs them, so a test reads as a statement of its own assumptions rather
// than depending on invisible global state.

// The app installs a console-patching logger at startup (src/utils/logger).
// Tests import modules that call addLog(); silence its output so a failing
// assertion isn't buried in app breadcrumbs.
jest.mock("./src/utils/logger", () => ({
  addLog: jest.fn(),
  debugLog: jest.fn(),
  installLogger: jest.fn(),
  loadPersistedLogs: jest.fn(async () => []),
  getLogs: jest.fn(() => []),
  clearLogs: jest.fn(),
  formatLogs: jest.fn(() => ""),
}));

// expo-font tries to load real font files through the native module.
jest.mock("expo-font", () => ({
  useFonts: () => [true, null],
  loadAsync: jest.fn(async () => {}),
  isLoaded: () => true,
}));
