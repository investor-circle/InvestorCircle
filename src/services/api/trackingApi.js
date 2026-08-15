/**
 * InvestorCircle — Tracking service module (Phase 6).
 *
 * "Track" is the one-way, no-approval relationship that replaces Follow for
 * investor/creator content. Thin re-export of the tracking functions from
 * src/db.js — the underlying implementation still funnels through
 * callApi() (see db.js), which talks to the authenticated server APIs in
 * api/data.js and api/_lib/handlers/tracking.js. The browser never connects
 * to Neon directly.
 */
export {
  trackInvestor,
  untrackInvestor,
  getTrackingStatus,
  getMyTracking
} from "../../db";
