import { describe, it, expect, vi, afterEach } from "vitest";
import React from "react";
import { render, waitFor, act } from "@testing-library/react";

const setPersistence = vi.fn(() => Promise.resolve());
const signInWithEmailAndPassword = vi.fn(() => Promise.resolve({ user: { uid: "u1" } }));
let onAuthStateChangedCallback = null;
const onAuthStateChanged = vi.fn((_auth, cb) => { onAuthStateChangedCallback = cb; return () => {}; });
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: (...args) => onAuthStateChanged(...args),
  signInWithEmailAndPassword: (...args) => signInWithEmailAndPassword(...args),
  signInWithPopup: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  signOut: vi.fn(),
  setPersistence: (...args) => setPersistence(...args),
  browserLocalPersistence: "LOCAL",
  browserSessionPersistence: "SESSION",
}));
vi.mock("./firebase", () => ({ auth: "fake-auth" }));

import { mintRoutingCookie, clearRoutingCookie, login, AuthProvider } from "./AuthContext";

// The routing-token cookie (see api/_lib/handlers/session.js, middleware.js)
// only works if the request that mints/clears it is genuinely same-origin —
// a cookie set by a cross-origin response is scoped to THAT origin, never
// the page the visitor is actually on. This shipped once with the mint/clear
// calls built on API_ORIGIN (src/db.js), which on the real production
// domain resolves to a DIFFERENT origin (a holdover from the GitHub-Pages-
// hosted-frontend era) — so the cookie silently never landed on
// myinvestorcircle.com for anyone, in any browser, ever. These tests pin
// the fetch URL as a bare same-origin-relative path so that regression
// can't come back quietly.
describe("routing cookie mint/clear — same-origin only", () => {
  const originalFetch = global.fetch;
  afterEach(() => { global.fetch = originalFetch; });

  it("mints via a same-origin relative URL, never an absolute/cross-origin one", () => {
    global.fetch = vi.fn(() => Promise.resolve());
    mintRoutingCookie("fake-id-token");

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/data?resource=session&action=mint");
    expect(url).not.toMatch(/^https?:\/\//);
    expect(opts).toMatchObject({ method: "POST", credentials: "same-origin", keepalive: true });
    expect(opts.headers.Authorization).toBe("Bearer fake-id-token");
  });

  it("does nothing without an idToken", () => {
    global.fetch = vi.fn();
    mintRoutingCookie(null);
    expect(global.fetch).not.toHaveBeenCalled();
  });

  it("clears via the same same-origin relative URL", () => {
    global.fetch = vi.fn(() => Promise.resolve());
    clearRoutingCookie();

    expect(global.fetch).toHaveBeenCalledTimes(1);
    const [url, opts] = global.fetch.mock.calls[0];
    expect(url).toBe("/api/data?resource=session&action=clear");
    expect(url).not.toMatch(/^https?:\/\//);
    expect(opts).toMatchObject({ method: "POST", credentials: "same-origin", keepalive: true });
  });
});

// "Remember me" controls session lifetime via Firebase Auth's own
// persistence modes, never a homegrown credential store — no password is
// saved either way. Defaulting rememberMe to true matters: without it, a
// caller that forgets the third argument (or an older build of LoginPage.jsx
// mid-rollout) would silently downgrade everyone to a session that vanishes
// on browser close, which is a real behavior change nobody asked for.
describe("login — persistence follows rememberMe", () => {
  afterEach(() => { setPersistence.mockClear(); signInWithEmailAndPassword.mockClear(); });

  it("uses LOCAL persistence (survives closing the browser) by default", async () => {
    await login("a@b.com", "pw");
    expect(setPersistence).toHaveBeenCalledWith("fake-auth", "LOCAL");
  });

  it("uses LOCAL persistence when rememberMe is explicitly true", async () => {
    await login("a@b.com", "pw", true);
    expect(setPersistence).toHaveBeenCalledWith("fake-auth", "LOCAL");
  });

  it("uses SESSION persistence (clears on browser close) when rememberMe is false", async () => {
    await login("a@b.com", "pw", false);
    expect(setPersistence).toHaveBeenCalledWith("fake-auth", "SESSION");
  });

  it("sets persistence before actually signing in", async () => {
    const order = [];
    setPersistence.mockImplementationOnce(() => { order.push("persistence"); return Promise.resolve(); });
    signInWithEmailAndPassword.mockImplementationOnce(() => { order.push("signIn"); return Promise.resolve(); });
    await login("a@b.com", "pw");
    expect(order).toEqual(["persistence", "signIn"]);
  });
});

// Stage 3 / freshness work: the routing cookie's TTL moved from 15 minutes
// to 7 days (see api/_lib/handlers/session.js), so it now needs to stay
// fresh across gaps far longer than a single continuously-open tab —
// covered by refreshing whenever the user meaningfully returns to the tab
// (visibilitychange -> visible, pageshow for bfcache restores), not just a
// background interval. These tests render the real AuthProvider and drive
// Firebase's onAuthStateChanged callback directly (captured via the
// firebase/auth mock above), since the behavior under test lives in an
// effect that only runs while a signed-in `user` is set.
function setFetchMock() {
  const mintCalls = [];
  global.fetch = vi.fn((url) => {
    if (String(url).includes("action=mint")) { mintCalls.push(url); return Promise.resolve({ ok: true, json: async () => ({}) }); }
    // Blacklist/profile-me/profile-sync calls: respond not-ok so
    // AuthProvider falls through to its local fallback profile shape —
    // irrelevant to what these tests assert on.
    return Promise.resolve({ ok: false, json: async () => ({}) });
  });
  return mintCalls;
}

const fakeUser = {
  uid: "uid-fresh-test",
  email: "fresh@example.com",
  displayName: "Fresh Test",
  photoURL: null,
  getIdToken: vi.fn(async () => "fake-id-token"),
};

async function signIn() {
  await act(async () => { await onAuthStateChangedCallback(fakeUser); });
}

describe("routing-cookie refresh triggers — visibilitychange, pageshow, throttle", () => {
  const originalFetch = global.fetch;
  const originalVisibilityState = Object.getOwnPropertyDescriptor(Document.prototype, "visibilityState");

  afterEach(() => {
    global.fetch = originalFetch;
    onAuthStateChangedCallback = null;
    if (originalVisibilityState) Object.defineProperty(document, "visibilityState", originalVisibilityState);
    vi.useRealTimers();
  });

  function setVisibility(state) {
    Object.defineProperty(document, "visibilityState", { configurable: true, get: () => state });
  }

  it("mints once on sign-in (session establishment), via the existing onAuthStateChanged path", async () => {
    const mintCalls = setFetchMock();
    render(<AuthProvider><div/></AuthProvider>);
    await signIn();
    await waitFor(() => expect(mintCalls.length).toBeGreaterThanOrEqual(1));
  });

  // Regression coverage for a slow/stuck sign-in spinner in production: `me`
  // and `blacklist-check` used to be two standalone Vercel functions
  // (api/profile/me.js, api/profile/blacklist-check.js), each independently
  // paying its own cold-start Firebase Admin/Neon init on every single app
  // load. They're now folded into the already-warm api/data.js dispatcher
  // (api/_lib/handlers/profile.js) — this pins the URLs so that consolidation
  // can't quietly regress back to the standalone functions.
  it("fetches the profile/blacklist-check on the consolidated api/data.js dispatcher, not the old standalone functions", async () => {
    const calls = [];
    global.fetch = vi.fn((url) => { calls.push(String(url)); return Promise.resolve({ ok: false, json: async () => ({}) }); });
    render(<AuthProvider><div/></AuthProvider>);
    await signIn();
    await waitFor(() => expect(calls.some(u => u.includes("resource=profile&action=me"))).toBe(true));
    expect(calls.some(u => u.includes("resource=profile&action=blacklist-check"))).toBe(true);
    expect(calls.some(u => u.includes("/api/profile/me"))).toBe(false);
    expect(calls.some(u => u.includes("/api/profile/blacklist-check"))).toBe(false);
  });

  it("refreshes when the tab becomes visible again", async () => {
    const mintCalls = setFetchMock();
    setVisibility("hidden");
    render(<AuthProvider><div/></AuthProvider>);
    await signIn();
    const countAfterSignIn = mintCalls.length;

    setVisibility("visible");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    await waitFor(() => expect(mintCalls.length).toBeGreaterThan(countAfterSignIn));
  });

  it("does not refresh on visibilitychange when the tab is becoming hidden, only when becoming visible", async () => {
    const mintCalls = setFetchMock();
    render(<AuthProvider><div/></AuthProvider>);
    await signIn();
    const countAfterSignIn = mintCalls.length;

    setVisibility("hidden");
    await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    expect(mintCalls.length).toBe(countAfterSignIn);
  });

  it("refreshes on a bfcache restore (pageshow with persisted:true)", async () => {
    const mintCalls = setFetchMock();
    render(<AuthProvider><div/></AuthProvider>);
    await signIn();
    const countAfterSignIn = mintCalls.length;

    const pageshow = new Event("pageshow");
    Object.defineProperty(pageshow, "persisted", { value: true });
    await act(async () => { window.dispatchEvent(pageshow); });
    await waitFor(() => expect(mintCalls.length).toBeGreaterThan(countAfterSignIn));
  });

  it("ignores a plain (non-bfcache) pageshow — persisted:false", async () => {
    const mintCalls = setFetchMock();
    render(<AuthProvider><div/></AuthProvider>);
    await signIn();
    const countAfterSignIn = mintCalls.length;

    const pageshow = new Event("pageshow");
    Object.defineProperty(pageshow, "persisted", { value: false });
    await act(async () => { window.dispatchEvent(pageshow); });
    expect(mintCalls.length).toBe(countAfterSignIn);
  });

  it("throttles a burst of refresh triggers to at most one mint call", async () => {
    const mintCalls = setFetchMock();
    render(<AuthProvider><div/></AuthProvider>);
    await signIn();
    const countAfterSignIn = mintCalls.length;

    // Rapid tab-switching: several visibilitychange/pageshow events fire in
    // quick succession — should collapse to at most one additional mint.
    for (let i = 0; i < 5; i++) {
      setVisibility("visible");
      // eslint-disable-next-line no-await-in-loop
      await act(async () => { document.dispatchEvent(new Event("visibilitychange")); });
    }
    await waitFor(() => expect(mintCalls.length).toBeGreaterThan(countAfterSignIn));
    expect(mintCalls.length).toBe(countAfterSignIn + 1);
  });

  it("clears the routing cookie on logout, however it was last refreshed", async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: async () => ({}) }));
    const { useAuth } = await import("./AuthContext");
    let ctx;
    function Consumer() { ctx = useAuth(); return null; }
    render(<AuthProvider><Consumer/></AuthProvider>);
    await signIn();
    global.fetch.mockClear();
    await act(async () => { await ctx.logout(); });
    expect(global.fetch).toHaveBeenCalledWith(
      "/api/data?resource=session&action=clear",
      expect.objectContaining({ method: "POST" })
    );
  });
});
