import { defineConfig } from "vitest/config";

// Scoped to mobile/ so the web app's own vitest config (root
// vitest.config.js, which only includes the web src/) is untouched.
// Deliberately limited to PURE logic — no React Native component rendering,
// which would need a native transform/preset this project doesn't have.
// These are the modules where a regression is silent and expensive: feed
// composition, notification wording, and the display/business formatters.
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.test.js"],
  },
});
