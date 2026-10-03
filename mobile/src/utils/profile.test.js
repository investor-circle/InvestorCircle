import {
  profileToForm,
  buildProfilePayload,
  validateProfile,
  isSebiStatus,
  REG_STATUSES,
  REG_PUBLISHER,
  REG_CONTRIBUTOR,
  REG_LABELS,
  normalizeRegStatus,
} from "./profile";

// profile-edit-save is a WHOLE-RECORD write: the server sets every column it
// handles from the payload it receives. Omitting a field therefore does not
// leave it alone — it nulls it. The property that matters most here is the
// round trip: server row -> form -> payload must carry everything, or saving
// a name change silently wipes the user's bio and links with no error.

const serverRow = {
  first_name: "Asha",
  last_name: "Rao",
  full_name: "Asha Rao",
  bio: "Long-term compounder hunter",
  avatar_color: "#6d5df5",
  twitter_url: "https://x.com/asha",
  linkedin_url: "https://linkedin.com/in/asha",
  telegram_url: "https://t.me/asha",
  instagram_url: "https://instagram.com/asha",
  registration_status: REG_PUBLISHER,
  sebi_reg_number: "INH000012345",
  sebi_reg_valid_till: "2030-01-01",
  sebi_firm_name: "Rao Research",
};

describe("round trip — the data-loss guard", () => {
  it("carries every editable field from the server row into the payload", () => {
    const payload = buildProfilePayload(profileToForm(serverRow));
    expect(payload).toEqual({
      firstName: "Asha",
      lastName: "Rao",
      bio: "Long-term compounder hunter",
      avatarColor: "#6d5df5",
      twitter: "https://x.com/asha",
      linkedin: "https://linkedin.com/in/asha",
      telegram: "https://t.me/asha",
      instagram: "https://instagram.com/asha",
      registrationStatus: REG_PUBLISHER,
      sebiNum: "INH000012345",
      sebiTill: "2030-01-01",
      sebiFirm: "Rao Research",
    });
  });

  it("does not drop the bio when only the name is edited", () => {
    // The exact bug the whole-record write invites.
    const form = { ...profileToForm(serverRow), firstName: "Asha M" };
    expect(buildProfilePayload(form).bio).toBe("Long-term compounder hunter");
    expect(buildProfilePayload(form).linkedin).toBe("https://linkedin.com/in/asha");
  });
});

describe("profileToForm", () => {
  it("turns absent columns into empty strings, never undefined", () => {
    // undefined would make a TextInput uncontrolled and warn.
    const form = profileToForm({});
    for (const v of Object.values(form)) expect(typeof v).toBe("string");
  });

  it("defaults an unknown or missing registration status to Independent Market Contributor", () => {
    expect(profileToForm({}).registrationStatus).toBe(REG_CONTRIBUTOR);
    expect(profileToForm({ registration_status: "nonsense" }).registrationStatus).toBe(REG_CONTRIBUTOR);
  });

  it("maps a legacy category on a not-yet-migrated row to its replacement", () => {
    expect(profileToForm({ registration_status: "sebi_ra" }).registrationStatus).toBe(REG_PUBLISHER);
    for (const legacy of ["self_directed", "enthusiast", "sebi_ria"]) {
      expect(profileToForm({ registration_status: legacy }).registrationStatus).toBe(REG_CONTRIBUTOR);
    }
  });

  it("survives a null profile, which is the state before it loads", () => {
    expect(() => profileToForm(null)).not.toThrow();
    expect(profileToForm(null).firstName).toBe("");
  });
});

