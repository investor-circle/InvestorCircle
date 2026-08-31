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
import { fmtDate } from "../../src/utils/format";
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
  deleteRecommendation,
} from "../../src/services/api/recommendationsApi";
import { useAuth } from "../../src/context/AuthContext";
import { colors, fonts } from "../../src/theme/colors";
import { withBoundary } from "../../src/components/ErrorBoundary";

function RecoDetailScreen() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { profile, user } = useAuth();
  const reco = getReco(id); // handed over from the list; instant, no refetch

  const [eng, setEng] = useState(null); // { likes, myReaction, tracking, comments }
  const [comment, setComment] = useState("");
  const [posting, setPosting] = useState(false);
  const [exited, setExited] = useState(!!reco?.exitSignal);
  const [ownerBusy, setOwnerBusy] = useState(false);
  const mounted = useRef(true);

  // Owner-only controls. The server independently enforces that only the
  // recommender may exit or delete — this just decides what to render.
  const isOwner = !!user?.uid && (reco?.from === user.uid || reco?.recommender_id === user.uid);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      const data = await getEngagement(id);
      if (mounted.current) setEng(data);
    })();
    return () => {
      mounted.current = false;
    };
  }, [id]);

  const liked = eng?.myReaction === "like";
  const likeCount = eng?.likes ?? reco?.likes ?? 0;
  const isTracked = !!eng?.tracking;
  const isInvested = !!eng?.tracking?.isInvested;

  const toggleLike = useCallback(async () => {
    if (!eng) return;
    const next = liked ? null : "like";
    setEng((e) => ({ ...e, myReaction: next, likes: Math.max(0, (e.likes || 0) + (next ? 1 : -1)) }));
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
    await trackReco(id, next, next ? reco?.price ?? undefined : undefined);
  }, [eng, isInvested, id, reco?.price]);

  const toggleExit = useCallback(async () => {
    setOwnerBusy(true);
    const next = !exited;
    // Exit price is stamped server-side from market data; don't invent one.
    const res = next ? await setExitSignal(id) : await cancelExitSignal(id);
    if (mounted.current) {
      if (res) setExited(next);
      setOwnerBusy(false);
    }
  }, [exited, id]);

  const confirmDelete = useCallback(() => {
    Alert.alert("Delete this idea?", "This removes it for everyone it was shared with. This can't be undone.", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setOwnerBusy(true);
          const ok = await deleteRecommendation(id);
          if (!mounted.current) return;
          setOwnerBusy(false);
          if (ok) router.back();
          else Alert.alert("Couldn't delete", "Please try again.");
        },
      },
    ]);
  }, [id, router]);

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
        <View style={{ width: 24 }} />
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
              <Text style={styles.missingText}>This idea isn't available. Open it from your feed.</Text>
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

          {/* Owner-only: exit signal + delete */}
          {isOwner ? (
            <View style={styles.ownerBar}>
              {ownerBusy ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <>
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
                  <Pressable style={[styles.ownerBtn, styles.ownerBtnDanger]} onPress={confirmDelete}>
                    <Ionicons name="trash-outline" size={17} color={colors.loss} />
                    <Text style={[styles.ownerText, { color: colors.loss }]}>Delete</Text>
                  </Pressable>
                </>
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
                <Text style={styles.commentAuthor}>{c.userName || c.user_name || "User"}</Text>
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
  ownerBtnDanger: { borderColor: colors.lossSoft, backgroundColor: colors.lossSoft },
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
  commentAuthor: { color: colors.ink, fontFamily: fonts.bold, fontSize: 13, marginBottom: 3 },
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
