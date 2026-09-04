import {
  MAX_DIMENSION,
  JPEG_QUALITY,
  MAX_AVATAR_SOURCE_BYTES,
  MAX_AVATAR_DATA_URL_LENGTH,
  AVATAR_DATA_URL_RE,
  toDataUrl,
  validateSource,
  validateDataUrl,
  avatarSource,
  QUALITY_STEPS,
} from "./avatar";

// The profile picture is stored as a data: URI on user_profiles.avatar_url —
// the same column the web writes — so a picture set from either client is the
// picture on both. That only holds if mobile respects the SAME limits: the
// server rejects anything over MAX_AVATAR_DATA_URL_LENGTH or outside its
// format regex, and there is no blob storage, so an oversized upload is bytes
// in the Neon database. These pin the constants against the web's and the
// server's, and pin the client-side checks to exactly what the server does.

describe("limits match the web app and the server", () => {
  it("uses the web's compression targets", () => {
    // src/utils/image.js: MAX_DIMENSION 256, JPEG_QUALITY 0.72, 8MB source.
    expect(MAX_DIMENSION).toBe(256);
    expect(JPEG_QUALITY).toBe(0.72);
    expect(MAX_AVATAR_SOURCE_BYTES).toBe(8 * 1024 * 1024);
  });

  it("uses the server's hard cap and format rule", () => {
    // api/_lib/handlers/lookups.js: MAX_AVATAR_DATA_URL_LENGTH / AVATAR_DATA_URL_RE.
    expect(MAX_AVATAR_DATA_URL_LENGTH).toBe(130000);
    expect(AVATAR_DATA_URL_RE.source).toBe(
      String.raw`^data:image\/(jpeg|jpg|png|webp);base64,[A-Za-z0-9+/=]+$`
    );
  });

  it("starts the quality ladder at the web's quality and only goes down", () => {
    // Retrying must never RAISE quality above what the web uses, or mobile
    // would be uploading bigger pictures than the browser for the same rule.
    expect(QUALITY_STEPS[0]).toBe(JPEG_QUALITY);
    for (let i = 1; i < QUALITY_STEPS.length; i++) {
      expect(QUALITY_STEPS[i]).toBeLessThan(QUALITY_STEPS[i - 1]);
    }
  });
});

describe("toDataUrl", () => {
  it("wraps bare base64 in the prefix the server expects", () => {
    expect(toDataUrl("AAAA")).toBe("data:image/jpeg;base64,AAAA");
    expect(AVATAR_DATA_URL_RE.test(toDataUrl("AAAA"))).toBe(true);
  });

  it("does not double-prefix something already a data URI", () => {
    const already = "data:image/png;base64,BBBB";
    expect(toDataUrl(already)).toBe(already);
  });

  it("returns null for nothing", () => {
    for (const v of ["", null, undefined, 42]) expect(toDataUrl(v)).toBeNull();
  });
});

describe("validateSource", () => {
  it("rejects a non-image", () => {
    expect(validateSource({ mimeType: "application/pdf" })).toMatch(/image file/);
  });

  it("rejects a source over 8MB, matching the web", () => {
    expect(validateSource({ fileSize: MAX_AVATAR_SOURCE_BYTES + 1 })).toMatch(/8MB/);
    expect(validateSource({ fileSize: MAX_AVATAR_SOURCE_BYTES })).toBeNull();
  });

  it("accepts an image, and tolerates a picker that reports neither field", () => {
    expect(validateSource({ mimeType: "image/jpeg", fileSize: 1000 })).toBeNull();
    expect(validateSource({})).toBeNull();
    expect(validateSource()).toBeNull();
  });
});

describe("validateDataUrl — the same check the server will run", () => {
  const ok = (n) => `data:image/jpeg;base64,${"A".repeat(n)}`;

  it("accepts every format the server accepts", () => {
    for (const mime of ["jpeg", "jpg", "png", "webp"]) {
      expect(validateDataUrl(`data:image/${mime};base64,AAAA`)).toBeNull();
    }
  });

  it("rejects a format the server would reject", () => {
    expect(validateDataUrl("data:image/gif;base64,AAAA")).toMatch(/format/);
    expect(validateDataUrl("data:image/svg+xml;base64,AAAA")).toMatch(/format/);
    // Not a data URI at all — e.g. a file:// path leaking through.
    expect(validateDataUrl("file:///tmp/photo.jpg")).toMatch(/format/);
  });

  it("rejects at exactly the server's cap, not one byte later", () => {
    const prefix = "data:image/jpeg;base64,".length;
    expect(validateDataUrl(ok(MAX_AVATAR_DATA_URL_LENGTH - prefix))).toBeNull();
    expect(validateDataUrl(ok(MAX_AVATAR_DATA_URL_LENGTH - prefix + 1))).toMatch(/too large/);
  });

  it("rejects empty or absent input", () => {
    for (const v of ["", null, undefined, 42]) expect(validateDataUrl(v)).toMatch(/process/);
  });
});

describe("avatarSource — cross-client display", () => {
  it("reads the server's snake_case column", () => {
    // This is what makes a picture uploaded on web appear on mobile: both
    // read the same avatar_url.
    expect(avatarSource({ avatar_url: "data:image/jpeg;base64,AAA" })).toEqual({
      uri: "data:image/jpeg;base64,AAA",
    });
  });

  it("also accepts a camelCase object", () => {
    expect(avatarSource({ avatarUrl: "x" })).toEqual({ uri: "x" });
  });

  it("returns null when there is no picture, so callers fall back to initials", () => {
    for (const p of [null, undefined, {}, { avatar_url: "" }, { avatar_url: 42 }]) {
      expect(avatarSource(p)).toBeNull();
    }
  });
});
