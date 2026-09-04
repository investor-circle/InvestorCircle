#!/usr/bin/env node
/**
 * Publish /.well-known/assetlinks.json — Android App Links verification.
 *
 * WHY THIS MATTERS FOR SHARED LINKS:
 * The app declares an intent filter for https://myinvestorcircle.com with
 * `autoVerify: true` (mobile/app.json). Android only honours that if it can
 * fetch this file from the domain and find the app's package name next to the
 * SHA-256 fingerprint of the certificate the installed build was signed with.
 *
 * Without it, verification FAILS. On Android 12+ that means a shared idea link
 * does not open the app at all — it opens the browser, and the person has to
 * find "Open supported links" in system settings to change that. So every link
 * shared out of the app lands on the website even for people who have the app
 * installed, which is the opposite of what sharing from an app is for.
 *
 * WHY THIS IS GENERATED RATHER THAN CHECKED IN:
 * The fingerprint belongs to a signing key this repository does not (and must
 * not) contain. It comes from whoever signs the release:
 *
 *   • EAS-managed keystore:  `eas credentials` → Android → Keystore →
 *     "SHA256 Fingerprint"
 *   • Google Play App Signing (what Play-distributed installs are signed
 *     with, and therefore the one that actually matters once you ship on
 *     Play): Play Console → Test and release → Setup → App signing →
 *     "SHA-256 certificate fingerprint"
 *
 * Both can be listed at once — that is the normal setup while you distribute
 * an internal build AND a Play build, and it is why the variable is a list.
 *
 * Set ANDROID_SHA256_CERT_FINGERPRINTS (comma- or whitespace-separated) in the
 * deploy workflow's environment. When it is unset this writes NOTHING and says
 * so: an assetlinks.json carrying the wrong fingerprint is worse than none,
 * because it looks configured while still failing verification.
 */
import { mkdirSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const PACKAGE_NAME = "com.myinvestorcircle.app"; // must match mobile/app.json android.package
const OUT_DIR = join(process.cwd(), "dist", ".well-known");

// Android prints fingerprints as colon-separated uppercase hex, 32 bytes.
const FINGERPRINT_RE = /^([0-9A-F]{2}:){31}[0-9A-F]{2}$/;

export function parseFingerprints(raw) {
  return String(raw || "")
    .split(/[\s,]+/)
    .map((f) => f.trim().toUpperCase())
    .filter(Boolean);
}

export function invalidFingerprints(list) {
  return list.filter((f) => !FINGERPRINT_RE.test(f));
}

export function buildAssetLinks(fingerprints, packageName = PACKAGE_NAME) {
  return [
    {
      relation: ["delegate_permission/common.handle_all_urls"],
      target: {
        namespace: "android_app",
        package_name: packageName,
        sha256_cert_fingerprints: fingerprints,
      },
    },
  ];
}

function main() {
  const raw = process.env.ANDROID_SHA256_CERT_FINGERPRINTS;
  const fingerprints = parseFingerprints(raw);

  if (!fingerprints.length) {
    console.log(
      "[assetlinks] ANDROID_SHA256_CERT_FINGERPRINTS not set — skipping.\n" +
        "[assetlinks] Android App Links will NOT verify, so links shared from the\n" +
        "[assetlinks] app open the browser instead of the app. See the header of\n" +
        "[assetlinks] scripts/write-assetlinks.mjs for where to get the fingerprint."
    );
    return;
  }

  const bad = invalidFingerprints(fingerprints);
  if (bad.length) {
    // Fail the build rather than publish something that silently never
    // verifies — a typo here is invisible until someone taps a link.
    console.error(
      `[assetlinks] Not a SHA-256 certificate fingerprint: ${bad.join(", ")}\n` +
        "[assetlinks] Expected 32 colon-separated hex byte pairs, e.g. AB:CD:…:EF"
    );
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  writeFileSync(join(OUT_DIR, "assetlinks.json"), JSON.stringify(buildAssetLinks(fingerprints), null, 2) + "\n");
  console.log(`[assetlinks] Wrote dist/.well-known/assetlinks.json for ${fingerprints.length} fingerprint(s).`);
}

// Only run when invoked directly, so the helpers above stay testable.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
