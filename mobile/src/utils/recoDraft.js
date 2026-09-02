import { calcTargetDate, today } from "./format";

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
  const num = (v) => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };

  const priceAt = num(form.priceAt);
  const horizon = form.horizon || null;

  return {
    assetName: String(form.assetName || "").trim() || String(form.ticker || "").toUpperCase(),
    ticker: String(form.ticker || "").trim().toUpperCase(),
    assetClass: form.assetClass ?? null,
    sector: form.sector ?? null,
    // The server defaults exchange to NSE when absent; only send one we
    // actually got from the instrument master.
    ...(form.exchange ? { exchange: form.exchange } : {}),
    recType: form.recType || "Buy",
    priceAt,
    price: priceAt, // current == entry at creation time
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
 * Validate the form the way the screen should before submitting.
 * @returns an error string, or null when it is safe to post.
 */
export function validateRecoDraft(form = {}) {
  if (!String(form.assetName || "").trim() && !String(form.ticker || "").trim()) {
    return "Add an instrument name or ticker.";
  }
  for (const [key, label] of [
    ["priceAt", "Reco price"],
    ["targetPrice", "Target price"],
    ["stopLoss", "Stop loss"],
  ]) {
    const v = form[key];
    if (v !== "" && v !== null && v !== undefined && !Number.isFinite(Number(v))) {
      return `${label} must be a number.`;
    }
  }
  if (form.isPublic === false && !form.recipientCount) {
    return "Pick at least one person or Circle, or post publicly.";
  }
  return null;
}
