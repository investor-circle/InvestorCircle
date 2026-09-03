import fs from "fs";
import path from "path";
import { track, trackScreen, identify, isAnalyticsAvailable, EVENTS, _resetAnalytics } from "./analytics";

// Analytics exists so web and app can be read in ONE report. That only works
// if both send the same event names with the same parameters — a
// `signup_mobile` next to the web's `sign_up` is worse than no data, because
// it looks like a funnel and isn't one. The last test here reads the web's
// own source so a rename on either side is caught here rather than noticed in
// GA4 six weeks later.
//
// The other thing that matters: this must never crash the app. The native
// module only exists in a build made after the dependency was added, so the
// app has to survive its absence.

const mockLogEvent = jest.fn(async () => {});
const mockLogScreenView = jest.fn(async () => {});
const mockSetUserId = jest.fn(async () => {});
let mockModuleThrows = false;

jest.mock(
  "@react-native-firebase/analytics",
  () => ({
    __esModule: true,
    default: () => {
      if (mockModuleThrows) throw new Error("native module not linked");
      return { logEvent: mockLogEvent, logScreenView: mockLogScreenView, setUserId: mockSetUserId };
    },
  }),
  { virtual: true }
);

beforeEach(() => {
  jest.clearAllMocks();
  mockModuleThrows = false;
  _resetAnalytics();
});

describe("logging events", () => {
  it("sends the event and its parameters", () => {
    track("reco_created", { rec_type: "Buy", is_public: true });
    expect(mockLogEvent).toHaveBeenCalledWith("reco_created", { rec_type: "Buy", is_public: true });
  });

  it("strips null and undefined parameters", () => {
    // GA4 drops the whole event when a value is null, not just the field, so
    // one missing optional would silently lose the event entirely.
    track("reco_created", { rec_type: "Buy", conviction: null, asset_class: undefined });
    expect(mockLogEvent).toHaveBeenCalledWith("reco_created", { rec_type: "Buy" });
  });

  it("keeps a false and a zero, which are values and not absences", () => {
    track("reco_created", { is_public: false, count: 0 });
    expect(mockLogEvent).toHaveBeenCalledWith("reco_created", { is_public: false, count: 0 });
  });

  it("sends an event with no parameters at all", () => {
    track("push_enabled");
    expect(mockLogEvent).toHaveBeenCalledWith("push_enabled", {});
  });

  it("ignores a call with no event name", () => {
    track("");
    track(null);
    expect(mockLogEvent).not.toHaveBeenCalled();
  });
});

describe("screens", () => {
  it("reports a screen as page_view/page_name, exactly as the web does", () => {
    // The web has no concept of a screen-view event; matching its event name is
    // what puts a web visit and an app visit in the same report.
    trackScreen("portfolio");
    expect(mockLogEvent).toHaveBeenCalledWith("page_view", { page_name: "portfolio" });
  });

  it("also sends Firebase's own screen event, which drives the app reports", () => {
    trackScreen("portfolio");
    expect(mockLogScreenView).toHaveBeenCalledWith({ screen_name: "portfolio", screen_class: "portfolio" });
  });

  it("ignores an empty screen name", () => {
    trackScreen("");
    expect(mockLogEvent).not.toHaveBeenCalled();
  });
});

describe("identity", () => {
  it("sets the member's uid, the same one the web sets", () => {
    identify("uid-123");
    expect(mockSetUserId).toHaveBeenCalledWith("uid-123");
  });

  it("clears it at sign-out", () => {
    identify(null);
    expect(mockSetUserId).toHaveBeenCalledWith(null);
  });
});

describe("never taking the app down", () => {
  it("no-ops when the native module is missing from this build", () => {
    // Expo Go, or a binary built before the dependency was added.
    mockModuleThrows = true;
    expect(isAnalyticsAvailable()).toBe(false);
    expect(() => track("login", { method: "email" })).not.toThrow();
    expect(() => trackScreen("home")).not.toThrow();
    expect(() => identify("uid")).not.toThrow();
    expect(mockLogEvent).not.toHaveBeenCalled();
  });

  it("swallows a failure from the native call itself", () => {
    mockLogEvent.mockImplementation(() => {
      throw new Error("boom");
    });
    expect(() => track("login")).not.toThrow();
  });

  it("swallows a rejected promise from the native call", async () => {
    mockLogEvent.mockRejectedValue(new Error("offline"));
    expect(() => track("login")).not.toThrow();
    await Promise.resolve();
  });

  it("resolves the module once, not on every event", () => {
    track("login");
    track("sign_up");
    expect(isAnalyticsAvailable()).toBe(true);
    expect(mockLogEvent).toHaveBeenCalledTimes(2);
  });
});

describe("the app and the web agree on event names", () => {
  const repoRoot = path.resolve(__dirname, "../../..");

  const webEvents = () => {
    const found = new Set();
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) walk(full);
        else if (/\.jsx?$/.test(entry.name) && !entry.name.includes(".test.")) {
          const src = fs.readFileSync(full, "utf8");
          for (const m of src.matchAll(/\btrack\(\s*['"]([a-z0-9_]+)['"]/g)) found.add(m[1]);
        }
      }
    };
    walk(path.join(repoRoot, "src"));
    return found;
  };

  const mobileEvents = () => {
    const found = new Set();
    const walk = (dir) => {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.name === "node_modules") continue;
        if (entry.isDirectory()) walk(full);
        else if (/\.js$/.test(entry.name) && !entry.name.includes(".test.")) {
          const src = fs.readFileSync(full, "utf8");
          for (const m of src.matchAll(/\btrack\(\s*['"]([a-z0-9_]+)['"]/g)) found.add(m[1]);
        }
      }
    };
    walk(path.join(repoRoot, "mobile", "src"));
    walk(path.join(repoRoot, "mobile", "app"));
    return found;
  };

  it("sends nothing the web does not also send", () => {
    // A name only one client uses cannot be compared across channels, which
    // is the entire point of doing this. Anything genuinely mobile-only
    // belongs in EVENTS with a reason, not invented at a call site.
    const web = webEvents();
    const extra = [...mobileEvents()].filter((e) => !web.has(e) && !EVENTS.includes(e));
    expect(extra).toEqual([]);
  });

  it("lists every event the web sends, so a gap is visible here", () => {
    const missing = [...webEvents()].filter((e) => !EVENTS.includes(e));
    expect(missing).toEqual([]);
  });

  it("actually emits most of what it lists", () => {
    // Guards the opposite failure: EVENTS drifting into a wish-list that
    // documents coverage the app does not have.
    const emitted = mobileEvents();
    const unsent = EVENTS.filter((e) => !emitted.has(e));
    expect(unsent).toEqual([]);
  });
});
