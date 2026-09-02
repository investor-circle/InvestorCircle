import AsyncStorage from "@react-native-async-storage/async-storage";

/**
 * Last-known feed, kept across launches so a cold start paints instantly.
 *
 * Before this, every launch showed a spinner until the first endpoint came
 * back — on a slow connection that is several seconds of blank screen even
 * though the ideas shown are almost always the same ones as last time. Now
 * the previous list is drawn from disk (no network at all), and the live load
 * carries on in the background and replaces it when it resolves.
 *
 * Rules that keep this safe rather than "stale data forever":
 *
 *  - The cache is only ever used for the FIRST paint. The real load is
 *    already running by then and overwrites it; it is never a substitute
 *    for fetching.
 *  - It expires (MAX_AGE_MS), so a long-dormant app doesn't open on ideas
 *    from weeks ago even for the second it takes to refresh.
 *  - It is keyed per user id, so signing in as someone else never shows the
 *    previous account's feed.
 *  - Only MAX_ITEMS are kept: the first screenful is what makes the app feel
 *    instant, and storing hundreds of theses would make the read itself slow.
 */

const KEY_PREFIX = "mic_feed_cache_v1:";
const MAX_ITEMS = 30;
const MAX_AGE_MS = 24 * 60 * 60 * 1000;

const keyFor = (uid) => `${KEY_PREFIX}${uid || "anon"}`;

/** The cached feed for this user, or null. Never throws. */
export async function readFeedCache(uid) {
  if (!uid) return null;
  try {
    const raw = await AsyncStorage.getItem(keyFor(uid));
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || !Array.isArray(parsed.items)) return null;
    if (Date.now() - (parsed.at || 0) > MAX_AGE_MS) return null;
    return parsed.items;
  } catch (_) {
    // A corrupt or unreadable cache is not an error — just load normally.
    return null;
  }
}

/** Replace the cached feed. Fire-and-forget; never throws. */
export async function writeFeedCache(uid, items) {
  if (!uid || !Array.isArray(items)) return;
  try {
    const trimmed = items.slice(0, MAX_ITEMS);
    await AsyncStorage.setItem(keyFor(uid), JSON.stringify({ at: Date.now(), items: trimmed }));
  } catch (_) {
    /* out of space / unavailable — the app works without it */
  }
}

/** Drop this user's cached feed (sign-out). */
export async function clearFeedCache(uid) {
  try {
    await AsyncStorage.removeItem(keyFor(uid));
  } catch (_) {
    /* nothing to do */
  }
}
