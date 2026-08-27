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
