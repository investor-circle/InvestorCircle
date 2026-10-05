import { calcTargetDate, today } from "./format";
import {
  MARKET_VIEW_TYPES,
  MARKET_VIEW_MIN_COMMENTARY,
  DISCLOSURE_MAX_CHARS,
  commentaryText,
} from "./ideaType";

/**
 * Turn the new-idea form into the payload the create endpoint stores.
 *
 * This lives here, not inline in app/new.js, because the create payload is
 * where mobile and web most easily drift apart: the server accepts a field,
 * the web form sets it, and mobile simply never sends it — silently, because
 * a missing optional field is not an error anywhere. That is exactly what
 * happened with conviction, stop loss and target date. Mobile displayed all
 * three on cards while being unable to set any of them, and an idea created
 * on the phone carried no target date at all, so it could never become
 * Expired.
 *
 * Keeping it as one pure function means the full field set can be asserted
 * directly (see recoDraft.test.js) instead of hoping a screen still happens
 * to build it correctly.
 */
export function buildRecoPayload(form = {}) {
  // A Market View (persona "contributor") carries none of the recommendation
  // framing: no entry price, target, stop loss, horizon, target date or
  // conviction — and an editable disclosure. The server nulls those fields for
  // a contributor regardless; omitting them here keeps the two aligned.
  // Anything but an explicit "contributor" is the original recommendation flow.
  if (form.persona === "contributor") {
    return {
      assetName: String(form.assetName || "").trim() || String(form.ticker || "").toUpperCase(),
      ticker: String(form.ticker || "").trim().toUpperCase(),
      assetClass: form.assetClass ?? null,
      sector: form.sector ?? null,
      currency: form.currency || "INR",
      ...(form.exchange ? { exchange: form.exchange } : {}),
      recType: form.recType || "",
      thesis: String(form.thesis || "").trim() || null,
      disclosure: String(form.disclosure || "").trim(),
      isPublic: form.isPublic !== false,
    };
  }

  const num = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  // Entry price is never typed — it is auto-stamped from the previous close
  // the moment an instrument is picked (see app/new.js), same as web.
  const priceAt = num(form.priceAt);
  const horizon = form.horizon || null;

  return {
    assetName: String(form.assetName || "").trim() || String(form.ticker || "").toUpperCase(),
    ticker: String(form.ticker || "").trim().toUpperCase(),
    assetClass: form.assetClass ?? null,
    sector: form.sector ?? null,
    currency: form.currency || "INR",
    // The server defaults exchange to NSE when absent; only send one we
    // actually got from the instrument master.
    ...(form.exchange ? { exchange: form.exchange } : {}),
    recType: form.recType || "Buy",
    priceAt,
    price: priceAt, // current == entry at creation time
    priceSource: form.priceSource || null,
    targetPrice: num(form.targetPrice),
    stopLoss: num(form.stopLoss),
    horizon,
    // Same helper the web uses, from the same date basis: the target date is
    // what makes an idea Active vs Expired.
    targetDate: calcTargetDate(today(), horizon),
    conviction: form.conviction || null,
    thesis: String(form.thesis || "").trim() || null,
    isPublic: form.isPublic !== false,
  };
}

/**
 * Validate the form the way the screen should before submitting. Mirrors the
 * web's `valid` check in MakeRecoModal (Recommendations.jsx): an entry price
 * is required UNLESS the auto-stamp genuinely failed (priceError present),
 * in which case the web still lets the post through — the nightly batch
 * fills it in later — so mobile must not block on it either.
 * @returns an error string, or null when it is safe to post.
 */
export function validateRecoDraft(form = {}) {
  if (!String(form.assetName || "").trim() && !String(form.ticker || "").trim()) {
    return "Add an instrument name or ticker.";
  }
  if (form.persona === "contributor") {
    if (!MARKET_VIEW_TYPES.includes(form.recType)) return "Choose Positive, Neutral or Negative.";
    if (commentaryText(form.thesis).length < MARKET_VIEW_MIN_COMMENTARY) {
      return `Add at least ${MARKET_VIEW_MIN_COMMENTARY} characters of commentary explaining your view.`;
    }
    const disclosure = String(form.disclosure || "").trim();
    if (!disclosure) return "A disclosure is required.";
    if (disclosure.length > DISCLOSURE_MAX_CHARS) return `Disclosure must be ${DISCLOSURE_MAX_CHARS} characters or fewer.`;
    if (form.isPublic === false && !form.recipientCount) {
      return "Pick at least one person or Circle, or post publicly.";
    }
    return null;
  }
  for (const [key, label] of [
    ["targetPrice", "Target price"],
    ["stopLoss", "Stop loss"],
  ]) {
    const v = form[key];
    if (v !== "" && v !== null && v !== undefined && !Number.isFinite(Number(v))) {
      return `${label} must be a number.`;
    }
  }
  if (!(Number(form.priceAt) > 0) && !form.priceError) {
    return "Waiting on entry price — pick an instrument, or try again.";
  }
  if (form.isPublic === false && !form.recipientCount) {
    return "Pick at least one person or Circle, or post publicly.";
  }
  return null;
}
