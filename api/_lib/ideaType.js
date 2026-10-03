/**
 * Publishing personas for a new idea.
 *
 *   verified_publisher  — Verified Research Publisher (SEBI verification
 *                         approved): Buy / Hold / Sell, with the professional
 *                         research fields (entry price, target, stop loss,
 *                         horizon, conviction).
 *   contributor         — everyone else, including a publisher whose
 *                         verification is pending or was rejected: a Market
 *                         View (Positive / Neutral / Negative) with commentary
 *                         and an editable disclosure, and NONE of the
 *                         recommendation-performance fields.
 *
 * recommendation_type holds either family. Market Views are deliberately NOT
 * recommendations: every performance / ICI aggregate must exclude them (see
 * MARKET_VIEW_TYPES usage in public-profile.js, lookups.js and
 * scripts/stamp-prices.js — the return maths elsewhere treats any type that
 * is not 'Sell' as a long position, so a Market View that leaked in would be
 * scored as a Buy).
 *
 * Mirrored client-side in src/constants/app.js and mobile/src/utils/ideaType.js;
 * ideaType.test.js asserts the three agree.
 */
import { REG_PUBLISHER, effectiveRegStatus } from './registrationStatus.js';

export const RECOMMENDATION_TYPES = ['Buy', 'Hold', 'Sell'];
export const MARKET_VIEW_TYPES = ['Positive', 'Neutral', 'Negative'];

export const MARKET_VIEW_MIN_COMMENTARY = 30;   // chars of text, excluding links/images
export const DISCLOSURE_MAX_CHARS = 600;
export const DEFAULT_MARKET_VIEW_DISCLOSURE =
  'This is my personal, independent market view, shared for information and discussion only. ' +
  'I am not presenting myself as a SEBI-registered Research Analyst, and this is not investment advice, ' +
  'a recommendation, or a solicitation to buy, sell or hold any security. ' +
  'myInvestorCircle does not provide, verify or endorse this view. Do your own research; investments are subject to market risks.';

// Fields that belong to a formal recommendation / its performance tracking.
const PROFESSIONAL_ONLY_FIELDS = [
  'priceAt', 'price', 'priceSource', 'targetPrice', 'stopLoss', 'horizon', 'targetDate', 'conviction',
];

export const isMarketViewType = (t) => MARKET_VIEW_TYPES.includes(t);

/** Persona from the stored category + verification outcome. Verified only if approved. */
export function publishingPersona(registrationStatus, sebiApprovalStatus) {
  const category = effectiveRegStatus(registrationStatus, sebiApprovalStatus);
  return category === REG_PUBLISHER && sebiApprovalStatus === 'approved' ? 'verified_publisher' : 'contributor';
}

/** Plain text of a stored thesis (plain string, or the {__v:'1',text,images} JSON form). */
export function commentaryText(thesis) {
  if (!thesis || thesis === '—') return '';
  let text = String(thesis);
  try {
    const p = JSON.parse(text);
    if (p && p.__v === '1') text = String(p.text || '');
  } catch { /* plain text */ }
  // [label](url) -> label, so a pasted link doesn't count as commentary
  return text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').trim();
}

/**
 * Apply the persona's rules to a create payload.
 * Returns { ok: true, reco, disclosure } with the payload normalised for storage,
 * or { ok: false, error, message } for a request the persona may not make.
 */
export function applyPublishingRules(input, persona) {
  const reco = { ...(input || {}) };
  const type = String(reco.recType || '').trim();

  if (persona === 'verified_publisher') {
    // Existing clients omit recType only by accident; default as before.
    const t = type || 'Buy';
    if (!RECOMMENDATION_TYPES.includes(t)) {
      return { ok: false, error: 'invalid_idea_type', message: 'Verified Research Publishers post Buy, Hold or Sell ideas.' };
    }
    return { ok: true, reco: { ...reco, recType: t }, disclosure: null };
  }

  // Contributor → Market View
  if (!MARKET_VIEW_TYPES.includes(type)) {
    return { ok: false, error: 'invalid_idea_type', message: 'Your view must be Positive, Neutral or Negative.' };
  }
  if (commentaryText(reco.thesis).length < MARKET_VIEW_MIN_COMMENTARY) {
    return { ok: false, error: 'commentary_required', message: `Add at least ${MARKET_VIEW_MIN_COMMENTARY} characters of commentary explaining your view.` };
  }
  const disclosure = String(reco.disclosure || '').trim();
  if (!disclosure) {
    return { ok: false, error: 'disclosure_required', message: 'A disclosure is required.' };
  }
  if (disclosure.length > DISCLOSURE_MAX_CHARS) {
    return { ok: false, error: 'disclosure_too_long', message: `Disclosure must be ${DISCLOSURE_MAX_CHARS} characters or fewer.` };
  }
  for (const f of PROFESSIONAL_ONLY_FIELDS) reco[f] = null;
  return { ok: true, reco: { ...reco, recType: type }, disclosure };
}
