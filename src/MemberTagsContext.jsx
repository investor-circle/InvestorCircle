import React, { createContext, useContext, useEffect, useState } from "react";
import { getMemberTags } from "./services/api/lookupsApi";

/**
 * MemberTagsContext — who holds which member tag (Founding Member today;
 * Verified etc. later), fetched once as a small { tag_type: [userId, ...] }
 * map (see api/_lib/handlers/lookups.js action=member-tags) rather than
 * having every feed/connections/groups query join user_tags itself. Any
 * component that renders a user id can ask "does this id have tag X" without
 * its own data source needing to carry that field.
 *
 * Public data (a tag is always displayed, signed-out visitors included), so
 * this fetches on mount regardless of auth state and needs no refresh
 * beyond a fresh page load — a newly-granted tag shows up next time the
 * app loads, which is fine for something an admin sets rarely.
 */
const MemberTagsContext = createContext({ tagsByUser: {} });
// A stable reference for "no tags" — returning a fresh `[]` literal on every
// call would make a value that's otherwise unchanged look different to
// anything comparing by reference (a dependency array, useSyncExternalStore).
const EMPTY_TAGS = [];

export function MemberTagsProvider({ children }) {
  const [tags, setTags] = useState({}); // { tag_type: [userId, ...] }

  useEffect(() => {
    let cancelled = false;
    getMemberTags().then(t => { if (!cancelled) setTags(t || {}); }).catch(() => {});
    return () => { cancelled = true; };
  }, []);

  // Inverted once per fetch (not per Avatar render): { userId: [tag_type, ...] }
  const [tagsByUser, setTagsByUser] = useState({});
  useEffect(() => {
    const byUser = {};
    for (const [tagType, userIds] of Object.entries(tags)) {
      for (const uid of userIds) (byUser[uid] ||= []).push(tagType);
    }
    setTagsByUser(byUser);
  }, [tags]);

  return (
    <MemberTagsContext.Provider value={{ tagsByUser }}>
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
