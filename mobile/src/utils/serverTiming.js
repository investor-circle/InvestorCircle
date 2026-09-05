/**
 * Reading the server's own account of where a request's time went.
 *
 * The server reports a standard `Server-Timing` header (api/_lib/timing.js):
 *
 *   auth;dur=412, db;dur=1980, total;dur=2402, cold;dur=1
 *
 * On its own the client only knows a call took 4.6 seconds. Combined with
 * this it knows how much of that the server was responsible for, and the
 * remainder — wall time minus the server's total — is network plus platform
 * cold start. That subtraction is the whole point: it is the one number
 * neither side can measure alone, and it decides whether the fix is a
 * database plan, a region change, or nothing at all.
 *
 * `cold` is carried as a phase with a 0/1 duration because Server-Timing has
 * no boolean; it means "this instance had not served a request before".
 */

/** Parse the header off a fetch Response. Returns null when absent. */
export function parseServerTiming(res) {
  let raw = null;
  try {
    raw = res?.headers?.get?.("Server-Timing") ?? null;
  } catch (_) {
    return null; // a header a platform declines to expose is not an error
  }
  if (!raw) return null;

  const out = {};
  for (const entry of String(raw).split(",")) {
    // "name;dur=123" — anything else is ignored rather than guessed at.
    const [name, ...params] = entry.trim().split(";");
    const key = String(name || "").trim();
    if (!key) continue;
    for (const p of params) {
      const m = /^\s*dur\s*=\s*([0-9.]+)\s*$/.exec(p);
      if (m) {
        const n = Number(m[1]);
        if (Number.isFinite(n)) out[key] = n;
      }
    }
  }
  return Object.keys(out).length ? out : null;
}

/**
 * A one-line attribution for the log.
 *
 * `network` is deliberately floored at zero: the two clocks are different
 * machines, so a fast call can produce a small negative that means nothing
 * except that the measurement is not precise at that scale.
 */
export function describeServerTiming(timing, wallMs) {
  if (!timing) return "";
  const parts = [];
  if (timing.auth != null) parts.push(`auth=${Math.round(timing.auth)}ms`);
  if (timing.db != null) parts.push(`db=${Math.round(timing.db)}ms`);
  if (timing.total != null) {
    parts.push(`server=${Math.round(timing.total)}ms`);
    if (Number.isFinite(wallMs)) {
      parts.push(`network+platform=${Math.max(0, Math.round(wallMs - timing.total))}ms`);
    }
  }
  if (timing.cold) parts.push("COLD START");
  return parts.join(" ");
}
