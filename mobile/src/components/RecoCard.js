import { memo, useCallback, useState, useSyncExternalStore } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { Ionicons, Feather } from "@expo/vector-icons";
import Avatar from "./Avatar";
import { fetchProfileNavInfo } from "../services/profileNav";
import { colors, fonts } from "../theme/colors";
import { fmt, fmtDate, fmtPct, getThesisText, returnPct } from "../utils/format";
import { isLiked, subscribeReactions, toggleReaction } from "../services/reactionStore";
import { isTracked, subscribeTracked, toggleTracked } from "../services/trackStore";

// Rich reco card — matches the web app's feed card (src/features/discovery):
// gradient avatar, "<name> recommended · via/shared-by · date", Buy/Sell pill,
// ticker + name + current price + return inset, a reco-price/target/horizon/
// conviction grid, the thesis, and a footer of status/sector pills + comments
// + invested state. Tappable (onPress) to open the detail screen.
const SOURCE_LABELS = { public: "Public", network_engagement: "From your network" };

function RecoCard({ reco, onPress, onOpenProfile, onOpenTicker, showActions = true }) {
  const pct = returnPct(reco);
  const positive = pct >= 0;
  const isBuy = (reco.recType || "Buy") !== "Sell";
  const sourceLabel = SOURCE_LABELS[reco.feedSource];

  // Second line under the name: circle it came via, or who forwarded it.
  const subtitle = reco.groupName
    ? `via ${reco.groupName}`
    : reco.sharedByName
    ? `shared by ${reco.sharedByName}`
    : sourceLabel;

  const status = reco.exitSignal ? "Exited" : "Active";

  // Feed rows carry the author's name but not their username, and profile
  // routes are by username — so opening a profile needs a lookup first. The
  // web does the same (openProfile via fetchPublicProfileInfo); on mobile the
  // author was not tappable at all.
  const canOpenAuthor = !!onOpenProfile && !!(reco.from_username || reco.from);
  const openAuthor = useCallback(async () => {
    if (!onOpenProfile) return;
    if (reco.from_username) {
      onOpenProfile(reco.from_username);
      return;
    }
    const info = await fetchProfileNavInfo(reco.from);
    if (info?.username) onOpenProfile(info.username);
  }, [onOpenProfile, reco.from_username, reco.from]);

  // An idea without a ticker (an unlisted holding, a fund entered by name)
  // has no stock page to open.
  const canOpenTicker = !!onOpenTicker && !!reco.ticker;
  const openTicker = useCallback(() => {
    if (reco.ticker) onOpenTicker?.(reco.ticker);
  }, [onOpenTicker, reco.ticker]);

  const CardBody = (
    <View style={styles.card}>
      {/* WHO */}
      <View style={styles.header}>
        {/* uid, not a picture: the card paints initials on the gradient right
            away and swaps in the author's photo once the avatar batch lands. */}
        <Pressable onPress={openAuthor} disabled={!canOpenAuthor} hitSlop={6}>
          <Avatar uid={reco.from} name={reco.byName} size={40} gradient />
        </Pressable>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.byName} numberOfLines={1}>
            <Text onPress={canOpenAuthor ? openAuthor : undefined} style={canOpenAuthor ? styles.byNameLink : null}>
              {reco.byName || "Someone"}
            </Text>{" "}
            <Text style={styles.recommended}>recommended</Text>
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle ? `${subtitle} · ` : ""}
            {fmtDate(reco.date)}
          </Text>
        </View>
        <View style={[styles.typePill, isBuy ? styles.buyPill : styles.sellPill]}>
          <Text style={[styles.typePillText, { color: isBuy ? colors.gain : colors.loss }]}>
            {isBuy ? "Buy" : "Sell"}
          </Text>
        </View>
      </View>

      {/* WHAT — instrument + current price + return */}
      <View style={styles.priceBox}>
        {/* The ticker opens the stock's page, the way it does on the web
            (FeedCard's onOpenSecurity). Without this the only route to a
            stock was searching for it by name from another screen, even
            with the card for it on screen. */}
        <Pressable
          style={{ flex: 1, minWidth: 0 }}
          disabled={!canOpenTicker}
          onPress={openTicker}
          hitSlop={6}
        >
          <Text style={[styles.ticker, canOpenTicker && styles.tickerLink]} numberOfLines={1}>
            {reco.ticker || reco.assetName}
          </Text>
          {reco.assetName && reco.ticker ? (
            <Text style={styles.assetName} numberOfLines={1}>
              {reco.assetName}
            </Text>
          ) : null}
        </Pressable>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.currentPrice}>{fmt(reco.price)}</Text>
          <Text style={[styles.returnText, { color: positive ? colors.gain : colors.loss }]}>
            {positive ? "▲" : "▼"} {fmtPct(pct)}
          </Text>
        </View>
      </View>

      {/* Reco price / target / horizon / conviction grid */}
      <View style={styles.grid}>
        <View style={styles.gridCell}>
          <Text style={styles.gridLabel}>RECO PRICE</Text>
          <Text style={styles.gridValue}>{fmt(reco.priceAt)}</Text>
        </View>
        <View style={styles.gridCell}>
          <Text style={styles.gridLabel}>TARGET</Text>
          <Text style={styles.gridValue}>{reco.targetPrice ? fmt(reco.targetPrice) : "—"}</Text>
        </View>
        {reco.horizon || reco.conviction ? (
          <>
            <View style={styles.gridCell}>
              <Text style={styles.gridLabel}>HORIZON</Text>
              <Text style={styles.gridValue}>{reco.horizon || "—"}</Text>
            </View>
            <View style={styles.gridCell}>
              <Text style={styles.gridLabel}>CONVICTION</Text>
              <Text style={styles.gridValue}>{reco.conviction || "—"}</Text>
            </View>
          </>
        ) : null}
      </View>

      {/* getThesisText, not the raw column: a thesis with images is stored as
          a JSON envelope, which used to render as visible JSON. */}
      {getThesisText(reco.thesis) ? (
        <Text style={styles.thesis} numberOfLines={2}>
          {getThesisText(reco.thesis)}
        </Text>
      ) : null}

      {/* Footer — status + sector pills, comments, invested */}
      <View style={styles.footer}>
        <View style={[styles.pill, status === "Active" ? styles.pillAccent : styles.pillMuted]}>
          <Text style={[styles.pillText, status === "Active" ? styles.pillTextAccent : styles.pillTextMuted]}>
            {status}
          </Text>
        </View>
        {reco.sector ? (
          <View style={[styles.pill, styles.pillMuted]}>
            <Text style={[styles.pillText, styles.pillTextMuted]}>{reco.sector}</Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        {showActions ? (
          <>
            <LikeButton reco={reco} />
            <TrackButton reco={reco} />
          </>
        ) : null}
        {reco.commentCount > 0 ? (
          <View style={styles.footerStat}>
            <Ionicons name="chatbubble-outline" size={15} color={colors.muted} />
            <Text style={styles.footerStatText}>{reco.commentCount}</Text>
          </View>
        ) : null}
        {reco.invested ? (
          <View style={styles.footerStat}>
            <Ionicons name="checkmark-circle" size={16} color={colors.gain} />
            <Text style={[styles.footerStatText, { color: colors.gain }]}>Invested</Text>
          </View>
        ) : null}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={() => onPress(reco)} style={({ pressed }) => pressed && { opacity: 0.85 }}>
        {CardBody}
      </Pressable>
    );
  }
  return CardBody;
}

