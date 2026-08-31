import { getInstrumentsList } from "./api/lookupsApi";

/**
 * Instrument master cache.
 *
 * Mirrors the web app's src/utils/instruments.js loadInstruments(): the
 * endpoint returns the whole active list in one call, so fetch once and
 * filter in memory (see src/utils/instruments.js searchInstruments). That
 * costs one request per app launch instead of one per keystroke, which
 * matters more on mobile data than on a desktop connection.
 *
 * Kept out of utils/ because it imports the service layer; the matching
 * logic it feeds stays pure and separately testable.
 */

let cache = null;
let loadPromise = null;

export async function loadInstruments() {
  if (cache) return cache;
  if (loadPromise) return loadPromise;
  loadPromise = getInstrumentsList()
    .then((rows) => {
      cache = Array.isArray(rows) ? rows : [];
      return cache;
    })
    .catch(() => {
      // Never cache a failure permanently — clear the in-flight promise so a
      // search that failed on a flaky connection can succeed next time.
      loadPromise = null;
      return [];
    });
  return loadPromise;
}

export function clearInstrumentCache() {
  cache = null;
  loadPromise = null;
}
