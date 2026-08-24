import { defineConfig } from "@playwright/test";

// SMOKE_BASE_URL controls what this hits:
//   - PR/CI runs point it at a locally built `vite preview` server (no live
//     traffic, no credentials needed) — see .github/workflows/ci.yml.
//   - The post-deploy workflow points it at the real production URL
//     (https://myinvestorcircle.com) AFTER GitHub Pages finishes deploying,
//     to catch anything a local build can't (base-path/CDN/DNS issues,
//     stale cache, an asset that 404s in production but not locally).
// Defaults to the local Vite preview port for `npm run smoke` run by hand.
const baseURL = process.env.SMOKE_BASE_URL || "http://localhost:4173";

export default defineConfig({
  testDir: "./tests/smoke",
  timeout: 30_000,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? "line" : "list",
  use: {
    baseURL,
    screenshot: "only-on-failure",
    // In sandboxed/dev environments a pre-installed Chromium is provided at
    // a fixed path rather than the version Playwright's own installer would
    // fetch. CI machines (GitHub Actions) run `playwright install
    // --with-deps chromium` instead and won't have this path, so this only
    // takes effect when it actually exists.
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_PATH
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH }
      : {},
  },
});
