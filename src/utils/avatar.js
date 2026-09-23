// Single place that knows how to carry a person's uploaded avatar from a raw
// API row into a view-model object. Spread this in wherever a "contacts"/
// "members"/"people" list is derived instead of hand-picking fields, so
// avatar_url can't be silently dropped the way it repeatedly has been
// (mobile's src/utils/avatar.js's avatarSource() is the RN equivalent).
export function avatarFields(row) {
  return { avatarUrl: row?.avatar_url || row?.avatarUrl || null };
}
