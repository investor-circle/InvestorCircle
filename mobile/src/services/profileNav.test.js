import { callApi } from "./api";
import { fetchProfileNavInfo, _resetProfileNavCache } from "./profileNav";

jest.mock("./api", () => ({ callApi: jest.fn() }));

// Feed rows carry the author's name but not their username, and profile routes
// are by username — so tapping an author needs this lookup. It runs while the
// feed is on screen, once per author across however many of their cards are
// visible, so the caching is the point, not a nicety.

beforeEach(() => {
  _resetProfileNavCache();
  callApi.mockReset();
});

describe("fetchProfileNavInfo", () => {
  it("returns the username for a user id", async () => {
    callApi.mockResolvedValue({ ok: true, data: { info: { username: "asha", isSebiApproved: false } } });
    await expect(fetchProfileNavInfo("u1")).resolves.toEqual({ username: "asha", isSebiApproved: false });
  });

  it("asks once for a user, however many cards want them", async () => {
    callApi.mockResolvedValue({ ok: true, data: { info: { username: "asha" } } });
    await Promise.all([fetchProfileNavInfo("u1"), fetchProfileNavInfo("u1"), fetchProfileNavInfo("u1")]);
    expect(callApi).toHaveBeenCalledTimes(1);
  });

  it("shares one in-flight request between simultaneous callers", async () => {
    // The cache holds the PROMISE, not just the result: several cards by the
    // same author mount in the same tick, before any response has arrived.
    let resolve;
    callApi.mockReturnValue(new Promise((r) => { resolve = r; }));
    const a = fetchProfileNavInfo("u1");
    const b = fetchProfileNavInfo("u1");
    expect(callApi).toHaveBeenCalledTimes(1);
    resolve({ ok: true, data: { info: { username: "asha" } } });
    expect(await a).toEqual(await b);
  });

  it("does not cache a miss, so a later attempt can retry", async () => {
    callApi.mockResolvedValueOnce({ ok: true, data: { info: null } });
    expect(await fetchProfileNavInfo("u1")).toBeNull();

    callApi.mockResolvedValueOnce({ ok: true, data: { info: { username: "asha" } } });
    expect(await fetchProfileNavInfo("u1")).toEqual({ username: "asha" });
    expect(callApi).toHaveBeenCalledTimes(2);
  });

  it("does not cache an error either", async () => {
    callApi.mockRejectedValueOnce(new Error("offline"));
    expect(await fetchProfileNavInfo("u1")).toBeNull();

    callApi.mockResolvedValueOnce({ ok: true, data: { info: { username: "asha" } } });
    expect(await fetchProfileNavInfo("u1")).toEqual({ username: "asha" });
  });

  it("returns null without asking when there is no user id", async () => {
    expect(await fetchProfileNavInfo(null)).toBeNull();
    expect(await fetchProfileNavInfo(undefined)).toBeNull();
    expect(callApi).not.toHaveBeenCalled();
  });

  it("url-encodes the id rather than interpolating it raw", async () => {
    callApi.mockResolvedValue({ ok: true, data: { info: { username: "x" } } });
    await fetchProfileNavInfo("a b&c");
    expect(callApi.mock.calls[0][0]).toContain("userId=a%20b%26c");
  });
});
