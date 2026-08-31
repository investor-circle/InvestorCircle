// Test runner for the mobile app.
//
// jest-expo is the preset Expo maintains for this SDK: it wires up the
// babel transform, the React Native module mocks, and the transformIgnore
// patterns needed to load RN packages (which ship untranspiled). That is
// what makes it possible to actually RENDER components in a test, which a
// plain node-environment runner cannot do.
//
// This replaced a vitest config that was deliberately limited to pure logic.
// Everything runs here now, so there is one runner rather than one per kind
// of test.
module.exports = {
  preset: "jest-expo",
  testMatch: ["<rootDir>/src/**/*.test.js", "<rootDir>/app/**/*.test.js"],
  setupFilesAfterEnv: ["<rootDir>/jest.setup.js"],
  // The app screens pull in expo-router, Firebase and the API layer; those
  // are stubbed per-test rather than globally so each test states its own
  // assumptions.
  clearMocks: true,
};
