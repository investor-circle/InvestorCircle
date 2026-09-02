/**
 * InvestorCircle — Recommendations service module (Phase 5).
 *
 * Thin, feature-scoped re-export of the Recommendations functions from src/db.js —
 * the underlying implementation still funnels through callApi() (see db.js),
 * which talks to the authenticated server APIs in api/data.js and
 * api/_lib/handlers/*.js. The browser never connects to Neon directly.
 *
 * Import from here (not db.js) in new feature code so API calls stay grouped
 * by feature and are easy to keep in sync with the mobile app later.
 */
export {
  createRecommendation,
  getMyReceivedRecos,
  getMyMadeRecos,
  updateDelivery,
  setExitSignal,
  cancelExitSignal,
  notifyPublicContacts,
  forwardRecommendation,
  // deleteRecommendation is deliberately NOT re-exported — see the note below.
  deleteDelivery,
  computeIci,
  getConsensusRecosAll,
  getConsensusRecosPublic,
  getTickerRecos,
  getNetworkEngagementFeed,
  getPublicFeed,
  getRecommenderUsername,
  getCircleIdeas
} from "../../db";

// NOT EXPOSED: deleteRecommendation.
//
// The server action (delete-reco) and the db.js wrapper both still exist, but
// no client may reach them: by product decision an idea is permanent once
// posted. That is what makes a track record mean anything — nobody can
// quietly erase the calls that went wrong. An author closes a position with
// setExitSignal(), which records the outcome rather than hiding it.
//
// deleteDelivery above is a different action: it removes a RECIPIENT's own
// copy of an idea and leaves the idea, and everyone else's copy, untouched.
//
// Do not re-export deleteRecommendation to "restore parity" with the
// endpoint. If a short post-publish correction window is introduced later it
// will be a deliberate feature with its own time limit and rules.
