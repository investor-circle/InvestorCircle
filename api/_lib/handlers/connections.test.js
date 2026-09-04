import { describe, it, expect, vi, beforeEach } from "vitest";

// A connection request has always written an in-app notification row here.
// The email and the push, however, were fired by the BROWSER after the
// response came back — so a request sent from the mobile app reached the
// recipient's bell icon and nowhere else. Moving the fan-out server-side is
// what makes both clients notify identically, and it also means neither
// client needs to know the other member's email address.

const sqlCalls = [];
let connectionRows = [{ id: "c1", requester_id: "me", addressee_id: "them", status: "pending" }];
let existingRows = [];
const sqlTag = (strings, ...values) => {
  const text = strings.join("?");
  sqlCalls.push({ text, values });
  if (text.includes("SELECT id, status FROM connections")) return Promise.resolve(existingRows);
  if (text.includes("INSERT INTO connections")) return Promise.resolve(connectionRows);
  if (text.includes("UPDATE connections")) return Promise.resolve(connectionRows);
  return Promise.resolve([]);
};
vi.mock("../auth.js", async () => {
  const actual = await vi.importActual("../auth.js");
  return { ...actual, sql: (...a) => sqlTag(...a), parseBody: (req) => req.body || {} };
});

const notifyMember = vi.fn();
vi.mock("../notifyMember.js", () => ({ notifyMember: (...a) => notifyMember(...a) }));

const { default: handleConnections } = await import("./connections.js");

const mkRes = () => ({
  statusCode: 0,
  body: null,
  setHeader: vi.fn(),
  status(c) { this.statusCode = c; return this; },
  json(b) { this.body = b; return this; },
  end() { return this; },
});

const post = async (body, myId = "me") => {
  const res = mkRes();
  await handleConnections({ method: "POST", query: {}, body }, res, myId);
  return res;
};

beforeEach(() => {
  sqlCalls.length = 0;
  vi.clearAllMocks();
  connectionRows = [{ id: "c1", requester_id: "me", addressee_id: "them", status: "pending" }];
  existingRows = [];
});

describe("sending a connection request", () => {
  it("notifies the recipient, whichever client asked", async () => {
    await post({ action: "send", addresseeId: "them" });
    expect(notifyMember).toHaveBeenCalledWith({
      recipientId: "them",
      senderId: "me",
      type: "connection_request",
    });
  });

  it("still writes the in-app notification row too", async () => {
    await post({ action: "send", addresseeId: "them" });
    expect(sqlCalls.some((c) => c.text.includes("INSERT INTO notifications"))).toBe(true);
  });

  it("takes the sender from the verified caller, never the body", async () => {
    // myId is resolved by api/data.js from the token before this handler runs.
    await post({ action: "send", addresseeId: "them", senderId: "someone-else" }, "me");
    expect(notifyMember.mock.calls[0][0].senderId).toBe("me");
  });

  it("does not notify when the connection already exists", async () => {
    // Otherwise re-tapping Connect would push the same person again and again.
    existingRows = [{ id: "c1", status: "pending" }];
    const res = await post({ action: "send", addresseeId: "them" });
    expect(res.body.error).toBe("already_exists");
    expect(notifyMember).not.toHaveBeenCalled();
    expect(sqlCalls.some((c) => c.text.includes("INSERT INTO connections"))).toBe(false);
  });

  it("refuses a request to yourself, and notifies nobody", async () => {
    const res = await post({ action: "send", addresseeId: "me" });
    expect(res.statusCode).toBe(400);
    expect(notifyMember).not.toHaveBeenCalled();
  });
});

describe("accepting a connection request", () => {
  it("notifies the requester", async () => {
    connectionRows = [{ id: "c1", requester_id: "them", addressee_id: "me", status: "accepted" }];
    await post({ action: "accept", connectionId: "c1" });
    expect(notifyMember).toHaveBeenCalledWith({
      recipientId: "them",
      senderId: "me",
      type: "connection_accepted",
    });
  });

  it("notifies nobody on a REJECT", async () => {
    // Being turned down is not something anyone should be pushed about.
    connectionRows = [{ id: "c1", requester_id: "them", addressee_id: "me", status: "rejected" }];
    await post({ action: "reject", connectionId: "c1" });
    expect(notifyMember).not.toHaveBeenCalled();
  });

  it("notifies nobody when there was no pending request to accept", async () => {
    connectionRows = [];
    const res = await post({ action: "accept", connectionId: "c1" });
    expect(res.statusCode).toBe(404);
    expect(notifyMember).not.toHaveBeenCalled();
  });
});
