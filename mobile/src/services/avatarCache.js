import AsyncStorage from "@react-native-async-storage/async-storage";
import { callApi } from "./api";
import { addLog } from "../utils/logger";

/**
 * Avatars, fetched once per person and cached.
 *
 * WHY THIS EXISTS RATHER THAN JOINING avatar_url INTO THE LIST ENDPOINTS:
 * avatars are data: URIs stored on user_profiles (there is no blob storage),
 * so putting one on every feed row would add an image to each item of the
 * list that is already the slowest thing in the app. Instead:
 *
 *   1. Lists render immediately, with initials.
 *   2. After paint, the DISTINCT author ids are batched into one request.
 *   3. Results are cached in memory and in AsyncStorage, so the second launch
 *      draws pictures with no network at all.
 *
 * The net effect on the feed's critical path is zero: nothing here is
 * awaited before rendering, and a failure leaves initials in place.
 *
 * Every <Avatar> asks for its own person via requestAvatar(), so a screen
 * cannot forget to — calling primeAvatars() from a screen is still useful to
 * start the fetch before the rows mount, but it is no longer required.
 *
 * FRESHNESS: an entry is shown for up to TTL_MS but re-checked once it is
 * older than FRESH_MS. Before this, "has no picture" was trusted for a week,
 * so someone who uploaded a photo kept showing as initials on every phone
 * that had looked them up in the previous seven days. Re-checking a picture
 * we already hold is cheap: we send its md5 and the server only resends the
 * data: URI if the hash changed (lookups.js action=avatars-batch).
 */

const STORAGE_KEY = "mic_avatar_cache_v1";
// How long a cached answer may still be DISPLAYED (a stale picture beats
// initials while the re-check is in flight).
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
// How long a cached answer is trusted before it is re-checked.
const FRESH_MS = 5 * 60 * 1000;
// Matches MAX_AVATAR_BATCH on the server. Deliberately small: each avatar is
// a data: URI, so a large batch is a large response — several small requests
// in the background beat one multi-megabyte one.
const BATCH_LIMIT = 25;
// Ceiling on how many PICTURES are kept on disk (see forStorage below).
const MAX_STORED_PICTURES = 120;
// How long requestAvatar() waits to collect every avatar a render mounts
// into one batch, rather than one request per row.
const QUEUE_DELAY_MS = 50;

// uid -> { url, h?, at } | { url: null, at }  (null = "asked, has none": a
// negative result is worth caching too, or every list would re-ask on every
// render for the majority of users who have no picture. `h` is the server's
// md5 of the picture, used to re-check it without downloading it again.)
let cache = {};
let loaded = false;
let loadPromise = null;
const inFlight = new Set();
const listeners = new Set();
const queued = new Set();
let queueTimer = null;

function isFresh(entry, now) {
  return !!entry && now - entry.at < FRESH_MS;
}

function notify() {
  for (const fn of listeners) {
    try {
      fn();
    } catch (_) {
      /* a bad subscriber must not break the others */
    }
  }
}

