import { trackReco, untrackReco } from "./api/engagementApi";

/**
 * "Have I tracked this?" for every idea currently on screen — the track-icon
 * counterpart of reactionStore.js's like state, same module-level-store
 * reasoning: the same idea appears in Feed, Pulse and Track, and tracking it
 * from one card must not leave the others showing the old state.
 *
 * Screens that already fetch the caller's full tracked-id list for their own
 * purposes (Feed's ranking, Pulse's "My Tracked" widget) call seedTracked()
 * with that result instead of this store making a second request — the
 * server has no endpoint to check a handful of ids, only "give me all of
 * them", so there is nothing to gain from fetching it twice.
 */

const known = new Map(); // recoId -> true | false
const listeners = new Set();
let allTrackedSet = null; // Set of every tracked id, once a caller has supplied it

function emit() {
  listeners.forEach((fn) => fn());
}

export function subscribeTracked(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Synchronous read for useSyncExternalStore. undefined = not yet known. */
export function isTracked(recoId) {
  if (recoId == null) return undefined;
  return known.get(String(recoId));
}

/** Seed from an already-fetched full list of tracked ids (see module doc). */
export function seedTracked(allTrackedIds, recoIds) {
  allTrackedSet = new Set((allTrackedIds || []).map(String));
  let changed = false;
  (recoIds || []).forEach((id) => {
    if (id == null) return;
    const key = String(id);
    const v = allTrackedSet.has(key);
    if (known.get(key) !== v) {
      known.set(key, v);
      changed = true;
    }
  });
  if (changed) emit();
}

/** Record a track state written elsewhere (e.g. the detail screen's own Track button). */
export function setTracked(recoId, value) {
  if (recoId == null) return;
  const id = String(recoId);
  if (allTrackedSet) {
    if (value) allTrackedSet.add(id);
    else allTrackedSet.delete(id);
  }
  if (known.get(id) === !!value) return;
  known.set(id, !!value);
  emit();
}

/** Track or untrack, optimistically — reverts if the write fails. */
export async function toggleTracked(recoId) {
  const id = String(recoId);
  const before = known.get(id) === true;
  const next = !before;
  setTracked(id, next);
  const ok = next ? await trackReco(id) : await untrackReco(id);
  if (!ok) {
    setTracked(id, before);
    return before;
  }
  return next;
}

/** Sign-out: the next account must not inherit this one's tracked state. */
export function clearTracked() {
  known.clear();
  allTrackedSet = null;
  emit();
}

export function _resetTrackStore() {
  known.clear();
  allTrackedSet = null;
  listeners.clear();
}
