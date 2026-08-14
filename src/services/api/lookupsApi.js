/**
 * InvestorCircle — Lookups service module (Phase 5).
 *
 * Thin, feature-scoped re-export of the Lookups functions from src/db.js —
 * the underlying implementation still funnels through callApi() (see db.js),
 * which talks to the authenticated server APIs in api/data.js and
 * api/_lib/handlers/*.js. The browser never connects to Neon directly.
 *
 * Import from here (not db.js) in new feature code so API calls stay grouped
 * by feature and are easy to keep in sync with the mobile app later.
 */
export {
  getInstrumentsList,
  getSectors,
  getPortfolioHoldings,
  addPortfolioHolding,
  deletePortfolioHolding,
  deleteAllPortfolioHoldings,
  getFeedConfigAndPrefs,
  setFeedPref,
  searchPeople,
  getAboutUsContent,
  saveAboutUsContent,
  voteFeature,
  submitContactForm
} from "../../db";
