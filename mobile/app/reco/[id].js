import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useLocalSearchParams, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import RecoCard from "../../src/components/RecoCard";
import { getReco } from "../../src/utils/recoStore";
import { getPublicFeed } from "../../src/services/api/recommendationsApi";
import { mapPublicReco } from "../../src/utils/feed";
import { fmt, fmtDate } from "../../src/utils/format";
import { getTodayClose, sourceName } from "../../src/services/marketData";
import Avatar from "../../src/components/Avatar";
import { primeAvatars } from "../../src/services/avatarCache";
import { setLiked } from "../../src/services/reactionStore";
import {
  getEngagement,
  reactToReco,
  commentOnReco,
  trackReco,
  untrackReco,
} from "../../src/services/api/engagementApi";
import {
  setExitSignal,
  cancelExitSignal,
  dismissDelivery,
  updateDelivery,
} from "../../src/services/api/recommendationsApi";
import { useAuth } from "../../src/context/AuthContext";
import { colors, fonts } from "../../src/theme/colors";
import { withBoundary } from "../../src/components/ErrorBoundary";
import ShareRecoSheet from "../../src/components/ShareRecoSheet";

function RecoDetailScreen() {
  const { id, username } = useLocalSearchParams();
  const router = useRouter();
  const { profile, user } = useAuth();
  // Normally handed over in memory from the list — instant, no refetch. On a
  // cold deep link there is no hand-off, so fall back to looking the idea up
  // in the public feed (see resolve effect below).
  const [reco, setReco] = useState(() => getReco(id));
  const [resolving, setResolving] = useState(!getReco(id));

  const [eng, setEng] = useState(null); // { likes, myReaction, tracking, comments }
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [exited, setExited] = useState(!!reco?.exitSignal);
  const [ownerBusy, setOwnerBusy] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [hidden, setHidden] = useState(!!reco?.hidden);
  const mounted = useRef(true);

  // Owner-only controls. The server independently enforces that only the
  // recommender may signal an exit — this just decides what to render.
  const isOwner = !!user?.uid && (reco?.from === user.uid || reco?.recommender_id === user.uid);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      const data = await getEngagement(id);
      if (!mounted.current) return;
      setEng(data);
      // This is the authoritative answer for one idea, so let the shared
      // store learn from it too — the card behind this screen then agrees
      // without a second round-trip.
      setLiked(id, data?.myReaction === "like");
      primeAvatars((data?.comments || []).map((c) => c.userId ?? c.user_id));
    })();
    return () => {
      mounted.current = false;
    };
  }, [id]);

  // Cold deep link: try to find the idea among the public recos. There is no
  // single-reco endpoint, so a non-public idea genuinely can't be resolved
  // this way — in that case we say so and offer the author's profile rather
  // than pretending to load forever.
  useEffect(() => {
    if (reco) return;
    let cancelled = false;
    (async () => {
      const rows = await getPublicFeed();
      const found = (rows || []).find((r) => String(r.id) === String(id));
      if (cancelled) return;
      if (found) setReco(mapPublicReco(found));
      setResolving(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [reco, id]);

  const liked = eng?.myReaction === "like";
  const likeCount = eng?.likes ?? reco?.likes ?? 0;
  const isTracked = !!eng?.tracking;
  const isInvested = !!eng?.tracking?.isInvested;

  const toggleLike = useCallback(async () => {
    if (!eng) return;
    const next = liked ? null : "like";
    setEng((e) => ({ ...e, myReaction: next, likes: Math.max(0, (e.likes || 0) + (next ? 1 : -1)) }));
    // Kept deliberately separate from reactionStore.toggleReaction: a like
    // from here notifies the author (likerName), and one from a feed card
    // does not — same as the web, where the post view notifies and the list
    // row does not. The store is TOLD the outcome instead, so going back
    // shows the card in the state you just left it in.
    setLiked(id, !!next);
    await reactToReco(id, next, next ? { likerName: profile?.full_name || "Someone" } : null);
  }, [eng, liked, id, profile?.full_name]);

  const toggleTrack = useCallback(async () => {
    if (!eng) return;
    if (isTracked) {
      setEng((e) => ({ ...e, tracking: null }));
      await untrackReco(id);
    } else {
      setEng((e) => ({ ...e, tracking: { isInvested: false, investedPrice: null } }));
      await trackReco(id);
    }
  }, [eng, isTracked, id]);

  const toggleInvested = useCallback(async () => {
    if (!eng) return;
    const next = !isInvested;
    setEng((e) => ({ ...e, tracking: { ...(e.tracking || {}), isInvested: next } }));

    // TWO places record "I acted on this", and they are not interchangeable:
    //
    //  - recommendation_deliveries.is_invested — what the feed card's
    //    "Invested" badge reads, and what feeds the author's reco_acted
    //    count (how many people acted on their idea).
    //  - recommendation_tracking.is_invested — the Track tab's own list.
    //
    // Mobile used to write only the second, so marking an idea invested here
    // never lit up the badge on the card and never counted for the author.
    // The web writes the delivery row (Recommendations.jsx doInvest), so do
    // the same whenever this is a received idea, and keep the tracking write
    // for the Track tab.
    if (reco?.deliveryId) {
      await updateDelivery(reco.deliveryId, {
        isInvested: next,
        investedPrice: next ? reco?.price ?? null : null,
        // The server no longer clobbers an unmentioned reaction, but this
        // app updates slowly (store builds are infrequent), so it keeps
        // sending its current value: correct against either server version.
        reaction: eng?.myReaction ?? null,
      });
      setReco((r) => (r ? { ...r, invested: next } : r));
    }
    await trackReco(id, next, next ? reco?.price ?? undefined : undefined);
  }, [eng, isInvested, id, reco?.price, reco?.deliveryId]);

  const toggleExit = useCallback(async () => {
    setOwnerBusy(true);
    const next = !exited;

    if (!next) {
      const res = await cancelExitSignal(id);
      if (mounted.current) {
        if (res) setExited(false);
        setOwnerBusy(false);
      }
      return;
    }

    // The exit price is the idea's FINAL result — what the track record and
    // the ICI score are computed from. The server stores what it is given and
    // does NOT look one up (an earlier comment here claimed it did), so an
    // exit sent without a price recorded NULL, and the displayed return then
    // fell back to the current price: a closed idea whose result kept moving
    // with the market. The web fetches the close and sends it; so do we.
    //
    // A price we cannot get is not a reason to block the exit — the web says
    // as much in its confirmation and lets it through unstamped.
    const quote = await getTodayClose(reco?.ticker, reco?.exchange || "NSE");
    if (!mounted.current) return;

    const confirmExit = () =>
      new Promise((resolve) => {
        Alert.alert(
          `Exit ${reco?.ticker || "this idea"}?`,
          quote
            ? `Exit price: ${fmt(quote.price)} (${sourceName(quote.source)} · ${quote.date})\n\n` +
              "This records your exit and closes the idea."
            : "Price unavailable — it will not be stamped.\n\nThis still records your exit and closes the idea.",
          [
            { text: "Cancel", style: "cancel", onPress: () => resolve(false) },
            { text: "Exit", style: "destructive", onPress: () => resolve(true) },
          ]
        );
      });

    if (!(await confirmExit())) {
      if (mounted.current) setOwnerBusy(false);
      return;
    }

    const res = await setExitSignal(id, quote?.price ?? null, quote?.source ?? null);
    if (mounted.current) {
      if (res) setExited(true);
      setOwnerBusy(false);
    }
  }, [exited, id, reco?.ticker, reco?.exchange]);

  // Reversible: keeps your copy, just takes it out of the feed. The web has
  // this alongside remove (toggleHide in Recommendations.jsx); mobile offered
  // only the permanent one.
  const toggleHidden = useCallback(async () => {
    const next = !hidden;
    setHidden(next);
    const saved = await updateDelivery(reco.deliveryId, {
      isHidden: next,
      // See toggleInvested — sent for the same defensive reason.
      reaction: eng?.myReaction ?? null,
    });
    if (!mounted.current) return;
    if (!saved) setHidden(!next); // put the switch back if it didn't save
    else setReco((r) => (r ? { ...r, hidden: next } : r));
  }, [hidden, reco?.deliveryId, eng?.myReaction]);

  // Removes only YOUR copy of a shared idea; the idea itself and everyone
  // else's copy are untouched. Different action, different endpoint, and a
  // different confirmation so the two are not confused.
  const confirmDismiss = useCallback(() => {
    Alert.alert(
      "Remove from your feed?",
      "This hides it for you only. The person who shared it, and anyone else it went to, are not affected.",
      [
        { text: "Cancel", style: "cancel" },
        {
          text: "Remove",
          style: "destructive",
          onPress: async () => {
            const ok = await dismissDelivery(reco.deliveryId);
            if (ok) router.back();
            else Alert.alert("Couldn't remove", "Please try again.");
          },
        },
      ]
    );
  }, [reco, router]);

  const submitComment = useCallback(async () => {
    const text = comment.trim();
    if (!text || posting) return;
    setPosting(true);
    const created = await commentOnReco(id, text);
    if (mounted.current) {
      if (created) {
        setEng((e) => ({ ...e, comments: [...(e?.comments || []), created] }));
        setComment("");
      }
      setPosting(false);
    }
  }, [comment, posting, id]);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle}>Idea</Text>
        <Pressable onPress={() => setShareOpen(true)} hitSlop={10} style={{ width: 24, alignItems: "flex-end" }}>
          <Ionicons name="share-social-outline" size={21} color={colors.accentInk} />
        </Pressable>
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          {reco ? (
            <>
              <RecoCard reco={reco} />
              {reco.from_username ? (
                <Pressable style={styles.authorLink} onPress={() => router.push(`/investor/${reco.from_username}`)}>
                  <Ionicons name="person-circle-outline" size={17} color={colors.accentInk} />
                  <Text style={styles.authorLinkText}>View {reco.byName || "investor"}'s profile</Text>
                </Pressable>
              ) : null}
            </>
          ) : (
            <View style={styles.missing}>
              {resolving ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <>
                  <Text style={styles.missingText}>
                    This idea isn't publicly viewable, so it can't be opened from a link.
                  </Text>
                  {username ? (
                    <Pressable style={styles.authorLink} onPress={() => router.push(`/investor/${username}`)}>
                      <Ionicons name="person-circle-outline" size={17} color={colors.accentInk} />
                      <Text style={styles.authorLinkText}>View @{username}'s profile</Text>
                    </Pressable>
                  ) : null}
                </>
              )}
            </View>
          )}

          {/* Action bar */}
          <View style={styles.actions}>
            <Pressable style={[styles.actionBtn, liked && styles.actionOn]} onPress={toggleLike}>
              <Ionicons name={liked ? "heart" : "heart-outline"} size={18} color={liked ? colors.loss : colors.inkSoft} />
              <Text style={[styles.actionText, liked && { color: colors.loss }]}>{likeCount || "Like"}</Text>
            </Pressable>
            <Pressable style={[styles.actionBtn, isTracked && styles.actionOnAccent]} onPress={toggleTrack}>
              <Ionicons
                name={isTracked ? "bookmark" : "bookmark-outline"}
                size={18}
                color={isTracked ? colors.accentInk : colors.inkSoft}
              />
              <Text style={[styles.actionText, isTracked && { color: colors.accentInk }]}>
                {isTracked ? "Tracking" : "Track"}
              </Text>
            </Pressable>
            <Pressable style={[styles.actionBtn, isInvested && styles.actionOnGain]} onPress={toggleInvested}>
              <Ionicons
                name={isInvested ? "checkmark-circle" : "checkmark-circle-outline"}
                size={18}
                color={isInvested ? colors.gain : colors.inkSoft}
              />
              <Text style={[styles.actionText, isInvested && { color: colors.gain }]}>
                {isInvested ? "Invested" : "Invest"}
              </Text>
            </Pressable>
          </View>

          {/* Market consensus for this security — the "what does everyone
              else think" view. Offered for any idea with a ticker, since it
              is about the security rather than this particular idea. */}
          {reco?.ticker ? (
            <Pressable
              style={styles.consensusBtn}
              onPress={() => router.push(`/ticker/${encodeURIComponent(String(reco.ticker).toUpperCase())}`)}
            >
              <Ionicons name="stats-chart-outline" size={17} color={colors.accentInk} />
              <Text style={styles.consensusText}>
                What others think about {String(reco.ticker).toUpperCase()}
              </Text>
              <Ionicons name="chevron-forward" size={16} color={colors.muted} />
            </Pressable>
          ) : null}

          {/* Not yours, but delivered to you: you can remove your own copy.
              Only offered when there IS a delivery row — a public idea you
              found via Pulse was never delivered to you, so there is nothing
              to dismiss and the button would fail. */}
          {!isOwner && reco?.deliveryId ? (
            <View style={styles.dismissRow}>
              {/* Two different things, as on the web: hide is reversible and
                  keeps the idea in your list (just out of the feed); remove
                  drops your copy for good. Mobile only had the destructive
                  one, so "not now" and "never" were the same button. */}
              <Pressable style={styles.dismissBtn} onPress={toggleHidden}>
                <Ionicons name={hidden ? "eye-outline" : "eye-off-outline"} size={17} color={colors.muted} />
                <Text style={styles.dismissText}>{hidden ? "Unhide" : "Hide from feed"}</Text>
              </Pressable>
              <Pressable style={styles.dismissBtn} onPress={confirmDismiss}>
                <Ionicons name="trash-outline" size={17} color={colors.muted} />
                <Text style={styles.dismissText}>Remove</Text>
              </Pressable>
            </View>
          ) : null}

          {/* Owner-only: signal an exit.
              NOT delete. A posted idea is permanent by product decision — the
              track record only means something if it cannot be edited after
              the fact, so signalling an exit is how an author closes a
              position, and the original idea stays visible. The web app
              exposes no delete either. (A short post-publish correction
              window may come later; that would be a deliberate feature with
              its own rules, not this button.) */}
          {isOwner ? (
            <View style={styles.ownerBar}>
              {ownerBusy ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Pressable style={[styles.ownerBtn, exited && styles.ownerBtnOn]} onPress={toggleExit}>
                  <Ionicons
                    name={exited ? "flag" : "flag-outline"}
                    size={17}
                    color={exited ? colors.accentInk : colors.inkSoft}
                  />
                  <Text style={[styles.ownerText, exited && { color: colors.accentInk }]}>
                    {exited ? "Exited — undo" : "Signal exit"}
                  </Text>
                </Pressable>
              )}
            </View>
          ) : null}

          {/* Comments */}
          <Text style={styles.sectionTitle}>Comments</Text>
          {eng === null ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 12 }} />
          ) : eng.comments.length === 0 ? (
            <Text style={styles.noComments}>No comments yet. Start the conversation.</Text>
          ) : (
            eng.comments.map((c) => (
              <View key={String(c.id)} style={styles.comment}>
                <View style={styles.commentHead}>
                  <Avatar uid={c.userId ?? c.user_id} name={c.userName || c.user_name} size={26} />
                  <Text style={styles.commentAuthor}>{c.userName || c.user_name || "User"}</Text>
                </View>
                <Text style={styles.commentBody}>{c.comment}</Text>
                <Text style={styles.commentDate}>{fmtDate(c.createdAt || c.created_at)}</Text>
              </View>
            ))
          )}
        </ScrollView>

        {/* Comment composer */}
        <View style={styles.composer}>
          <TextInput
            style={styles.composerInput}
            placeholder="Add a comment…"
            placeholderTextColor={colors.muted}
            value={comment}
            onChangeText={setComment}
            multiline
          />
          <Pressable
            style={[styles.sendBtn, (!comment.trim() || posting) && styles.sendBtnDisabled]}
            onPress={submitComment}
            disabled={!comment.trim() || posting}
          >
            {posting ? <ActivityIndicator color="#fff" size="small" /> : <Ionicons name="send" size={18} color="#fff" />}
          </Pressable>
        </View>
      </KeyboardAvoidingView>

      <ShareRecoSheet visible={shareOpen} reco={reco} onClose={() => setShareOpen(false)} />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.surface,
  },
  backBtn: { width: 24 },
  topTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 16 },
  authorLink: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    marginHorizontal: 16,
    marginBottom: 12,
    paddingVertical: 4,
  },
  authorLinkText: { color: colors.accentInk, fontFamily: fonts.semibold, fontSize: 13 },
  missing: { padding: 24, alignItems: "center" },
  missingText: { color: colors.muted, fontFamily: fonts.regular, fontSize: 14, textAlign: "center" },

  actions: { flexDirection: "row", gap: 10, paddingHorizontal: 16, marginBottom: 8 },
  actionBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  actionOn: { backgroundColor: colors.lossSoft, borderColor: colors.lossSoft },
  actionOnAccent: { backgroundColor: colors.accentSoft, borderColor: colors.accentLine },
  actionOnGain: { backgroundColor: colors.gainSoft, borderColor: colors.gainSoft },
  actionText: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 13 },

  consensusBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginHorizontal: 16,
    marginTop: 14,
    paddingVertical: 13,
    paddingHorizontal: 14,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line2,
    backgroundColor: colors.surface,
  },
  consensusText: { flex: 1, color: colors.accentInk, fontFamily: fonts.semibold, fontSize: 14 },
  dismissRow: { flexDirection: "row", gap: 10, paddingHorizontal: 16 },
  dismissBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginTop: 10,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line2,
    backgroundColor: colors.surface,
  },
  dismissText: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 14 },
  ownerBar: { flexDirection: "row", gap: 10, paddingHorizontal: 16, marginTop: 4, alignItems: "center" },
  ownerBtn: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    height: 42,
    borderRadius: 12,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  ownerBtnOn: { backgroundColor: colors.accentSoft, borderColor: colors.accentLine },
  ownerText: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 13 },
  sectionTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 16, paddingHorizontal: 16, marginTop: 16, marginBottom: 8 },
  noComments: { color: colors.muted, fontFamily: fonts.regular, fontSize: 14, paddingHorizontal: 16 },
  comment: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    padding: 12,
    marginHorizontal: 16,
    marginBottom: 8,
  },
  commentHead: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 5 },
  commentAuthor: { color: colors.ink, fontFamily: fonts.bold, fontSize: 13 },
  commentBody: { color: colors.inkSoft, fontFamily: fonts.regular, fontSize: 14, lineHeight: 19 },
  commentDate: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, marginTop: 5 },

  composer: {
    flexDirection: "row",
    alignItems: "flex-end",
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  composerInput: {
    flex: 1,
    maxHeight: 100,
    minHeight: 40,
    backgroundColor: colors.surface2,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingTop: 10,
    paddingBottom: 10,
    color: colors.ink,
    fontFamily: fonts.regular,
    fontSize: 14,
  },
  sendBtn: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  sendBtnDisabled: { backgroundColor: colors.line2 },
});

export default withBoundary(RecoDetailScreen, "Idea detail");