/**
 * Like, with its count — the web has had both on every row
 * (features/recommendations/Recommendations.jsx); the card here showed
 * neither, so an idea already liked on the web looked untouched on the phone
 * and there was no way to like one from a list at all.
 *
 * Subscribes to the shared store on its own, so a like re-renders this one
 * card rather than the whole list, and the same idea shown in Feed, Discover
 * and Track stays in agreement.
 */
function LikeButton({ reco }) {
  const liked = useSyncExternalStore(
    subscribeReactions,
    () => isLiked(reco.id),
    () => undefined // server snapshot: unknown, never "not liked"
  );
  // The count comes from the list payload and is a moment old, so the tap
  // adjusts it locally rather than claiming to know the true total.
  const [delta, setDelta] = useState(0);
  const base = Number(reco.likes || 0);
  const count = Math.max(0, base + delta);

  const onPress = useCallback(async () => {
    const before = isLiked(reco.id) === true;
    setDelta((d) => d + (before ? -1 : 1));
    const after = await toggleReaction(reco.id);
    // Reverted by the store (the write failed) — put the count back too.
    if (after === before) setDelta((d) => d + (before ? 1 : -1));
  }, [reco.id]);

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={styles.footerStat}
      accessibilityRole="button"
      accessibilityLabel={liked ? "Unlike this idea" : "Like this idea"}
      accessibilityState={{ selected: !!liked }}
    >
      {/* Feather's outline thumbs-up, not Ionicons' filled glyph — this is the
          same stroke-based shape as lucide-react's ThumbsUp the web uses
          (features/recommendations/Recommendations.jsx, Discovery.jsx); the
          two icon sets draw the hand differently enough that Ionicons read
          as a visibly different icon, not just a different weight. Liked
          state is conveyed by color, matching the web's on-like styling,
          since Feather has no separate filled variant. */}
      <Feather name="thumbs-up" size={14} color={liked ? colors.accentInk : colors.muted} />
      {count > 0 ? (
        <Text style={[styles.footerStatText, liked && { color: colors.accentInk }]}>{count}</Text>
      ) : null}
    </Pressable>
  );
}

