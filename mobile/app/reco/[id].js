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
import { Ionicons, Feather } from "@expo/vector-icons";
import RecoCard from "../../src/components/RecoCard";
import { getReco } from "../../src/utils/recoStore";
import { getPublicFeed } from "../../src/services/api/recommendationsApi";
import { mapPublicReco } from "../../src/utils/feed";
import { fmt, fmtDate } from "../../src/utils/format";
import { getTodayClose, sourceName } from "../../src/services/marketData";
import Avatar from "../../src/components/Avatar";
import { primeAvatars } from "../../src/services/avatarCache";
import { fetchProfileNavInfo } from "../../src/services/profileNav";
import { setLiked } from "../../src/services/reactionStore";
import { setTracked } from "../../src/services/trackStore";
import { track } from "../../src/services/analytics";
import {
  getEngagement,
  reactToReco,
  commentOnReco,
  trackReco,
  untrackReco,
} from "../../src/services/api/engagementApi";
import { searchPeople } from "../../src/services/api/peopleApi";
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
import InvestPriceModal from "../../src/components/InvestPriceModal";

// The @token, if any, ending exactly at the caret — mirrors the web's
// activeMentionQuery in Recommendations.jsx's RecoComments.
function activeMentionQuery(text, caret) {
  const upto = text.slice(0, caret);
  const m = upto.match(/(?:^|\s)@([a-zA-Z0-9_]{0,20})$/);
  return m ? { query: m[1], start: caret - m[1].length - 1 } : null;
}

// Renders comment text as plain strings + tappable spans for confirmed
// mentions (present in that comment's own server-resolved `mentions` list).
// Mirrors the web's renderCommentBody.
function renderCommentBody(text, mentions, onPressMention) {
  if (!text) return text;
  const usernames = new Set((mentions || []).map((m) => (m.username || "").toLowerCase()));
  if (!usernames.size) return text;
  return text.split(/(@[a-zA-Z0-9_]{5,20})/g).map((part, i) => {
    const m = part.match(/^@([a-zA-Z0-9_]{5,20})$/);
    if (m && usernames.has(m[1].toLowerCase())) {
      return (
        <Text key={i} style={styles.mention} onPress={() => onPressMention(m[1])}>
          {part}
        </Text>
      );
    }
    return part;
  });
}

