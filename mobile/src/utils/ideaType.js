/**
 * Idea types and publishing personas (mobile).
 *
 * An idea is either a RECOMMENDATION (Buy / Hold / Sell — a Verified Research
 * Publisher's professional call, tracked for performance) or a MARKET VIEW
 * (Positive / Neutral / Negative — an Independent Market Contributor's
 * commentary, never tracked). Both live in recommendation_type; anything that
 * scores, ranks or aggregates returns or consensus must exclude Market Views
 * (the legacy return maths treats any type that is not 'Sell' as long).
 *
 * Mirrors api/_lib/ideaType.js (authoritative — the server enforces it) and
 * src/utils/ideaType.js; ideaType.test.js keeps the copies aligned. Metro
 * can't import across the repo root, so this is a copy by necessity.
 */
import { REG_PUBLISHER, effectiveRegStatus } from "./profile";

export const RECOMMENDATION_TYPES = ["Buy", "Hold", "Sell"];
export const MARKET_VIEW_TYPES = ["Positive", "Neutral", "Negative"];

export const MARKET_VIEW_MIN_COMMENTARY = 30;
export const DISCLOSURE_MAX_CHARS = 600;
export const DEFAULT_MARKET_VIEW_DISCLOSURE =
  "This is my personal, independent market view, shared for information and discussion only. " +
  "I am not presenting myself as a SEBI-registered Research Analyst, and this is not investment advice, " +
  "a recommendation, or a solicitation to buy, sell or hold any security. " +
  "myInvestorCircle does not provide, verify or endorse this view. Do your own research; investments are subject to market risks.";

export const isMarketView = (t) => MARKET_VIEW_TYPES.includes(t);

/** The idea's type from either row shape (camelCase client object or snake_case DB row). */
export const ideaTypeOf = (r) => (r && (r.recType || r.recommendation_type)) || "Buy";
export const isMarketViewIdea = (r) => isMarketView(ideaTypeOf(r));
export const onlyRecommendations = (rows = []) => rows.filter((r) => !isMarketViewIdea(r));

/** { label, tone: 'gain'|'loss'|'muted' }; unknown / missing → Buy (legacy default). */
export function ideaTypeMeta(t) {
  switch (t) {
    case "Sell": return { label: "Sell", tone: "loss" };
    case "Hold": return { label: "Hold", tone: "muted" };
    case "Positive": return { label: "Positive", tone: "gain" };
    case "Neutral": return { label: "Neutral", tone: "muted" };
    case "Negative": return { label: "Negative", tone: "loss" };
    default: return { label: "Buy", tone: "gain" };
  }
}

/** Verified Research Publisher only once SEBI verification is APPROVED; everyone else posts Market Views. */
export function publishingPersona(registrationStatus, sebiApprovalStatus) {
  const category = effectiveRegStatus(registrationStatus, sebiApprovalStatus);
  return category === REG_PUBLISHER && sebiApprovalStatus === "approved" ? "verified_publisher" : "contributor";
}

/** Plain commentary text of a stored/serialised thesis. */
export function commentaryText(thesis) {
  if (!thesis || thesis === "—") return "";
  let text = String(thesis);
  try {
    const p = JSON.parse(text);
    if (p && p.__v === "1") text = String(p.text || "");
  } catch {
    /* plain text */
  }
  return text.replace(/\[([^\]]*)\]\([^)]*\)/g, "$1").trim();
}
