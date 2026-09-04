import {
  primeReactions,
  isLiked,
  toggleReaction,
  setLiked,
  clearReactions,
  subscribeReactions,
  _resetReactionStore,
} from "./reactionStore";
import { getReactionsBatch, reactToReco } from "./api/engagementApi";

jest.mock("./api/engagementApi", () => ({
  getReactionsBatch: jest.fn(async () => ({})),
  reactToReco: jest.fn(async () => true),
}));

// The web hydrates "have I liked this?" after every feed load and puts a like
// button with its count on every row. The app fetched neither — reactions-batch
// was the one engagement endpoint no mobile screen reached — so an idea already
// liked on the web looked untouched on the phone, and no list could like one.
//
// The store is shared because the same idea appears in Feed, Discover and
// Track at once; these pin the parts that make sharing safe.

beforeEach(() => {
  _resetReactionStore();
  jest.clearAllMocks();
  getReactionsBatch.mockResolvedValue({});
  reactToReco.mockResolvedValue(true);
});

describe("priming", () => {
  it("records the ideas the server says are liked", async () => {
    getReactionsBatch.mockResolvedValue({ a: "like" });
    await primeReactions(["a", "b"]);
    expect(isLiked("a")).toBe(true);
  });

  it("treats an id asked for and NOT returned as a confirmed 'not liked'", async () => {
    // The endpoint returns only the liked ids. Leaving the rest unknown would
    // make every later list re-ask for the same ids forever.
    getReactionsBatch.mockResolvedValue({ a: "like" });
    await primeReactions(["a", "b"]);
    expect(isLiked("b")).toBe(false);
  });

  it("is undefined — not false — before anything is known", () => {
    // The card must not render "not liked" for an idea it has no answer for.
    expect(isLiked("z")).toBeUndefined();
  });

  it("does not re-ask for ids it already knows", async () => {
    await primeReactions(["a"]);
    await primeReactions(["a"]);
    expect(getReactionsBatch).toHaveBeenCalledTimes(1);
  });

  it("de-duplicates within one call and ignores empty ids", async () => {
    await primeReactions(["a", "a", "", null, undefined]);
    expect(getReactionsBatch).toHaveBeenCalledWith(["a"]);
  });

  it("asks for nothing when there is nothing new", async () => {
    await primeReactions([]);
    expect(getReactionsBatch).not.toHaveBeenCalled();
  });

  it("splits a long list, because the server caps it at 200 ids", async () => {
    // Past the cap the server drops the tail silently, and those cards would
    // render as "not liked" — wrong, not merely unknown.
    const ids = Array.from({ length: 320 }, (_, i) => `r${i}`);
    await primeReactions(ids);
    expect(getReactionsBatch).toHaveBeenCalledTimes(3);
    for (const call of getReactionsBatch.mock.calls) {
      expect(call[0].length).toBeLessThanOrEqual(200);
    }
    expect(isLiked("r319")).toBe(false);
  });

  it("leaves ids unknown when the fetch fails, so a later list retries", async () => {
    getReactionsBatch.mockRejectedValue(new Error("offline"));
    await expect(primeReactions(["a"])).resolves.toBeUndefined();
    expect(isLiked("a")).toBeUndefined();
  });
});

describe("toggling", () => {
  it("likes an idea and reports the new state", async () => {
    await expect(toggleReaction("a")).resolves.toBe(true);
    expect(isLiked("a")).toBe(true);
    expect(reactToReco).toHaveBeenCalledWith("a", "like");
  });

  it("clears the reaction when unliking", async () => {
    await toggleReaction("a");
    await expect(toggleReaction("a")).resolves.toBe(false);
    expect(reactToReco).toHaveBeenLastCalledWith("a", null);
  });

  it("flips back when the write fails", async () => {
    // A like that appears to work and silently didn't is worse than one that
    // visibly bounces back.
    reactToReco.mockResolvedValue(false);
    await expect(toggleReaction("a")).resolves.toBe(false);
    expect(isLiked("a")).toBe(false);
  });

  it("shows the new state before the write comes back", async () => {
    let release;
    reactToReco.mockReturnValue(new Promise((r) => { release = r; }));
    const pending = toggleReaction("a");
    expect(isLiked("a")).toBe(true); // optimistic
    release(true);
    await pending;
  });
});

describe("staying in agreement across screens", () => {
  it("notifies subscribers so a card re-renders", async () => {
    const seen = jest.fn();
    const unsub = subscribeReactions(seen);
    await toggleReaction("a");
    expect(seen).toHaveBeenCalled();
    unsub();
  });

  it("accepts a state written elsewhere — the detail screen's own like", async () => {
    // That one sends a notification, so it does its own write and reports
    // the outcome here rather than going through toggleReaction.
    setLiked("a", true);
    expect(isLiked("a")).toBe(true);
    expect(reactToReco).not.toHaveBeenCalled();
  });

  it("does not wake subscribers when nothing actually changed", async () => {
    setLiked("a", true);
    const seen = jest.fn();
    const unsub = subscribeReactions(seen);
    setLiked("a", true);
    expect(seen).not.toHaveBeenCalled();
    unsub();
  });

  it("stops listening after unsubscribe", async () => {
    const seen = jest.fn();
    subscribeReactions(seen)();
    await toggleReaction("a");
    expect(seen).not.toHaveBeenCalled();
  });
});

describe("sign-out", () => {
  it("forgets everything, so the next person on this phone inherits nothing", async () => {
    getReactionsBatch.mockResolvedValue({ a: "like" });
    await primeReactions(["a"]);
    clearReactions();
    expect(isLiked("a")).toBeUndefined();
  });
});
