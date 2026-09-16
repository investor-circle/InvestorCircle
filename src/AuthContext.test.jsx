import { describe, it, expect, vi, afterEach } from "vitest";

const setPersistence = vi.fn(() => Promise.resolve());
const signInWithEmailAndPassword = vi.fn(() => Promise.resolve({ user: { uid: "u1" } }));
vi.mock("firebase/auth", () => ({
  onAuthStateChanged: vi.fn(),
  signInWithEmailAndPassword: (...args) => signInWithEmailAndPassword(...args),
  signInWithPopup: vi.fn(),
  GoogleAuthProvider: vi.fn(),
  signOut: vi.fn(),
  setPersistence: (...args) => setPersistence(...args),
  browserLocalPersistence: "LOCAL",
  browserSessionPersistence: "SESSION",
}));
vi.mock("./firebase", () => ({ auth: "fake-auth" }));

import { mintRoutingCookie, clearRoutingCookie, login } from "./AuthContext";

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
    expect(opts).toMatchObject({ method: "POST", credentials: "same-origin" });
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
    expect(opts).toMatchObject({ method: "POST", credentials: "same-origin" });
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