describe("buildProfilePayload", () => {
  it("trims whitespace so a spaces-only bio is stored as empty", () => {
    const p = buildProfilePayload({ firstName: "  Asha  ", bio: "   " });
    expect(p.firstName).toBe("Asha");
    expect(p.bio).toBe("");
  });

  it("omits SEBI fields entirely for an Independent Market Contributor", () => {
    // Sending stale SEBI values would misrepresent what the user claimed;
    // the server nulls them for non-SEBI statuses anyway.
    const p = buildProfilePayload({
      firstName: "A",
      registrationStatus: REG_CONTRIBUTOR,
      sebiNum: "LEFTOVER",
    });
    expect(p).not.toHaveProperty("sebiNum");
    expect(p).not.toHaveProperty("sebiTill");
    expect(p).not.toHaveProperty("sebiFirm");
  });

  it("includes SEBI fields for a Verified Research Publisher", () => {
    const p = buildProfilePayload({ firstName: "A", registrationStatus: REG_PUBLISHER, sebiNum: "X" });
    expect(p.sebiNum).toBe("X");
  });

  it("never sends a registration status the server would reject", () => {
    // The server 400s any status that does not normalise to a current category.
    const p = buildProfilePayload({ firstName: "A", registrationStatus: "admin" });
    expect(REG_STATUSES).toContain(p.registrationStatus);
    expect(p.registrationStatus).toBe(REG_CONTRIBUTOR);
  });

  it("survives an empty or absent form", () => {
    for (const f of [null, undefined, {}]) {
      expect(() => buildProfilePayload(f)).not.toThrow();
      expect(buildProfilePayload(f).registrationStatus).toBe(REG_CONTRIBUTOR);
    }
  });
});

describe("validateProfile", () => {
  it("requires a first name", () => {
    expect(validateProfile({ firstName: "   " })).toMatch(/First name/);
    expect(validateProfile({ firstName: "Asha" })).toBeNull();
  });

  // Matches the web on purpose: neither of its save paths (Profile.jsx
  // saveEdit / ProfileEditModal.save) requires a SEBI number even when the
  // claimed status is a registered kind, so mobile must not block on one
  // either — the same input has to be saveable on both clients.
  it("does not require a SEBI number for a registered status, matching web", () => {
    expect(validateProfile({ firstName: "A", registrationStatus: REG_PUBLISHER })).toBeNull();
    expect(validateProfile({ firstName: "A", registrationStatus: REG_PUBLISHER, sebiNum: "X" })).toBeNull();
  });

  it("does not demand a SEBI number from an Independent Market Contributor", () => {
    expect(validateProfile({ firstName: "A", registrationStatus: REG_CONTRIBUTOR })).toBeNull();
  });

  it("caps the bio at 300 characters, matching the web's textarea", () => {
    expect(validateProfile({ firstName: "A", bio: "x".repeat(301) })).toMatch(/300/);
    expect(validateProfile({ firstName: "A", bio: "x".repeat(300) })).toBeNull();
  });
});

describe("isSebiStatus", () => {
  it("recognises Verified Research Publisher (and its legacy code) and nothing else", () => {
    expect(isSebiStatus(REG_PUBLISHER)).toBe(true);
    expect(isSebiStatus("sebi_ra")).toBe(true);
    for (const v of [REG_CONTRIBUTOR, "self_directed", "sebi_ria", "", null, undefined, "sebi"]) {
      expect(isSebiStatus(v)).toBe(false);
    }
  });
});

describe("profile categories", () => {
  it("offers exactly the two categories, each with a label", () => {
    expect(REG_STATUSES).toEqual([REG_PUBLISHER, REG_CONTRIBUTOR]);
    expect(REG_LABELS[REG_PUBLISHER]).toBe("Verified Research Publisher");
    expect(REG_LABELS[REG_CONTRIBUTOR]).toBe("Independent Market Contributor");
  });

  it("maps every retired code the way the data migration does", () => {
    expect(normalizeRegStatus("self_directed")).toBe(REG_CONTRIBUTOR);
    expect(normalizeRegStatus("enthusiast")).toBe(REG_CONTRIBUTOR);
    expect(normalizeRegStatus("sebi_ria")).toBe(REG_CONTRIBUTOR);
    expect(normalizeRegStatus("sebi_ra")).toBe(REG_PUBLISHER);
  });
});
