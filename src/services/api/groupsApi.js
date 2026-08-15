/**
 * InvestorCircle — Groups service module (Phase 5).
 *
 * Thin, feature-scoped re-export of the Groups functions from src/db.js —
 * the underlying implementation still funnels through callApi() (see db.js),
 * which talks to the authenticated server APIs in api/data.js and
 * api/_lib/handlers/*.js. The browser never connects to Neon directly.
 *
 * Import from here (not db.js) in new feature code so API calls stay grouped
 * by feature and are easy to keep in sync with the mobile app later.
 */
export {
  getMyGroups,
  createGroup,
  renameGroup,
  deleteGroup,
  exitGroup,
  addGroupMembers,
  removeGroupMember,
  // Circles (Phase 6) — same underlying ic_groups/group_members tables.
  getCircleBySlug,
  getOwnerCircles,
  getCircleJoinRequests,
  getCircleEligibleMembers,
  requestJoinCircle,
  reviewCircleJoinRequest,
  regenerateCircleInviteLink,
  updateCircleSettings
} from "../../db";
