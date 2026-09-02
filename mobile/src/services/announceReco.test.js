import { announcePublicReco } from "./announceReco";
import { notifyPublicContacts } from "./api/recommendationsApi";
import { sendEmail, sendPush } from "./notify";

jest.mock("./api/recommendationsApi", () => ({
  notifyPublicContacts: jest.fn(() => Promise.resolve(true)),
}));
jest.mock("./notify", () => ({ sendEmail: jest.fn(), sendPush: jest.fn() }));

// A public idea creates no delivery rows, so NOTHING notifies anyone
// server-side when one is posted. The web fans out to the author's contacts
// from its create flow; mobile did not, which meant an idea posted from the
// phone reached nobody. These pin the three channels, and pin the two rules
// that matter if this ever gets edited: no price in a push body (lock
// screens), and never throw into the create flow (the post already
// succeeded).

const me = { username: "asha", full_name: "Asha Rao" };
const reco = { ticker: "INFY", assetName: "Infosys", recType: "Buy", priceAt: 1450, conviction: "High" };
const contacts = [
  { user_id: "u1", email: "one@example.com" },
  { user_id: "u2", email: "two@example.com" },
];

describe("announcePublicReco", () => {
  it("notifies in-app, by push and by email", () => {
    announcePublicReco({ reco, recoId: "r9", me, contacts });

    expect(notifyPublicContacts).toHaveBeenCalledWith("r9", ["u1", "u2"], expect.objectContaining({
      ticker: "INFY",
      recoId: "r9",
      recommenderUsername: "asha",
    }));
    expect(sendPush).toHaveBeenCalledTimes(2);
    expect(sendEmail).toHaveBeenCalledTimes(2);
  });

  it("links to the idea's own public page", () => {
    announcePublicReco({ reco, recoId: "r9", me, contacts });
    const url = sendPush.mock.calls[0][1].url;
    expect(url).toBe("https://myinvestorcircle.com/#/investor/asha/reco/r9");
    expect(sendEmail.mock.calls[0][1].reco_url).toBe(url);
  });

  it("keeps prices out of the push body — it can show on a lock screen", () => {
    announcePublicReco({ reco, recoId: "r9", me, contacts });
    for (const [, payload] of sendPush.mock.calls) {
      expect(payload.body).not.toMatch(/1450|₹|\d{3,}/);
      expect(payload.title).not.toMatch(/1450|₹/);
    }
  });

  it("does still put the entry price in the EMAIL, as the web does", () => {
    announcePublicReco({ reco, recoId: "r9", me, contacts });
    expect(sendEmail.mock.calls[0][1].entry_price).toContain("1,450");
  });

  it("skips a contact with no email but still pushes to them", () => {
    announcePublicReco({
      reco,
      recoId: "r9",
      me,
      contacts: [{ user_id: "u1" }, { user_id: "u2", email: "two@example.com" }],
    });
    expect(sendPush).toHaveBeenCalledTimes(2);
    expect(sendEmail).toHaveBeenCalledTimes(1);
  });

  it("does nothing when there is nobody to tell, or no idea id", () => {
    announcePublicReco({ reco, recoId: "r9", me, contacts: [] });
    announcePublicReco({ reco, recoId: null, me, contacts });
    announcePublicReco({ reco, recoId: "r9", me, contacts: null });
    expect(notifyPublicContacts).not.toHaveBeenCalled();
    expect(sendPush).not.toHaveBeenCalled();
  });

  it("ignores a contact row with no user id", () => {
    announcePublicReco({ reco, recoId: "r9", me, contacts: [{ email: "x@y.z" }, ...contacts] });
    expect(notifyPublicContacts.mock.calls[0][1]).toEqual(["u1", "u2"]);
  });

  it("never throws — a failed notification must not look like a failed post", () => {
    notifyPublicContacts.mockImplementationOnce(() => Promise.reject(new Error("down")));
    sendPush.mockImplementationOnce(() => {
      throw new Error("also down");
    });
    expect(() => announcePublicReco({ reco, recoId: "r9", me, contacts })).not.toThrow();
  });

  it("still works for an author with no username set", () => {
    announcePublicReco({ reco, recoId: "r9", me: { full_name: "Asha" }, contacts });
    expect(sendPush).toHaveBeenCalled();
    expect(sendPush.mock.calls[0][1].body).toContain("Asha");
  });
});
