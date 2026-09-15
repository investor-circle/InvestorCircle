import { test, expect } from "@playwright/test";

// Real-browser smoke coverage — the thing our unit/component tests can't
// give us: does the actual bundle load in a real browser with zero
// uncaught errors. This is deliberately scoped to what's testable WITHOUT
// live credentials (this app requires Firebase auth + a real Neon DB for
// anything past login, and CI has neither) — it catches bundle-level
// breakage (a bad import, a build/base-path misconfiguration, a
// module-load-time throw) rather than authenticated-flow logic bugs,
// which is what the vitest component tests are for instead.

// A flaky/blocked external resource (Google Fonts, a favicon) is not an
// app bug and shouldn't fail this suite — real uncaught exceptions in our
// own code (`pageerror`) always will, unconditionally.
const BENIGN_CONSOLE_ERROR = /Failed to load resource|fonts\.(gstatic|googleapis)\.com|favicon/i;

test.describe("app shell", () => {
  test("loads with no console or page errors", async ({ page }) => {
    const consoleErrors = [];
    const pageErrors = [];
    page.on("console", (msg) => {
      if (msg.type() === "error" && !BENIGN_CONSOLE_ERROR.test(msg.text())) consoleErrors.push(msg.text());
    });
    page.on("pageerror", (err) => pageErrors.push(err.message));

    const response = await page.goto("/");
    expect(response.ok()).toBeTruthy();

    // The login shell is the one screen guaranteed to render with zero
    // backend state — confirms the SPA actually mounted (not a blank
    // white screen), the same failure mode as the bug this suite guards
    // against.
    await expect(page.getByText("myInvestorCircle").first()).toBeVisible({ timeout: 10_000 });
    await expect(page.getByText(/sign in/i).first()).toBeVisible();

    expect(consoleErrors, `Console errors on load:\n${consoleErrors.join("\n")}`).toEqual([]);
    expect(pageErrors, `Uncaught page errors on load:\n${pageErrors.join("\n")}`).toEqual([]);
  });

  test("an unknown public profile route degrades to a not-found state, not a crash", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/investor/this-user-should-not-exist-smoke-test");

    // Give the standalone profile fetch a moment to resolve/fail and render.
    await page.waitForTimeout(3000);

    // Whatever it shows, the page must not be blank and must not have thrown.
    const bodyText = await page.locator("body").innerText();
    expect(bodyText.trim().length).toBeGreaterThan(0);
    expect(pageErrors, `Uncaught page errors:\n${pageErrors.join("\n")}`).toEqual([]);
  });

  test("a Stock Insights deep link renders for a signed-out visitor, not a crash", async ({ page }) => {
    // /security/:ticker is a real path, but which app actually renders it
    // for a signed-out visitor depends on SMOKE_BASE_URL: against a local
    // `vite preview` build (no vercel.json rewrites applied), this hits the
    // SPA's own SecurityIntelligencePage with no live backend, degrading to
    // an empty state; against real production, vercel.json proxies this
    // exact path to web-public, which renders a genuine, fully-populated
    // SSR page from the real database (see CLAUDE.md's "Public, crawlable
    // pages"). Those two pages don't share heading text (web-public's
    // eyebrow shows the stock's sector instead of "Stock Insights" once one
    // is set — see web-public/app/security/[symbol]/page.jsx), so the only
    // assertion that holds for both is the one this test actually cares
    // about: the page loads with real content and no thrown error, not a
    // specific app's copy.
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(err.message));

    await page.goto("/security/RELIANCE");
    await page.waitForTimeout(3000);

    await expect(page.getByText("RELIANCE").first()).toBeVisible();

    const bodyText = await page.locator("body").innerText();
    expect(bodyText.trim().length).toBeGreaterThan(0);
    expect(pageErrors, `Uncaught page errors:\n${pageErrors.join("\n")}`).toEqual([]);
  });
});
