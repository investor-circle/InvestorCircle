import { describe, it, expect } from "vitest";
import { parseFingerprints, invalidFingerprints, buildAssetLinks } from "./write-assetlinks.mjs";

// This file is the difference between a link shared from the mobile app
// opening the app and opening the browser. Android fetches
// /.well-known/assetlinks.json and will only hand the link over if it finds
// the package name next to the signing certificate's fingerprint; on Android
// 12+ a failed check means the app is not offered at all.
//
// The failure mode that matters is silence: a malformed or wrong fingerprint
// produces a file that looks published and correct, and simply never
// verifies. Nobody finds out until someone taps a link.

const VALID = "AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89";

describe("reading the configured fingerprints", () => {
  it("accepts one", () => {
    expect(parseFingerprints(VALID)).toEqual([VALID]);
  });

  it("accepts several, however they are separated", () => {
    // Two is the normal state while an internal build and a Play build are
    // both in circulation — they are signed with different keys.
    expect(parseFingerprints(`${VALID}, ${VALID}`)).toHaveLength(2);
    expect(parseFingerprints(`${VALID}\n${VALID}`)).toHaveLength(2);
  });

  it("upper-cases, because Android compares case-sensitively", () => {
    expect(parseFingerprints(VALID.toLowerCase())).toEqual([VALID]);
  });

  it("treats unset, empty and whitespace as 'not configured'", () => {
    for (const v of [undefined, null, "", "   ", ",,", "\n"]) {
      expect(parseFingerprints(v)).toEqual([]);
    }
  });
});

describe("rejecting what would never verify", () => {
  it("passes a well-formed fingerprint", () => {
    expect(invalidFingerprints([VALID])).toEqual([]);
  });

  it("catches the shapes people actually paste by mistake", () => {
    const bad = [
      "AB:CD:EF", // truncated
      VALID.replace(/:/g, ""), // colons stripped by a copy-paste
      VALID.slice(0, -3), // one byte short
      `${VALID}:00`, // one byte long
      "ZZ:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89:AB:CD:EF:01:23:45:67:89", // not hex
      "sha256:" + VALID, // pasted with its label
    ];
    expect(invalidFingerprints(bad)).toEqual(bad);
  });
});

describe("the published document", () => {
  it("has the shape Android looks for", () => {
    const doc = buildAssetLinks([VALID]);
    expect(doc).toEqual([
      {
        relation: ["delegate_permission/common.handle_all_urls"],
        target: {
          namespace: "android_app",
          package_name: "com.myinvestorcircle.app",
          sha256_cert_fingerprints: [VALID],
        },
      },
    ]);
  });

  it("names the same package the app is built as", () => {
    // A mismatch here verifies nothing while looking entirely correct.
    // mobile/app.json → expo.android.package
    const pkg = buildAssetLinks([VALID])[0].target.package_name;
    expect(pkg).toBe("com.myinvestorcircle.app");
  });

  it("carries every configured fingerprint", () => {
    const other = VALID.replace("AB", "CD");
    expect(buildAssetLinks([VALID, other])[0].target.sha256_cert_fingerprints).toEqual([VALID, other]);
  });
});