/** Subscribe to cache changes. Returns an unsubscribe function. */
export function subscribeAvatars(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

async function ensureLoaded() {
  if (loaded) return;
  if (loadPromise) return loadPromise;
  loadPromise = AsyncStorage.getItem(STORAGE_KEY)
    .then((raw) => {
      if (raw) {
        const parsed = JSON.parse(raw);
        const now = Date.now();
        // Drop stale entries on read so the blob cannot grow forever. Never
        // let the disk copy replace a newer in-memory answer — e.g. the
        // signed-in user's own picture, seeded from their profile while this
        // read was still in flight.
        for (const [uid, entry] of Object.entries(parsed || {})) {
          if (!entry || now - entry.at >= TTL_MS) continue;
          if (!cache[uid] || cache[uid].at < entry.at) cache[uid] = entry;
        }
      }
    })
    .catch(() => {
      /* a corrupt cache is not an error — start empty */
    })
    .finally(() => {
      loaded = true;
      loadPromise = null;
      if (Object.keys(cache).length) notify();
    });
  return loadPromise;
}

let persistTimer = null;
function persistSoon() {
  if (persistTimer) clearTimeout(persistTimer);
  // Debounced: a feed can resolve several batches in quick succession and
  // writing on each one would thrash storage during the busiest moment.
  persistTimer = setTimeout(() => {
    AsyncStorage.setItem(STORAGE_KEY, JSON.stringify(forStorage())).catch(() => {});
  }, 1200);
}

/**
 * What actually gets written to disk.
 *
 * The in-memory cache can hold a picture for everyone the user has scrolled
 * past, and each one is a data: URI — AsyncStorage on Android has a modest
 * total budget, so an unbounded blob would eventually fail to write (or
 * evict something else). Keep the most recently seen pictures and let the
 * rest be re-fetched; entries with no picture cost almost nothing, so they
 * are all kept and continue to spare the network.
 */
function forStorage() {
  const withPicture = Object.entries(cache).filter(([, e]) => e && e.url);
  if (withPicture.length <= MAX_STORED_PICTURES) return cache;
  const keep = withPicture.sort((a, b) => b[1].at - a[1].at).slice(0, MAX_STORED_PICTURES);
  const out = {};
  for (const [uid, entry] of Object.entries(cache)) if (!entry?.url) out[uid] = entry;
  for (const [uid, entry] of keep) out[uid] = entry;
  return out;
}

/** The cached avatar URL for a uid, or null. Never triggers a fetch. */
export function cachedAvatar(uid) {
  if (!uid) return null;
  const entry = cache[String(uid)];
  if (!entry) return null;
  if (Date.now() - entry.at >= TTL_MS) return null;
  return entry.url || null;
}

/**
 * Ensure avatars for these uids are cached and fresh, fetching only the ones
 * that are missing or due a re-check. Fire-and-forget: never throws, never
 * blocks a render.
 */
export async function primeAvatars(uids) {
  const wanted = [...new Set((uids || []).map((u) => (u == null ? "" : String(u))).filter(Boolean))];
  if (!wanted.length) return;

  await ensureLoaded();

  const now = Date.now();
  const due = wanted.filter((uid) => !inFlight.has(uid) && !isFresh(cache[uid], now));
  if (!due.length) return;

  for (const uid of due) inFlight.add(uid);
  try {
    for (let i = 0; i < due.length; i += BATCH_LIMIT) {
      const slice = due.slice(i, i + BATCH_LIMIT);
      const known = {};
      for (const uid of slice) {
        const entry = cache[uid];
        if (entry?.url && entry.h) known[uid] = entry.h;
      }
      const body = { action: "avatars-batch", values: slice };
      if (Object.keys(known).length) body.known = known;
      const startedAt = Date.now();
      const api = await callApi("/data?resource=lookups", { method: "POST", body });
      // A failed response says nothing about who has a picture. Leaving those
      // uids UNKNOWN means the next screen retries; writing the negative cache
      // here instead would hide real pictures after a single blip.
      if (!api.ok) {
        addLog("warn", `avatars: batch rejected for ${slice.length} ids`);
        continue;
      }
      // Something newer than this request — e.g. the user's own upload via
      // setCachedAvatar while it was in flight — must not be overwritten by
      // the answer to a question asked before it.
      const supersededByLocal = (uid) => cache[uid] && cache[uid].at > startedAt;
      const at = Date.now();
      const rows = api.data.avatars || [];
      const found = new Set();
      for (const row of rows) {
        if (!row?.id) continue;
        const uid = String(row.id);
        found.add(uid);
        if (supersededByLocal(uid)) continue;
        if (row.avatar_url) {
          cache[uid] = { url: row.avatar_url, at, ...(row.avatar_hash ? { h: row.avatar_hash } : {}) };
        } else if (cache[uid]?.url && cache[uid].h === row.avatar_hash) {
          // Unchanged since we last downloaded it — just mark it fresh.
          cache[uid] = { ...cache[uid], at };
        }
        // Otherwise a hash-only answer we cannot match: leave it alone, and
        // it is re-fetched in full next time (it sends no `known` hash).
      }
      // Everyone asked for but not returned has no picture — cache that fact.
      for (const uid of slice) {
        if (!found.has(uid) && !supersededByLocal(uid)) cache[uid] = { url: null, at };
      }
      addLog("info", `avatars: checked ${slice.length}, ${rows.filter((r) => r?.avatar_url).length} downloaded`);
    }
    persistSoon();
    notify();
  } catch (e) {
    addLog("warn", `avatars: batch failed — ${e?.message}`);
  } finally {
    for (const uid of due) inFlight.delete(uid);
  }
}

function flushQueue() {
  queueTimer = null;
  const ids = [...queued];
  queued.clear();
  primeAvatars(ids);
}

/**
 * Ask for one person's picture — what <Avatar> calls on mount. Requests made
 * in the same render are collected into one batch. Cheap to call repeatedly:
 * a fresh entry or one already in flight is a no-op.
 */
export function requestAvatar(uid) {
  if (uid == null || uid === "") return;
  const id = String(uid);
  if (inFlight.has(id) || (loaded && isFresh(cache[id], Date.now()))) return;
  queued.add(id);
  if (!queueTimer) queueTimer = setTimeout(flushQueue, QUEUE_DELAY_MS);
}

/** Update one entry locally, e.g. right after the signed-in user uploads. */
export function setCachedAvatar(uid, url) {
  if (!uid) return;
  const id = String(uid);
  const prev = cache[id];
  const next = { url: url || null, at: Date.now() };
  // Same picture as before: keep its hash so the next re-check stays cheap.
  if (prev?.url && prev.url === next.url && prev.h) next.h = prev.h;
  cache[id] = next;
  persistSoon();
  notify();
}

/**
 * Forget every cached picture, on disk too. Called on sign-out: these are
 * other people's photos, fetched with the departing account's token, and on a
 * shared phone the next person to sign in must not inherit them.
 */
export async function clearAvatarCache() {
  cache = {};
  inFlight.clear();
  queued.clear();
  if (queueTimer) clearTimeout(queueTimer);
  queueTimer = null;
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = null;
  try {
    await AsyncStorage.removeItem(STORAGE_KEY);
  } catch (_) {
    /* nothing to do */
  }
  notify();
}

/** Test seam. */
export function _resetAvatarCache() {
  cache = {};
  loaded = false;
  loadPromise = null;
  inFlight.clear();
  listeners.clear();
  queued.clear();
  if (queueTimer) clearTimeout(queueTimer);
  queueTimer = null;
  if (persistTimer) clearTimeout(persistTimer);
}
