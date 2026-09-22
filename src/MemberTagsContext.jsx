import React, { createContext, useCallback, useContext, useEffect, useState } from "react";
import { getMemberTags } from "./services/api/lookupsApi";

/**
 * MemberTagsContext — who holds which member tag (Founding Member today;
 * Verified etc. later), fetched as a small { tag_type: [userId, ...] } map
 * (see api/_lib/handlers/lookups.js action=member-tags) rather than having
 * every feed/connections/groups query join user_tags itself. Any component
 * that renders a user id can ask "does this id have tag X" without its own
 * data source needing to carry that field.
 *
 * Public data (a tag is always displayed, signed-out visitors included), so
 * this fetches on mount regardless of auth state. Also re-fetchable via
 * `refresh` (src/features/admin/Admin.jsx calls it right after granting/
 * revoking a tag) — without this, an admin who toggles a tag and then
 * navigates elsewhere in the same SPA session (no full page reload) would
 * see stale state until their next reload, since this provider otherwise
 * only fetches once at app mount.
 */
const MemberTagsContext = createContext({ tagsByUser: {}, refresh: () => {} });
// A stable reference for "no tags" — returning a fresh `[]` literal on every
// call would make a value that's otherwise unchanged look different to
// anything comparing by reference (a dependency array, useSyncExternalStore).
const EMPTY_TAGS = [];

export function MemberTagsProvider({ children }) {
  const [tagsByUser, setTagsByUser] = useState({});

  const refresh = useCallback(() => {
    return getMemberTags().then(tags => {
      const byUser = {};
      for (const [tagType, userIds] of Object.entries(tags || {})) {
        for (const uid of userIds) (byUser[uid] ||= []).push(tagType);
      }
      setTagsByUser(byUser);
    }).catch(() => {});
  }, []);

  useEffect(() => { refresh(); }, [refresh]);

  return (
    <MemberTagsContext.Provider value={{ tagsByUser, refresh }}>
      {children}
    </MemberTagsContext.Provider>
  );
}

// Returns the tag_type array for a given user id (or an empty array).
export function useMemberTagsFor(userId) {
  const { tagsByUser } = useContext(MemberTagsContext);
  if (!userId) return EMPTY_TAGS;
  return tagsByUser[userId] || tagsByUser[String(userId)] || EMPTY_TAGS;
}

export function useMemberTagsMap() {
  return useContext(MemberTagsContext).tagsByUser;
}

// Re-fetches the tag map — call right after an admin action that grants or
// revokes a tag, so the change shows up without a full page reload.
export function useRefreshMemberTags() {
  return useContext(MemberTagsContext).refresh;
}
