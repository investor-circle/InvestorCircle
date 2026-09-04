/**
 * Preparing parsed CAS holdings for import.
 *
 * api/cas.py already returns rows in the app's portfolio shape, so this is
 * not a re-mapping — it is the small amount of judgement that sits between
 * "parsed" and "saved": combining the two sections, discarding rows that
 * would be meaningless as holdings, and deciding what counts as a duplicate
 * of something already in the portfolio.
 *
 * Pure, so the import screen's behaviour is testable without a PDF.
 */

/** Identity used for duplicate detection, mirroring how the pricing job
 *  identifies a holding: ISIN when present (the reliable key for funds),
 *  otherwise the symbol. Case- and whitespace-insensitive. */
export function holdingKey(h) {
  const isin = String(h?.isin || "").trim().toUpperCase();
  if (isin) return `isin:${isin}`;
  const sym = String(h?.sym || "").trim().toUpperCase();
  return sym ? `sym:${sym}` : "";
}

/**
 * Flatten the parser's two sections into one list of importable holdings.
 *
 * Drops rows with no identity (nothing to price or display) and rows with no
 * units, which the CAS lists for closed positions — importing those would
 * silently add zero-value clutter to the portfolio.
 */
export function importableHoldings(parsed) {
  // Destructuring with a default would still throw on null (a default only
  // covers undefined), and a failed parse can hand us null.
  const { mf, equity } = parsed || {};
  const out = [];
  for (const h of [...(equity || []), ...(mf || [])]) {
    if (!h) continue;
    if (!holdingKey(h)) continue;
    const sh = Number(h.sh) || 0;
    if (sh <= 0) continue;
    out.push({
      ...h,
      sh,
      cost: Number(h.cost) || 0,
      price: Number(h.price) || Number(h.cost) || 0,
      type: h.type || "Stock",
      acct: h.acct || "cas",
      acctName: h.acctName || "CAS Import",
      source: "cas",
    });
  }
  return out;
}

/**
 * Split parsed holdings against what the portfolio already has.
 *
 * Import is additive: existing holdings are never overwritten or deleted,
 * because a CAS statement is a snapshot of one set of accounts and may not
 * cover everything the user has entered by hand. The web app offers a
 * replace mode as well; deliberately not mirrored here, since a destructive
 * bulk action on a phone with no undo is a poor trade.
 */
export function splitAgainstExisting(parsed, existing = []) {
  const have = new Set((existing || []).map(holdingKey).filter(Boolean));
  const toAdd = [];
  const duplicates = [];
  const seen = new Set();

  for (const h of parsed || []) {
    const key = holdingKey(h);
    // A statement can list the same scheme across two folios; collapse those
    // so the same holding isn't added twice in one import.
    if (seen.has(key)) {
      duplicates.push(h);
      continue;
    }
    seen.add(key);
    if (have.has(key)) duplicates.push(h);
    else toAdd.push(h);
  }
  return { toAdd, duplicates };
}

/** Total invested value of a set of holdings, for the import summary. */
export function importValue(holdings) {
  let total = 0;
  for (const h of holdings || []) {
    total += (Number(h?.sh) || 0) * (Number(h?.price) || Number(h?.cost) || 0);
  }
  return total;
}
