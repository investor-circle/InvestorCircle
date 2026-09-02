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

/**
 * Horizons the app understands. These exact four strings are what
 * calcTargetDate below recognises, so the create form must offer these and
 * not free text — mobile previously took a typed horizon, and anything
 * outside this set (its own placeholder said "12M", not "12m") produced no
 * target date at all, leaving the idea with no expiry.
 * Web: HORIZONS in src/constants/app.js.
 */
export const HORIZONS = ["<3m", "6m", "12m", ">2Y"];

/** Conviction levels the web's create form offers. */
export const CONVICTIONS = ["Low", "Medium", "High"];

/** Today as YYYY-MM-DD, matching the web's TODAY constant. */
export const today = () => new Date().toISOString().slice(0, 10);

// ── Verbatim port of calcTargetDate/getTargetDate/isExpired from the web's
// src/utils/format.js. An idea's expiry drives its Active/Expired status, so
// mobile must compute the identical date from the same inputs.
export const calcTargetDate = (date, horizon) => {
  if (!date || !horizon) return null;
  // `date` is a bare "YYYY-MM-DD" from most sources (e.g. mapReceivedRow),
  // but some (public-feed/network-engagement rows select created_at AS
  // date directly — see api/_lib/handlers/lookups.js) hand over a full ISO
  // timestamp instead. Concatenating "T00:00:00" onto a timestamp produces
  // a malformed string ("...Z T00:00:00"), which parses to an Invalid
  // Date — and toISOString() on an Invalid Date THROWS ("Invalid time
  // value"), not returns null. Slicing to the date portion first makes
  // this robust to either input shape.
  const d = new Date(String(date).slice(0, 10) + "T00:00:00");
  if (isNaN(d)) return null;
  if (horizon==="<3m") d.setMonth(d.getMonth()+3);
  else if (horizon==="6m")  d.setMonth(d.getMonth()+6);
  else if (horizon==="12m") d.setMonth(d.getMonth()+12);
  else if (horizon===">2Y") d.setFullYear(d.getFullYear()+2);
  else return null;
  return d.toISOString().slice(0,10);
};

export const getTargetDate = (r) => r.targetDate || calcTargetDate(r.date, r.horizon) || null;

export const isExpired = (r) => {
  const td = getTargetDate(r);
  return td ? td < today() : false;
};
