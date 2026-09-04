/**
 * Startup timeline and per-endpoint request stats.
 *
 * WHY: the log said what happened but never how long anything took, so the
 * three failure modes that actually get reported from a phone — "it hangs on
 * the splash screen", "this screen spins forever", "the app is slow" — all
 * looked identical in the diagnostics: a list of events with no durations.
 *
 * Two things are recorded:
 *
 *  - a startup timeline (mark), so a launch that stalls says WHICH phase it
 *    stalled in — JS loaded, fonts, auth resolved, first screen — rather than
 *    just failing to arrive.
 *  - per-endpoint request stats (recordRequest), so "slow" can be answered
 *    with which call, how often, and how slow, instead of a guess.
 *
 * Pure and dependency-free apart from the logger, so it can be tested without
 * a device and can never itself be the reason the app fails to start.
 */
import { addLog } from "./logger";

// A call slower than this is worth a line in the log on its own. Chosen to sit
// well above a normal round-trip to the API (a few hundred ms) but well below
// the 15s request timeout, so it flags "the user is staring at a spinner"
// rather than only outright failures.
export const SLOW_REQUEST_MS = 2500;

// Long enough that an ordinary slow network does not trip it, short enough to
// still be within the span of someone deciding the app is broken.
export const STALL_WARN_MS = 8000;

const startedAt = Date.now();
let marks = [];
let stats = new Map();

/**
 * Note that a startup phase completed, with ms since the JS bundle began
 * executing. Cheap enough to call unconditionally.
 */
export function mark(name) {
  const at = Date.now() - startedAt;
  marks.push({ name, at });
  addLog("info", `perf: ${name} +${at}ms`);
  return at;
}

export function getMarks() {
  return marks.slice();
}

/** Milliseconds since the JS bundle started executing. */
export function sinceStart() {
  return Date.now() - startedAt;
}

/**
 * Record one completed request.
 *
 * Endpoints are keyed by path with query values stripped: `?resource=groups&
 * action=by-slug&slug=abc` and the same call for a different slug are the same
 * endpoint, and keeping them apart would produce a stats table with one row
 * per request and no aggregate worth reading.
 */
export function endpointKey(path) {
  const [base, query = ""] = String(path || "").split("?");
  const keep = query
    .split("&")
    .filter((p) => /^(resource|action)=/.test(p))
    .join("&");
  return keep ? `${base}?${keep}` : base;
}

export function recordRequest(path, ms, ok) {
  const key = endpointKey(path);
  const s = stats.get(key) || { key, calls: 0, failures: 0, totalMs: 0, maxMs: 0 };
  s.calls += 1;
  if (!ok) s.failures += 1;
  s.totalMs += ms;
  if (ms > s.maxMs) s.maxMs = ms;
  stats.set(key, s);
  return s;
}

/** Slowest first — the order someone debugging actually wants to read. */
export function getRequestStats() {
  return [...stats.values()]
    .map((s) => ({ ...s, avgMs: Math.round(s.totalMs / Math.max(1, s.calls)) }))
    .sort((a, b) => b.maxMs - a.maxMs);
}

export function formatRequestStats() {
  const rows = getRequestStats();
  if (!rows.length) return "(no requests yet)";
  return rows
    .map((s) => `${s.calls}× avg ${s.avgMs}ms max ${s.maxMs}ms${s.failures ? ` — ${s.failures} failed` : ""}  ${s.key}`)
    .join("\n");
}

export function resetPerf() {
  marks = [];
  stats = new Map();
}
