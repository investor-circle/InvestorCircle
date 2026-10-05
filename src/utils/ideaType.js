/**
 * Idea types and publishing personas (web).
 *
 * An idea is either a RECOMMENDATION (Buy / Hold / Sell — a Verified Research
 * Publisher's professional call, tracked for performance) or a MARKET VIEW
 * (Positive / Neutral / Negative — an Independent Market Contributor's
 * commentary, never tracked for performance). Both live in
 * recommendation_type; everything that scores, ranks or aggregates returns or
 * consensus must go through isMarketView()/isRecommendation() so a Market View
 * can't be counted as a Buy. (The legacy return maths treats any type that is
 * not 'Sell' as long.)
 *
 * Mirrors api/_lib/ideaType.js (authoritative: the server enforces it) and
 * mobile/src/utils/ideaType.js; ideaType.test.js keeps the copies aligned.
 */
import { REG_PUBLISHER, effectiveRegStatus } from '../constants/app';

export const RECOMMENDATION_TYPES = ['Buy', 'Hold', 'Sell'];
export const MARKET_VIEW_TYPES = ['Positive', 'Neutral', 'Negative'];

export const MARKET_VIEW_MIN_COMMENTARY = 30;
export const DISCLOSURE_MAX_CHARS = 600;
export const DEFAULT_MARKET_VIEW_DISCLOSURE =
  'This is my personal, independent market view, shared for information and discussion only. ' +
  'I am not presenting myself as a SEBI-registered Research Analyst, and this is not investment advice, ' +
  'a recommendation, or a solicitation to buy, sell or hold any security. ' +
  'myInvestorCircle does not provide, verify or endorse this view. Do your own research; investments are subject to market risks.';

/** Market View (Positive/Neutral/Negative)? Accepts a type string. */
export const isMarketView = (t) => MARKET_VIEW_TYPES.includes(t);

/** The idea's type from either row shape (snake_case DB row or camelCase client object). */
export const ideaTypeOf = (r) => (r && (r.recommendation_type || r.recType)) || 'Buy';

/** True when the idea (either row shape) is a Market View. */
export const isMarketViewIdea = (r) => isMarketView(ideaTypeOf(r));

/** Keep only professional recommendations — for consensus / performance inputs. */
export const onlyRecommendations = (rows = []) => rows.filter((r) => !isMarketViewIdea(r));

/** Label + colour token for a type badge. Unknown / missing → Buy (legacy default). */
export function ideaTypeMeta(t) {
  switch (t) {
    case 'Sell':     return { label: 'Sell',     tone: 'loss' };
    case 'Hold':     return { label: 'Hold',     tone: 'muted' };
    case 'Positive': return { label: 'Positive', tone: 'gain' };
    case 'Neutral':  return { label: 'Neutral',  tone: 'muted' };
    case 'Negative': return { label: 'Negative', tone: 'loss' };
    default:         return { label: 'Buy',      tone: 'gain' };
  }
}
export const toneColors = (tone) => (
  tone === 'loss' ? { bg: 'var(--loss-soft)', fg: 'var(--loss)' }
  : tone === 'muted' ? { bg: 'var(--surface-2)', fg: 'var(--muted)' }
  : { bg: 'var(--gain-soft)', fg: 'var(--gain)' }
);

/**
 * Persona that decides what the New Idea form offers. Verified Research
 * Publisher only once SEBI verification is APPROVED; a pending or rejected
 * publisher, and every Independent Market Contributor, publishes Market Views.
 */
export function publishingPersona(registrationStatus, sebiApprovalStatus) {
  const category = effectiveRegStatus(registrationStatus, sebiApprovalStatus);
  return category === REG_PUBLISHER && sebiApprovalStatus === 'approved' ? 'verified_publisher' : 'contributor';
}

/** Plain commentary text of a stored/serialised thesis (see parseThesis). */
export function commentaryText(thesis) {
  if (!thesis || thesis === '—') return '';
  let text = String(thesis);
  try { const p = JSON.parse(text); if (p && p.__v === '1') text = String(p.text || ''); } catch { /* plain */ }
  return text.replace(/\[([^\]]*)\]\([^)]*\)/g, '$1').trim();
}
