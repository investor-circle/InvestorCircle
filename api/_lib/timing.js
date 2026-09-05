/**
 * Per-request phase timing, reported as a standard `Server-Timing` header.
 *
 * WHY: the mobile app's diagnostics showed EVERY endpoint taking 2.5-3.6s,
 * including `feed-config`, which is two trivial lookups against tiny tables.
 * That rules out query cost as the explanation and points at a fixed
 * per-request overhead — but "overhead" covers at least four different
 * things, each with a different (and differently expensive) fix:
 *
 *   - Vercel cold start          → keep the function warm, or accept it
 *   - Firebase token verification → cert fetch on a cold instance
 *   - Neon compute cold start     → a paid Neon plan / longer autosuspend
 *   - network round-trip          → region placement, nothing else
 *
 * Guessing between those means possibly paying for the wrong one. This
 * splits them: the server reports how long it spent on auth and on
 * everything else, and whether the instance was cold; the client already
 * measures total wall time (src/services/api.js). Client total minus server
 * total is network plus platform cold start; the rest is attributed here.
 *
 * AsyncLocalStorage rather than a module-level counter: a Node serverless
 * instance can serve overlapping requests, and a shared accumulator would
 * bill one request's database time to another — producing exactly the kind
 * of confidently-wrong number this exists to avoid.
 */
import { AsyncLocalStorage } from 'node:async_hooks';

const store = new AsyncLocalStorage();

// True until the first request this instance serves finishes. A cold start
// is the difference between "the platform was asleep" and "our code is
// slow", and the two are indistinguishable from the client side.
let instanceCold = true;

/** Run `fn` with a fresh timing context. */
export function withTiming(fn) {
  const ctx = { t0: Date.now(), phases: new Map(), cold: instanceCold };
  instanceCold = false;
  return store.run(ctx, fn);
}

/** Add `ms` to a named phase. Safe to call outside a timing context. */
export function addPhase(name, ms) {
  const ctx = store.getStore();
  if (!ctx) return;
  ctx.phases.set(name, (ctx.phases.get(name) || 0) + ms);
}

/** Time an awaited operation and record it under `name`. Never swallows. */
export async function timePhase(name, fn) {
  const started = Date.now();
  try {
    return await fn();
  } finally {
    addPhase(name, Date.now() - started);
  }
}

/**
 * The Server-Timing value for the current request, or null when there is no
 * timing context (so a caller can skip the header rather than emit a
 * misleading one).
 *
 * Durations are whole milliseconds: this is for telling 30ms from 3000ms,
 * and sub-millisecond precision would only imply an accuracy that a
 * serverless platform under variable load does not have.
 */
export function serverTimingHeader() {
  const ctx = store.getStore();
  if (!ctx) return null;
  const parts = [];
  for (const [name, ms] of ctx.phases) parts.push(`${name};dur=${Math.round(ms)}`);
  parts.push(`total;dur=${Math.round(Date.now() - ctx.t0)}`);
  // Reported as a phase rather than a separate header so one line carries
  // the whole picture: a 3s total with cold=1 is a different bug report
  // from a 3s total on a warm instance.
  parts.push(`cold;dur=${ctx.cold ? 1 : 0}`);
  return parts.join(', ');
}

/** Test seam — resets the module's cold-start latch. */
export function _resetColdForTest() {
  instanceCold = true;
}
