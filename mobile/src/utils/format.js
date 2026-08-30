// Small display-formatting helpers, mirroring the pure (non-React) parts of
// src/utils/format.js in the web app. Kept as a light duplicate rather than
// importing across the web/mobile package boundary — Metro's default
// projectRoot resolution doesn't reach outside mobile/ without extra
// watchFolders wiring, and these are presentation-only, not business logic
// (ICI/PnL/return calculations stay server- or web-side, untouched).
const CURRENCY_SYM = { INR: "₹", USD: "$" };

export const fmt = (n, cur = "INR") => (CURRENCY_SYM[cur] || cur) + Math.round(n).toLocaleString("en-IN");

export const fmtPct = (p) => (p >= 0 ? "+" : "") + (p * 100).toFixed(1) + "%";

// Robust date formatter — handles Date objects, bare "YYYY-MM-DD", and full
// ISO timestamps without throwing (see CLAUDE.md incident note on
// calcTargetDate: never assume one caller's date shape for a shared helper).
export const fmtDate = (d) => {
  if (!d) return "—";
  const dt =
    d instanceof Date
      ? d
      : typeof d === "string" && d.length === 10
      ? new Date(d + "T00:00:00")
      : new Date(d);
  return isNaN(dt) ? "—" : dt.toLocaleDateString("en-IN", { month: "short", day: "numeric", year: "numeric" });
};

// Feed ranking — ported verbatim from src/utils/format.js (scoreFeedRec) so
// the mobile Feed orders ideas identically to the web Feed tab. Pure function,
// no JSX; keep in sync with the web copy if that one changes.
export function scoreFeedRec(r, tracked, cfg, contactIds) {
  const src = r.feedSource;
  let score =
    !src || src === "direct" ? 10 : src === "group" ? 8 : src === "network_engagement" ? 8 : 5; // public

  const recommenderId = r.from || r.from_id || r.recommender_id;
  if (contactIds && recommenderId && contactIds.has(recommenderId)) score += 15;

  const daysSince = (Date.now() - new Date(r.date)) / 86400000;
  score += Math.max(0, 100 - daysSince * 3.5);

  score += (r.likes || 0) * 8;
  score += (r.commentCount || 0) * 5;

  if (cfg.rank_price_movement && r.priceAt > 0) {
    const absRet = Math.abs((r.price - r.priceAt) / r.priceAt);
    if (absRet > 0.05) score += Math.min(40, absRet * 200);
  }

  if (cfg.rank_untracked_first && (tracked.has(r.id) || r.invested)) score -= 20;

  return score;
}

export const initialsOf = (name) =>
  (name || "?")
    .split(" ")
    .map((w) => w[0])
    .join("")
    .slice(0, 2)
    .toUpperCase();

/** Return % for a reco card — Sell recos invert direction (see CLAUDE.md 5a). */
export const returnPct = (r) => {
  const entry = r.priceAt;
  const current = r.exitPrice ?? r.price ?? entry;
  if (!entry) return 0;
  const raw = (current - entry) / entry;
  return r.recType === "Sell" ? -raw : raw;
};
