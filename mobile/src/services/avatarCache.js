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
 */

const STORAGE_KEY = "mic_avatar_cache_v1";
// A picture only changes when its owner replaces it, which is rare — but the
// cache must not be permanent or a changed picture would never appear.
const TTL_MS = 7 * 24 * 60 * 60 * 1000;
// Matches MAX_AVATAR_BATCH on the server. Deliberately small: each avatar is
// a data: URI, so a large batch is a large response — several small requests
// in the background beat one multi-megabyte one.
const BATCH_LIMIT = 25;
// Ceiling on how many PICTURES are kept on disk (see forStorage below).
const MAX_STORED_PICTURES = 120;

// uid -> { url, at } | { url: null, at }  (null = "asked, has none": a
// negative result is worth caching too, or every list would re-ask forever
// for the majority of users who have no picture.)
let cache = {};
let loaded = false;
let loadPromise = null;
const inFlight = new Set();
const listeners = new Set();

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
        // Drop stale entries on read so the blob cannot grow forever.
        for (const [uid, entry] of Object.entries(parsed || {})) {
          if (entry && now - entry.at < TTL_MS) cache[uid] = entry;
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
 * Ensure avatars for these uids are cached, fetching only the ones that are
 * missing. Fire-and-forget: never throws, never blocks a render.
 */
export async function primeAvatars(uids) {
  const wanted = [...new Set((uids || []).map((u) => (u == null ? "" : String(u))).filter(Boolean))];
  if (!wanted.length) return;

  await ensureLoaded();

  const now = Date.now();
  const missing = wanted.filter((uid) => {
    if (inFlight.has(uid)) return false;
    const entry = cache[uid];
    return !entry || now - entry.at >= TTL_MS;
  });
  if (!missing.length) return;

  for (const uid of missing) inFlight.add(uid);
  try {
    for (let i = 0; i < missing.length; i += BATCH_LIMIT) {
      const slice = missing.slice(i, i + BATCH_LIMIT);
      const api = await callApi("/data?resource=lookups", {
        method: "POST",
        body: { action: "avatars-batch", values: slice },
      });
      // A failed response says nothing about who has a picture. Leaving those
      // uids UNKNOWN means the next screen retries; writing the negative cache
      // here instead would hide real pictures for the whole TTL after a single
      // blip.
      if (!api.ok) {
        addLog("warn", `avatars: batch rejected for ${slice.length} ids`);
        continue;
      }
      const rows = api.data.avatars || [];
      const found = new Set();
      for (const row of rows) {
        if (!row?.id) continue;
        found.add(String(row.id));
        cache[String(row.id)] = { url: row.avatar_url || null, at: Date.now() };
      }
      // Everyone asked for but not returned has no picture — cache that fact.
      for (const uid of slice) {
        if (!found.has(uid)) cache[uid] = { url: null, at: Date.now() };
      }
      addLog("info", `avatars: fetched ${rows.length}/${slice.length}`);
    }
    persistSoon();
    notify();
  } catch (e) {
    addLog("warn", `avatars: batch failed — ${e?.message}`);
  } finally {
    for (const uid of missing) inFlight.delete(uid);
  }
}

/** Update one entry locally, e.g. right after the signed-in user uploads. */
export function setCachedAvatar(uid, url) {
  if (!uid) return;
  cache[String(uid)] = { url: url || null, at: Date.now() };
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
  if (persistTimer) clearTimeout(persistTimer);
}
