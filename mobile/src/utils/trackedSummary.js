/**
 * "My Tracked" — what happened to the ideas you're following.
 *
 * Ported from the web's TrackedSummaryWidget (features/discovery/Discovery.jsx).
 * The two modes answer DELIBERATELY DIFFERENT questions, and the web's own
 * comment records why: an earlier version computed an in/out-of-money delta
 * for "since yesterday", but "in the money" is anchored to the entry price
 * and therefore cumulative, so that delta was almost always zero and the two
 * tabs looked identical.
 *
 *   • Since tracking — is each idea above or below the price it was posted
 *     at? Cumulative, entry-anchored.
 *   • Since yesterday — did each stock close up or down against the previous
 *     trading day? Independent of entry price entirely.
 *
 * Ideas the daily snapshot doesn't cover are counted as `noData` rather than
 * guessed at, and a flat day counts there too: it is neither a gainer nor a
 * loser, and rounding it into one would overstate whichever side it landed on.
 *
 * Pure, so both counts can be tested without a screen or a network call.
 */

/**
 * Key for a price snapshot.
 *
 * Includes the ASSET CLASS because instrument identity is (symbol, class),
 * not symbol alone: an equity and an ETF can share a raw ticker string, and
 * keying on the symbol would silently let one instrument's daily move be
 * attributed to a completely different one. Byte-for-byte the same rule as
 * the web's priceKey() in src/db.js.
 */
export function priceKey(ticker, assetClass) {
  return `${String(ticker || "").trim().toUpperCase()}::${String(assetClass || "").trim().toUpperCase()}`;
}

/** getDailyPrices() rows → a (ticker, assetClass)-keyed lookup. */
export function byTicker(priceRows) {
  const map = {};
  (priceRows || []).forEach((row) => {
    map[priceKey(row.ticker, row.assetClass ?? row.asset_class)] = row;
  });
  return map;
}

/** The distinct tickers a tracked list needs prices for. */
export function trackedTickers(list) {
  return [
    ...new Set(
      (list || [])
        .map((r) => String(r?.ticker || "").trim().toUpperCase())
        .filter(Boolean)
    ),
  ].sort();
}

/**
 * @param list          tracked ideas, in the camelCase shape mapTrackedReco gives
 * @param dailyPrices   byTicker() map, or null when prices haven't loaded
 * @returns { total, inMoney, outMoney, up, down, noData, hasDaily }
 */
export function summariseTracked(list, dailyPrices) {
  const rows = list || [];
  const total = rows.length;

  // Since tracking: above or below the price the idea was posted at. An idea
  // with no entry price cannot be judged either way, so it counts as out
  // rather than silently inflating the winners — same as the web, which
  // derives outMoney as the remainder.
  const inMoney = rows.filter((r) => Number(r.priceAt) > 0 && Number(r.price) > Number(r.priceAt)).length;

  let up = 0;
  let down = 0;
  let noData = 0;
  if (dailyPrices) {
    for (const r of rows) {
      const pct = dailyPrices[priceKey(r.ticker, r.assetClass)]?.changePct;
      if (pct == null) noData++;
      else if (pct > 0) up++;
      else if (pct < 0) down++;
      else noData++; // flat — neither a gainer nor a loser
    }
  } else {
    noData = total;
  }

  return {
    total,
    inMoney,
    outMoney: total - inMoney,
    up,
    down,
    noData,
    hasDaily: !!dailyPrices,
  };
}

/**
 * The biggest daily movers among tracked ideas, largest absolute move first.
 * Ideas with no snapshot are dropped rather than sorted as zero, which would
 * park them in the middle of the list as though they hadn't moved.
 */
export function topMovers(list, dailyPrices, limit = 3) {
  if (!dailyPrices) return [];
  return (list || [])
    .map((r) => ({ reco: r, changePct: dailyPrices[priceKey(r.ticker, r.assetClass)]?.changePct }))
    .filter((x) => x.changePct != null && x.changePct !== 0)
    .sort((a, b) => Math.abs(b.changePct) - Math.abs(a.changePct))
    .slice(0, limit);
}

/**
 * The API's snake_case tracked row → the camelCase shape this file and the
 * cards expect. Mirrors the web's own reshape, which exists because the
 * "View all tracked" page consumes the raw rows as-is.
 */
export function mapTrackedReco(r) {
  return {
    id: r.id,
    assetName: r.asset_name,
    ticker: r.ticker,
    assetClass: r.asset_class,
    priceAt: Number(r.reco_price || 0),
    price: Number(r.current_price || 0),
    date: r.created_at ? String(r.created_at).slice(0, 10) : null,
    exitSignal: r.exit_signal,
    exitPrice: r.exit_price ? Number(r.exit_price) : null,
    commentCount: Number(r.comment_count || 0),
    from: r.recommender_id,
    from_username: r.recommender_username,
    byName: r.recommender_name,
    invested: r.is_invested,
  };
}