function RecoDetailScreen() {
  const { id, username, highlightComment } = useLocalSearchParams();
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

  // @mention suggestion dropdown state — see activeMentionQuery above.
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [forcedSelection, setForcedSelection] = useState(null);
  const [mentionOpen, setMentionOpen] = useState(false);
  const [mentionResults, setMentionResults] = useState([]);
  const [mentionAnchor, setMentionAnchor] = useState(null);
  const mentionSeq = useRef(0);

  const scrollRef = useRef(null);
  const commentOffsets = useRef({}); // commentId -> y, captured via onLayout

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
    if (next) track("reco_liked");
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
    // Same reasoning as setLiked below: this screen does its own write, so it
    // tells the shared store the outcome rather than leaving the card behind
    // this screen to show stale state when the user goes back.
    setTracked(id, !isTracked);
  }, [eng, isTracked, id]);

  // Marking invested asks for the price actually paid (the web's
  // InvestPriceModal); unmarking is immediate, since there is nothing to ask.
  const setInvested = useCallback(async (next, atPrice) => {
    if (!eng) return;
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
        investedPrice: next ? atPrice ?? null : null,
        // The server no longer clobbers an unmentioned reaction, but this
        // app updates slowly (store builds are infrequent), so it keeps
        // sending its current value: correct against either server version.
        reaction: eng?.myReaction ?? null,
      });
      setReco((r) => (r ? { ...r, invested: next } : r));
    }
    await trackReco(id, next, next ? atPrice ?? undefined : undefined);
  }, [eng, id, reco?.deliveryId]);

  const [investOpen, setInvestOpen] = useState(false);
  const onInvestedPress = useCallback(() => {
    if (isInvested) setInvested(false);
    else setInvestOpen(true);
  }, [isInvested, setInvested]);

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

  const openProfile = useCallback(
    (username) => router.push(`/investor/${encodeURIComponent(username)}`),
    [router]
  );

  // A comment carries the commenter's name but not their username (only the
  // Circle feed selects recommender_username server-side) — same lookup
  // RecoCard's own author tap uses.
  const openCommentAuthor = useCallback(
    async (uid) => {
      if (!uid) return;
      const info = await fetchProfileNavInfo(uid);
      if (info?.username) openProfile(info.username);
    },
    [openProfile]
  );

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

  // Re-derive the @mention dropdown whenever either the text or the cursor
  // moves — recomputing from both (rather than reacting to text alone) is
  // what keeps this correct once RN delivers the onChangeText and
  // onSelectionChange events for the same keystroke slightly out of order.
  useEffect(() => {
    const active = activeMentionQuery(comment, selection.start);
    if (!active) {
      setMentionOpen(false);
      return;
    }
    setMentionAnchor(active.start);
    const seq = ++mentionSeq.current;
    if (active.query.length < 2) {
      setMentionResults([]);
      setMentionOpen(true);
      return;
    }
    searchPeople(active.query, 6).then((people) => {
      if (seq !== mentionSeq.current) return; // a newer keystroke has since fired
      setMentionResults(people);
      setMentionOpen(true);
    });
  }, [comment, selection.start]);

  const selectMention = useCallback(
    (person) => {
      if (mentionAnchor == null) return;
      const caret = selection.start;
      const next = `${comment.slice(0, mentionAnchor)}@${person.username} ${comment.slice(caret)}`;
      setComment(next);
      setMentionOpen(false);
      const pos = mentionAnchor + person.username.length + 2;
      setForcedSelection({ start: pos, end: pos });
      // Only forces the cursor for this one render — leaving `selection` a
      // controlled prop permanently causes cursor jumps on Android while
      // typing normally afterwards.
      setTimeout(() => setForcedSelection(null), 50);
    },
    [mentionAnchor, selection.start, comment]
  );

  // Deep-linked from a "mentioned you in a comment" notification — scroll to
  // and highlight the specific comment once its layout is known. Mirrors the
  // web's highlightCommentId handling in RecoComments.
  useEffect(() => {
    if (!highlightComment || !eng?.comments?.length) return;
    const y = commentOffsets.current[String(highlightComment)];
    if (y != null) {
      setTimeout(() => scrollRef.current?.scrollTo({ y: Math.max(0, y - 20), animated: true }), 250);
    }
  }, [highlightComment, eng]);

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={styles.backBtn}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle}>Idea</Text>
        <Pressable onPress={() => setShareOpen(true)} hitSlop={10} style={{ width: 24, alignItems: "flex-end" }}>
          <Ionicons name="share-social-outline" size={21} color={colors.accentInk} />
        </Pressable>
      </View>

      {/* Android's KeyboardAvoidingView `behavior` was previously undefined
          here, which is a no-op — nothing shrank the view to make room for
          the keyboard, so the composer sat hidden behind it. "height" is the
          standard fix: it resizes this view to fit above the keyboard,
          independent of the window's own softInputMode, and (unlike
          "position") without shifting the content that's still visible. */}
      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : "height"}>
        <ScrollView ref={scrollRef} contentContainerStyle={{ paddingBottom: 24 }} keyboardShouldPersistTaps="handled">
          {reco ? (
            // The card's own author name is the click-through to their
            // profile (see RecoCard's openAuthor) — a second "View profile"
            // CTA here duplicated it.
            <RecoCard reco={reco} showActions={false} expandThesis onOpenProfile={openProfile} />
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
            {/* Same icon/colour as the card's own like button (RecoCard's
                LikeButton) — this used to be a heart in loss-red, which read
                as a second, inconsistent like control rather than the same
                one carried onto the detail screen. */}
            <Pressable style={[styles.actionBtn, liked && styles.actionOnAccent]} onPress={toggleLike}>
              {/* Feather's outline thumbs-up — matches lucide-react's ThumbsUp
                  on the web (see RecoCard's LikeButton for the same swap). */}
              <Feather name="thumbs-up" size={16} color={liked ? colors.accentInk : colors.inkSoft} />
              <Text style={[styles.actionText, liked && { color: colors.accentInk }]}>{likeCount || "Like"}</Text>
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
            <Pressable style={[styles.actionBtn, isInvested && styles.actionOnGain]} onPress={onInvestedPress}>
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
            eng.comments.map((c) => {
              const uid = c.userId ?? c.user_id;
              const isHighlighted = String(c.id) === String(highlightComment);
              return (
                <View
                  key={String(c.id)}
                  style={[styles.comment, isHighlighted && styles.commentHighlighted]}
                  onLayout={(e) => {
                    commentOffsets.current[String(c.id)] = e.nativeEvent.layout.y;
                  }}
                >
                  <Pressable style={styles.commentHead} onPress={() => openCommentAuthor(uid)} disabled={!uid}>
                    <Avatar uid={uid} name={c.userName || c.user_name} size={26} />
                    <Text style={styles.commentAuthor}>{c.userName || c.user_name || "User"}</Text>
                  </Pressable>
                  <Text style={styles.commentBody}>
                    {renderCommentBody(c.comment, c.mentions, (uname) => router.push(`/investor/${uname}`))}
                  </Text>
                  <Text style={styles.commentDate}>{fmtDate(c.createdAt || c.created_at)}</Text>
                </View>
              );
            })
          )}
        </ScrollView>

        {/* Comment composer */}
        <View style={styles.composerWrap}>
          {mentionOpen && (
            <View style={styles.mentionDropdown}>
              <ScrollView keyboardShouldPersistTaps="always">
                {mentionResults.length === 0 ? (
                  <Text style={styles.mentionEmpty}>No matching investors</Text>
                ) : (
                  mentionResults.map((p) => (
                    <Pressable key={p.id} style={styles.mentionRow} onPress={() => selectMention(p)}>
                      <Avatar uid={p.id} name={p.full_name || p.username} size={24} />
                      <View style={{ minWidth: 0 }}>
                        <Text style={styles.mentionName} numberOfLines={1}>
                          {p.full_name || p.username}
                        </Text>
                        <Text style={styles.mentionUsername}>@{p.username}</Text>
                      </View>
                    </Pressable>
                  ))
                )}
              </ScrollView>
            </View>
          )}
          <View style={styles.composer}>
            <TextInput
              style={styles.composerInput}
              placeholder="Add a comment… (@ to mention someone)"
              placeholderTextColor={colors.muted}
              value={comment}
              onChangeText={setComment}
              onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
              selection={forcedSelection || undefined}
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
        </View>
      </KeyboardAvoidingView>

      <ShareRecoSheet visible={shareOpen} reco={reco} onClose={() => setShareOpen(false)} />
      <InvestPriceModal
        visible={investOpen}
        reco={reco}
        onClose={() => setInvestOpen(false)}
        onConfirm={(price) => {
          setInvestOpen(false);
          setInvested(true, price);
        }}
      />
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
  commentHighlighted: { borderColor: colors.accent, borderWidth: 1.5, backgroundColor: colors.accentSoft },
  mention: { color: colors.accentInk, fontFamily: fonts.bold },

  composerWrap: { position: "relative" },
  mentionDropdown: {
    position: "absolute",
    bottom: "100%",
    left: 12,
    right: 60,
    marginBottom: 6,
    maxHeight: 220,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    overflow: "hidden",
  },
  mentionRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 12, paddingVertical: 9 },
  mentionName: { color: colors.ink, fontFamily: fonts.bold, fontSize: 13 },
  mentionUsername: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11 },
  mentionEmpty: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, padding: 12 },

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
