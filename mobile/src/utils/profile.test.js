import {
  profileToForm,
  buildProfilePayload,
  validateProfile,
  isSebiStatus,
  REG_STATUSES,
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
  registration_status: "sebi_ra",
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
      registrationStatus: "sebi_ra",
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

  it("defaults an unknown or missing registration status to self_directed", () => {
    expect(profileToForm({}).registrationStatus).toBe("self_directed");
    expect(profileToForm({ registration_status: "nonsense" }).registrationStatus).toBe("self_directed");
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

  it("omits SEBI fields entirely for a self-directed user", () => {
    // Sending stale SEBI values would misrepresent what the user claimed;
    // the server nulls them for non-SEBI statuses anyway.
    const p = buildProfilePayload({
      firstName: "A",
      registrationStatus: "self_directed",
      sebiNum: "LEFTOVER",
    });
    expect(p).not.toHaveProperty("sebiNum");
    expect(p).not.toHaveProperty("sebiTill");
    expect(p).not.toHaveProperty("sebiFirm");
  });

  it("includes SEBI fields for both registered statuses", () => {
    for (const st of ["sebi_ra", "sebi_ria"]) {
      const p = buildProfilePayload({ firstName: "A", registrationStatus: st, sebiNum: "X" });
      expect(p.sebiNum).toBe("X");
    }
  });

  it("never sends a registration status the server would reject", () => {
    // ALLOWED_REG_STATUS_LOOKUPS on the server 400s anything else.
    const p = buildProfilePayload({ firstName: "A", registrationStatus: "admin" });
    expect(REG_STATUSES).toContain(p.registrationStatus);
    expect(p.registrationStatus).toBe("self_directed");
  });

  it("survives an empty or absent form", () => {
    for (const f of [null, undefined, {}]) {
      expect(() => buildProfilePayload(f)).not.toThrow();
      expect(buildProfilePayload(f).registrationStatus).toBe("self_directed");
    }
  });
});

describe("validateProfile", () => {
  it("requires a first name", () => {
    expect(validateProfile({ firstName: "   " })).toMatch(/First name/);
    expect(validateProfile({ firstName: "Asha" })).toBeNull();
  });

  it("requires a SEBI number when claiming a registered status", () => {
    expect(validateProfile({ firstName: "A", registrationStatus: "sebi_ra" })).toMatch(/SEBI/);
    expect(validateProfile({ firstName: "A", registrationStatus: "sebi_ria", sebiNum: "X" })).toBeNull();
  });

  it("does not demand a SEBI number from a self-directed user", () => {
    expect(validateProfile({ firstName: "A", registrationStatus: "self_directed" })).toBeNull();
  });

  it("caps the bio at the length the input enforces", () => {
    expect(validateProfile({ firstName: "A", bio: "x".repeat(501) })).toMatch(/500/);
    expect(validateProfile({ firstName: "A", bio: "x".repeat(500) })).toBeNull();
  });
});

describe("isSebiStatus", () => {
  it("recognises both registered kinds and nothing else", () => {
    expect(isSebiStatus("sebi_ra")).toBe(true);
    expect(isSebiStatus("sebi_ria")).toBe(true);
    for (const v of ["self_directed", "", null, undefined, "sebi"]) {
      expect(isSebiStatus(v)).toBe(false);
    }
  });
});
