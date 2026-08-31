import { API_BASE } from "./api";

/**
 * Upload a CAS PDF to the same Vercel Python parser the web app uses
 * (api/cas.py) and get parsed holdings back.
 *
 * Mirrors src/services/cas.js in the web app. The server already returns
 * holdings in the app's portfolio shape
 * ({ id, sym, name, type, acct, acctName, sh, cost, price, isin }), so there
 * is no client-side mapping to duplicate — the difference on mobile is only
 * how the file gets picked up (a content:// URI from the document picker
 * rather than a browser File).
 *
 * Note this endpoint is deliberately unauthenticated and stateless on the
 * server side: it parses the PDF and returns the result without storing
 * anything. Saving the parsed holdings is a separate, authenticated call
 * (portfolio-add), exactly as on web.
 */

// CAS PDFs are emailed statements — a handful of MB at most. Rejecting an
// oversized file here gives a clear message instead of a long upload that
// fails at the server's own limit.
export const MAX_CAS_BYTES = 12 * 1024 * 1024;

// Parsing a large statement genuinely takes a while; well beyond the 15s the
// data API uses, but still bounded so a hung request doesn't spin forever.
const CAS_TIMEOUT_MS = 120000;

export async function parseCasPdf(file, password = "") {
  const form = new FormData();
  // React Native's FormData takes a {uri, name, type} descriptor rather than
  // a Blob; the native layer streams the file from that URI.
  form.append("file", {
    uri: file.uri,
    name: file.name || "cas.pdf",
    type: file.mimeType || "application/pdf",
  });
  form.append("password", String(password || "").trim());

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CAS_TIMEOUT_MS);

  let res;
  try {
    res = await fetch(`${API_BASE}/cas`, {
      method: "POST",
      body: form,
      // Content-Type is deliberately unset: RN fills in the multipart
      // boundary itself, and setting it by hand produces a body the server
      // cannot split.
      signal: controller.signal,
    });
  } catch (e) {
    if (e?.name === "AbortError") {
      throw new Error("That took too long to process. Try again, or import on the web app.");
    }
    throw new Error("Couldn't reach the import service. Check your connection and try again.");
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    let msg = `Server error ${res.status}`;
    try {
      const d = await res.json();
      if (d?.error) msg = d.error;
    } catch (_) {
      /* non-JSON error body */
    }
    throw new Error(msg);
  }

  const data = await res.json();
  if (!data.ok) throw new Error(data.error || "Couldn't read that statement.");

  return {
    mf: data.mf || [],
    equity: data.equity || [],
    investor: data.investor || {},
    warnings: data.warnings || [],
  };
}