/**
 * Track (bookmark) straight from the card — the web lets you add an idea to
 * your tracked list from the feed row itself; the app required opening the
 * idea first. Same subscribe-on-its-own-store pattern as LikeButton, so a tap
 * here, on the detail screen, or in Pulse's "My Tracked" widget all agree.
 */
function TrackButton({ reco }) {
  const tracked = useSyncExternalStore(
    subscribeTracked,
    () => isTracked(reco.id),
    () => undefined
  );

  const onPress = useCallback(() => {
    toggleTracked(reco.id);
  }, [reco.id]);

  return (
    <Pressable
      onPress={onPress}
      hitSlop={8}
      style={styles.footerStat}
      accessibilityRole="button"
      accessibilityLabel={tracked ? "Untrack this idea" : "Track this idea"}
      accessibilityState={{ selected: !!tracked }}
    >
      <Ionicons
        name={tracked ? "bookmark" : "bookmark-outline"}
        size={15}
        color={tracked ? colors.accentInk : colors.muted}
      />
    </Pressable>
  );
}

// Memoized so scrolling / parent state changes don't re-render every card.
export default memo(RecoCard);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 13,
    marginHorizontal: 14,
    marginBottom: 10,
    shadowColor: "#141432",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 1,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 9 },
  byName: { color: colors.ink, fontFamily: fonts.bold, fontSize: 14 },
  byNameLink: { color: colors.accentInk, textDecorationLine: "underline" },
  recommended: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13 },
  subtitle: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 1 },
  typePill: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  buyPill: { backgroundColor: colors.gainSoft },
  sellPill: { backgroundColor: colors.lossSoft },
  typePillText: { fontFamily: fonts.bold, fontSize: 12 },

  priceBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderRadius: 11,
    padding: 11,
    gap: 10,
    marginBottom: 9,
  },
  ticker: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 18, letterSpacing: -0.3 },
  // Coloured rather than underlined: the ticker is the card's headline, and
  // an underline under 20pt extrabold reads as damage.
  tickerLink: { color: colors.accentInk },
  assetName: { color: colors.muted, fontFamily: fonts.medium, fontSize: 13, marginTop: 1 },
  currentPrice: { color: colors.ink, fontFamily: fonts.bold, fontSize: 18 },
  returnText: { fontFamily: fonts.bold, fontSize: 14, marginTop: 2 },

  grid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 8 },
  gridCell: { width: "50%", marginBottom: 7 },
  gridLabel: { color: colors.muted, fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.5, marginBottom: 2 },
  gridValue: { color: colors.ink, fontFamily: fonts.bold, fontSize: 14 },

  thesis: { color: colors.inkSoft, fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 17, marginBottom: 9 },

  footer: { flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 9 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillAccent: { backgroundColor: colors.accentSoft },
  pillMuted: { backgroundColor: colors.surface2 },
  pillText: { fontFamily: fonts.semibold, fontSize: 12 },
  pillTextAccent: { color: colors.accentInk },
  pillTextMuted: { color: colors.inkSoft },
  footerStat: { flexDirection: "row", alignItems: "center", gap: 4 },
  footerStatText: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 12 },
});
