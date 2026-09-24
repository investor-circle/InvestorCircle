import { callApi } from "./api";
import { primeMemberTags, cachedMemberTags, subscribeMemberTags, _resetMemberTagsCache } from "./memberTagsCache";

jest.mock("./api", () => ({ callApi: jest.fn() }));

// The tag map drives the Founding Member / Founding Research Partner badge on
// every avatar in the app. It used to load once per session, so a badge an
// admin granted after the app opened never appeared until a cold start, and
// one failed fetch meant no badges at all until then.

const ok = (tags) => ({ ok: true, data: { tags } });
const realNow = Date.now;
let now;

beforeEach(() => {
  _resetMemberTagsCache();
  now = realNow();
  Date.now = () => now;
});

afterEach(() => {
  Date.now = realNow;
  _resetMemberTagsCache();
});

describe("primeMemberTags", () => {
  it("turns the { tag: [ids] } map into per-person tag lists", async () => {
    callApi.mockResolvedValue(ok({ founding_member: ["u1"], founding_research_partner: ["u1", "u2"] }));

    await primeMemberTags();

    expect(cachedMemberTags("u1")).toEqual(["founding_member", "founding_research_partner"]);
    expect(cachedMemberTags("u2")).toEqual(["founding_research_partner"]);
  });

  it("does not refetch while the map is fresh", async () => {
    callApi.mockResolvedValue(ok({}));
    await primeMemberTags();
    await primeMemberTags();
    expect(callApi).toHaveBeenCalledTimes(1);
  });

  it("refetches after a few minutes, so a newly granted badge appears", async () => {
    callApi.mockResolvedValue(ok({}));
    await primeMemberTags();
    expect(cachedMemberTags("u1")).toEqual([]);

    now += 6 * 60 * 1000;
    callApi.mockResolvedValue(ok({ founding_research_partner: ["u1"] }));
    await primeMemberTags();

    expect(cachedMemberTags("u1")).toEqual(["founding_research_partner"]);
  });

  it("retries after a failed fetch instead of giving up for the session", async () => {
    callApi.mockRejectedValue(new Error("offline"));
    await primeMemberTags();

    now += 31 * 1000;
    callApi.mockResolvedValue(ok({ founding_member: ["u1"] }));
    await primeMemberTags();

    expect(cachedMemberTags("u1")).toEqual(["founding_member"]);
  });

  it("does not hammer the server straight after a failure", async () => {
    callApi.mockResolvedValue({ ok: false, data: {} });
    await primeMemberTags();
    await primeMemberTags();
    expect(callApi).toHaveBeenCalledTimes(1);
  });

  it("keeps the last good map when a refresh fails", async () => {
    callApi.mockResolvedValue(ok({ founding_member: ["u1"] }));
    await primeMemberTags();

    now += 6 * 60 * 1000;
    callApi.mockRejectedValue(new Error("offline"));
    await primeMemberTags();

    expect(cachedMemberTags("u1")).toEqual(["founding_member"]);
  });

  it("notifies subscribers when the map lands", async () => {
    const seen = jest.fn();
    subscribeMemberTags(seen);
    callApi.mockResolvedValue(ok({ founding_member: ["u1"] }));

    await primeMemberTags();

    expect(seen).toHaveBeenCalled();
  });
});

describe("cachedMemberTags", () => {
  it("returns the same empty list every time for someone untagged", () => {
    // A fresh [] per call would look like a change to useSyncExternalStore
    // and re-render forever.
    expect(cachedMemberTags("nobody")).toBe(cachedMemberTags("nobody"));
    expect(cachedMemberTags(null)).toBe(cachedMemberTags(undefined));
  });
});
