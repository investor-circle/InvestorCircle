import { useEffect, useSyncExternalStore } from "react";
import { View, Text, Image, StyleSheet } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { initialsOf } from "../utils/format";
import { avatarSource, avatarIdOf } from "../utils/avatar";
import { subscribeAvatars, cachedAvatar, requestAvatar } from "../services/avatarCache";
import { subscribeMemberTags, cachedMemberTags, primeMemberTags } from "../services/memberTagsCache";
import { colors, fonts, GRADIENT } from "../theme/colors";

const FOUNDING_MEMBER_BADGE = require("../../assets/founding-member-badge.png");
const FOUNDING_RESEARCH_PARTNER_BADGE = require("../../assets/founding-research-partner-badge.png");
// MEMBER_TAGS mirrors src/constants/app.js on web — a new tag type is a new
// entry here (icon + label), not new markup in this file.
const MEMBER_TAGS = {
  founding_member: { label: "Founding Member", icon: FOUNDING_MEMBER_BADGE },
  founding_research_partner: { label: "Founding Research Partner", icon: FOUNDING_RESEARCH_PARTNER_BADGE },
};

/**
 * A person's picture, falling back to their initials.
 *
 * One component for every place an avatar appears, so a picture uploaded from
 * either client shows up consistently. The picture is a data: URI stored on
 * user_profiles.avatar_url (see src/utils/avatar.js), which <Image> renders
 * directly — no network fetch, no caching to get wrong.
 *
 * TWO WAYS TO SUPPLY THE PICTURE:
 *
 *  - `profile` — a row that already carries avatar_url (profile screens,
 *    where the picture came back with the rest of the data anyway). Accepts
 *    either the snake_case server row or a camelCase object, because lists
 *    and profile screens hand over different shapes.
 *  - `uid` — just the person's id. The picture is read from the avatar cache
 *    (src/services/avatarCache.js), which lists fill in AFTER they paint.
 *    This is how feed cards get pictures without putting a data: URI on the
 *    critical path: the card renders initials immediately and swaps in the
 *    picture if and when the cache has one. Rendering NEVER waits on it.
 *
 * Either way this component ASKS for the picture itself (requestAvatar),
 * batched with every other avatar on screen — a screen forgetting to prime
 * the cache used to leave its people on initials for good.
 *
 * `gradient` draws the initials on the brand gradient rather than a flat
 * chip — the feed card's look. It only affects the fallback; a real picture
 * looks the same either way.
 */
export default function Avatar({ profile, uid, name, size = 40, gradient = false, style, tags: tagsProp }) {
  // One id for both lookups below — the explicit `uid`, else whichever id
  // field the row carries (see avatarIdOf).
  const id = avatarIdOf(profile, uid);
  const own = avatarSource(profile);

  // Subscribed rather than read once: a list paints before the avatar batch
  // resolves, and this is what makes those rows update when it lands.
  const cached = useSyncExternalStore(
    subscribeAvatars,
    () => (id ? cachedAvatar(id) : null),
    () => null // server snapshot — unused in RN, required by the signature
  );
  const hasOwn = !!own;
  useEffect(() => {
    if (id && !hasOwn) requestAvatar(id);
  }, [id, hasOwn]);

  // cachedMemberTags(null) already returns its own stable "no tags"
  // reference — do NOT fall back to a fresh `[]` literal here, or
  // useSyncExternalStore sees a "changed" snapshot on every render and loops.
  const cachedTags = useSyncExternalStore(
    subscribeMemberTags,
    () => cachedMemberTags(id),
    () => cachedMemberTags(id)
  );
  useEffect(() => {
    primeMemberTags();
  }, []);
  // Pass `tags` explicitly to override. Otherwise a profile row that carries
  // its own `tags` (the public profile does, fetched moments ago) counts as
  // well as the shared map, so a badge granted since the map last loaded
  // still shows on that person's own page.
  const tagType =
    tagsProp !== undefined
      ? tagsProp?.find((t) => MEMBER_TAGS[t])
      : (Array.isArray(profile?.tags) && profile.tags.find((t) => MEMBER_TAGS[t])) ||
        cachedTags.find((t) => MEMBER_TAGS[t]);
  const badgeCfg = tagType ? MEMBER_TAGS[tagType] : null;

  const source = own || (cached ? { uri: cached } : null);
  const label = name || profile?.full_name || profile?.name || profile?.username;
  const dim = { width: size, height: size, borderRadius: size / 2 };

  const badge = badgeCfg ? <MemberBadgeOverlay icon={badgeCfg.icon} label={badgeCfg.label} size={size} /> : null;

  // The wrapper carries `dim` (not just width/height) too — same width/
  // height/borderRadius the single rendered element used to carry before
  // this badge overlay wrapped it in a View, so anything inspecting the
  // rendered tree's outer style (tests, a caller's own layout math) still
  // finds them there. Never overflow:hidden here, or the badge — deliberately
  // positioned a little outside this box — would itself get clipped.
  if (source) {
    return (
      <View style={[dim, style]}>
        <Image source={source} style={[styles.img, dim]} accessibilityIgnoresInvertColors />
        {badge}
      </View>
    );
  }

  const initials = (
    <Text style={[gradient ? styles.initialsOnGradient : styles.initials, { fontSize: Math.max(9, size * 0.36) }]}>
      {initialsOf(label)}
    </Text>
  );

  if (gradient) {
    return (
      <View style={[dim, style]}>
        <LinearGradient colors={GRADIENT.colors} start={GRADIENT.start} end={GRADIENT.end} style={[styles.fallbackBase, dim]}>
          {initials}
        </LinearGradient>
        {badge}
      </View>
    );
  }

  return (
    <View style={[dim, style]}>
      <View style={[styles.fallback, dim]}>{initials}</View>
      {badge}
    </View>
  );
}

/* Small badge on the avatar's bottom-right edge — the same overlay treatment
   as web's MemberBadgeOverlay (src/components/common.jsx), sized as a
   fraction of the avatar so it scales everywhere Avatar is used. */
function MemberBadgeOverlay({ icon, label, size }) {
  const badgeSize = Math.max(13, Math.round(size * 0.46));
  const offset = -Math.round(badgeSize * 0.1);
  return (
    <Image
      source={icon}
      accessibilityLabel={label}
      resizeMode="contain"
      style={{
        position: "absolute",
        right: offset,
        bottom: offset,
        width: badgeSize,
        height: badgeSize,
        shadowColor: "#000",
        shadowOffset: { width: 0, height: 1 },
        shadowOpacity: 0.4,
        shadowRadius: 2,
      }}
    />
  );
}

const styles = StyleSheet.create({
  img: { backgroundColor: colors.surface2 },
  fallbackBase: { alignItems: "center", justifyContent: "center" },
  fallback: { backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  initials: { color: colors.inkSoft, fontFamily: fonts.bold },
  initialsOnGradient: { color: "#fff", fontFamily: fonts.extrabold },
});
