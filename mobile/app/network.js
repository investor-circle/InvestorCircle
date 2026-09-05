import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, ActivityIndicator, RefreshControl } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter, useLocalSearchParams } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import {
  getMyConnections,
  acceptConnection,
  rejectConnection,
  removeConnection,
} from "../src/services/api/connectionsApi";
import { track } from "../src/services/analytics";
import { getMyTrackingList, getMyTrackers, getTrackingCounts } from "../src/services/api/trackingApi";
import { getMyReceivedRecos } from "../src/services/api/recommendationsApi";
import { getMyTrackedRecos } from "../src/services/api/engagementApi";
import TrackButton from "../src/components/TrackButton";
import Avatar from "../src/components/Avatar";
import { primeAvatars } from "../src/services/avatarCache";
import { fmtSigned, recoStats } from "../src/utils/format";
import { colors, fonts } from "../src/theme/colors";
import { withBoundary } from "../src/components/ErrorBoundary";

// Connections are mutual and need acceptance; tracking is one-way and does
// not. They are different relationships, so they get different tabs rather
// than one merged "network" list — same split as the web Network page.
const TABS = [
  { id: "connections", label: "Connections" },
  { id: "requests", label: "Requests" },
  { id: "tracking", label: "Tracking" },
  { id: "trackers", label: "Tracking me" },
];

function NetworkScreen() {
  const router = useRouter();
  // ?tab= lets a notification land on the right list: "N people started
  // tracking you" is about Tracking me, and opening on Connections makes the
  // reader hunt for what they were just told about.
  const { tab: initialTab } = useLocalSearchParams();
  const [tab, setTab] = useState(
    TABS.some((t) => t.id === initialTab) ? String(initialTab) : "connections"
  );
  const [rows, setRows] = useState(null);
  const [refreshing, setRefreshing] = useState(false);
  const [busy, setBusy] = useState({}); // connectionId -> true while a mutation runs
  const [tracking, setTracking] = useState(null);
  const [trackers, setTrackers] = useState(null);
  const [counts, setCounts] = useState({ trackingCount: 0, trackersCount: 0 });
  // "My P&L" per connection (see recoStats/getClosedInfo in src/utils/format.js
  // — a byte-for-byte port of the web's own formula) needs both the ideas
  // this person delivered directly AND ones tracked from their public
  // profile, exactly the union the web's ContactsSection builds.
  const [recsReceived, setRecsReceived] = useState([]);
  const [trackedRecos, setTrackedRecos] = useState([]);
  const [pnlExplainerOpen, setPnlExplainerOpen] = useState(false);
  const mounted = useRef(true);

  const load = useCallback(async () => {
    // All independent endpoints, so they are fetched together rather than
    // one-per-tab-switch: the counts are needed for the badges immediately
    // anyway, and serialising them would make every tab switch feel slow
    // (see CLAUDE.md on avoidable sequential round-trips).
    const [conns, tr, trs, cnt, received, tracked] = await Promise.all([
      getMyConnections(),
      getMyTrackingList(50),
      getMyTrackers(50),
      getTrackingCounts(),
      getMyReceivedRecos(),
      getMyTrackedRecos(),
    ]);
    if (!mounted.current) return;
    setRows(conns);
    setTracking(tr.people);
    setTrackers(trs.people);
    setCounts(cnt);
    setRecsReceived(received);
    setTrackedRecos(tracked);
    // After the rows are on screen, not before: pictures fill in behind them.
    primeAvatars([
      ...(conns || []).map((c) => c.user_id),
      ...(tr.people || []).map((p) => p.id ?? p.user_id),
      ...(trs.people || []).map((p) => p.id ?? p.user_id),
    ]);
  }, []);

  useEffect(() => {
    mounted.current = true;
    load();
    return () => {
      mounted.current = false;
    };
  }, [load]);

  const onRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
  };

  const all = rows || [];
  const active = all.filter((c) => c.status === "accepted");
  const incoming = all.filter((c) => c.status === "pending" && c.direction === "received");
  const outgoing = all.filter((c) => c.status === "pending" && c.direction === "sent");
  const list =
    tab === "connections"
      ? active
      : tab === "requests"
      ? [...incoming, ...outgoing]
      : tab === "tracking"
      ? tracking || []
      : trackers || [];

  const isPeopleTab = tab === "tracking" || tab === "trackers";

  // Same union the web builds (Connections.jsx pnlFor): the received copy of
  // an idea wins on overlap (it carries reaction/likes), a tracked-only idea
  // is normalised to the same shape recoStats() reads everywhere else.
  const pnlFor = useCallback(
    (c) => {
      const received = recsReceived.filter((r) => r.from === c.user_id);
      const receivedIds = new Set(received.map((r) => r.id));
      const trackedOnly = trackedRecos
        .filter((r) => r.recommender_id === c.user_id && !receivedIds.has(r.id))
        .map((r) => ({
          id: r.id,
          invested: r.is_invested,
          investedPrice: r.invested_price != null ? Number(r.invested_price) : null,
          priceAt: Number(r.reco_price || 0),
          price: Number(r.current_price || 0),
          exitSignal: r.exit_signal,
          exitPrice: r.exit_price != null ? Number(r.exit_price) : null,
          targetDate: r.target_date,
          expiryPrice: r.expiry_price != null ? Number(r.expiry_price) : null,
        }));
      return recoStats([...received, ...trackedOnly], () => true);
    },
    [recsReceived, trackedRecos]
  );

  const withBusy = (id, fn) => async () => {
    setBusy((b) => ({ ...b, [id]: true }));
    await fn();
    if (mounted.current) {
      setBusy((b) => ({ ...b, [id]: false }));
      await load();
    }
  };

  const renderItem = ({ item }) => {
    const isIncoming = item.status === "pending" && item.direction === "received";
    const isOutgoing = item.status === "pending" && item.direction === "sent";
    const isAccepted = item.status === "accepted";
    const pnlInfo = isAccepted ? pnlFor(item) : null;
    return (
      <View style={styles.row}>
        <Avatar uid={item.user_id} name={item.name} size={44} gradient />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name} numberOfLines={1}>
            {item.name || "Investor"}
          </Text>
          {item.username ? (
            <Text style={styles.username} numberOfLines={1}>
              @{item.username}
            </Text>
          ) : null}
        </View>

        {/* My P&L — same formula and description as the web (recoStats() in
            src/utils/format.js, ported verbatim): a directional signal from
            a flat hypothetical stake on ideas marked "invested", not real
            money. Shown only for an accepted connection, same as the web. */}
        {isAccepted && pnlInfo ? (
          <View style={styles.pnlBox}>
            <Text style={[styles.pnlValue, { color: pnlInfo.pnl >= 0 ? colors.gain : colors.loss }]}>
              {fmtSigned(pnlInfo.pnl)}
            </Text>
            <Text style={styles.pnlLabel}>My P&L{pnlInfo.pnlPending > 0 ? " *" : ""}</Text>
          </View>
        ) : null}

        {busy[item.connection_id] ? (
          <ActivityIndicator color={colors.accent} />
        ) : isIncoming ? (
          <View style={styles.actionsRow}>
            <Pressable style={styles.acceptBtn} onPress={withBusy(item.connection_id, () =>
                acceptConnection(item.connection_id).then((r) => {
                  track("connection_accepted");
                  return r;
                })
              )}>
              <Text style={styles.acceptText}>Accept</Text>
            </Pressable>
            <Pressable style={styles.rejectBtn} onPress={withBusy(item.connection_id, () => rejectConnection(item.connection_id))}>
              <Ionicons name="close" size={18} color={colors.muted} />
            </Pressable>
          </View>
        ) : isOutgoing ? (
          <Text style={styles.pendingTag}>Requested</Text>
        ) : (
          <Pressable style={styles.removeBtn} onPress={withBusy(item.connection_id, () => removeConnection(item.connection_id))}>
            <Ionicons name="person-remove-outline" size={18} color={colors.muted} />
          </Pressable>
        )}
      </View>
    );
  };

  // A tracked/tracking person is a plain profile row, not a connection: there
  // is no request to accept or reject, only the one-way toggle. On the
  // "Tracking me" tab the toggle reflects whether YOU track THEM back, which
  // is independent of them tracking you — so it fetches its own status there
  // rather than assuming symmetry.
  const renderPerson = ({ item }) => {
    const uid = item.id ?? item.user_id;
    const name = item.name || item.full_name || item.username || "Investor";
    return (
      <Pressable
        style={styles.row}
        onPress={() => item.username && router.push(`/investor/${encodeURIComponent(item.username)}`)}
        disabled={!item.username}
      >
        <Avatar profile={item} uid={uid} name={name} size={42} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.name} numberOfLines={1}>
            {name}
          </Text>
          {item.username ? (
            <Text style={styles.sub} numberOfLines={1}>
              @{item.username}
            </Text>
          ) : null}
        </View>
        <TrackButton
          targetId={uid}
          initialTracking={tab === "tracking" ? true : undefined}
          compact
          onChange={(now) => {
            // Keep the list honest when someone untracks from this screen:
            // the row should leave the Tracking tab, not sit there contradicting
            // its own button.
            if (tab === "tracking" && !now) {
              setTracking((p) => (p || []).filter((x) => String(x.id ?? x.user_id) !== String(uid)));
              setCounts((c) => ({ ...c, trackingCount: Math.max(0, c.trackingCount - 1) }));
            }
          }}
        />
      </Pressable>
    );
  };

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 40 }}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle}>Your network</Text>
        <View style={{ width: 40 }} />
      </View>

      {/* "Grow your network" — the web's own CTA on this page (page-head's
          primary button, Connections.jsx), placed at the very top rather
          than a header-bar icon since mobile's header bar is already full
          (back + title). Routes to Find investors, the same destination as
          the web's "discover" page from here. */}
      <Pressable style={styles.growBtn} onPress={() => router.push("/people")}>
        <Ionicons name="person-add-outline" size={16} color="#fff" />
        <Text style={styles.growText}>Grow my network</Text>
      </Pressable>

      <View style={styles.tabs}>
        {TABS.map((t) => {
          const activeTab = tab === t.id;
          // Connections/requests counts come from the already-loaded list;
          // the tracking counts come from the dedicated counts endpoint,
          // which is cheap indexed COUNTs rather than a list payload.
          const count =
            t.id === "connections"
              ? active.length
              : t.id === "requests"
              ? incoming.length
              : t.id === "tracking"
              ? counts.trackingCount
              : counts.trackersCount;
          return (
            // Two lines (label, then count) rather than one "Label · N"
            // string — matches the web's own fix for this exact tab row
            // (Connections.jsx: "a single row of 4 short, fixed-height
            // buttons that can neither wrap into a ragged multi-row mess nor
            // need to scroll"). One line risked "Tracking me · 12" clipping
            // or overflowing a narrow tab on a normal phone width.
            <Pressable key={t.id} style={[styles.tab, activeTab && styles.tabActive]} onPress={() => setTab(t.id)}>
              <Text style={[styles.tabText, activeTab && styles.tabTextActive]} numberOfLines={1}>
                {t.label}
              </Text>
              {count > 0 ? (
                <Text style={[styles.tabCount, activeTab && styles.tabTextActive]}>{count}</Text>
              ) : null}
            </Pressable>
          );
        })}
      </View>

      {/* "What is My P&L?" — same explanation text as the web, verbatim, so
          the number means the same thing on both clients. */}
      {tab === "connections" && active.length > 0 ? (
        <View style={styles.pnlNote}>
          <Ionicons name="information-circle-outline" size={16} color={colors.accentInk} />
          <Text style={styles.pnlNoteText}>
            <Text style={styles.pnlNoteBold}>What is My P&L? </Text>
            A directional signal, not real money.{" "}
            {pnlExplainerOpen ? (
              <Text>
                For each idea from that person you marked "invested" — whether they sent it to you directly or you
                tracked it from their public profile — it applies a flat hypothetical ₹1,000 stake to the move from
                your entry price to the idea's closing price (or its live price if still open), then adds those up
                per person. It shows whether following a connection's ideas has tended to be profitable — it isn't a
                record of what you actually put in or made.{" "}
              </Text>
            ) : null}
            <Text style={styles.pnlNoteLink} onPress={() => setPnlExplainerOpen((v) => !v)}>
              {pnlExplainerOpen ? "Show less" : "Read more"}
            </Text>
          </Text>
        </View>
      ) : null}

      {rows === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : (
        <FlatList
          data={list}
          keyExtractor={(c, i) => String(isPeopleTab ? c.id ?? c.user_id ?? i : c.connection_id)}
          renderItem={isPeopleTab ? renderPerson : renderItem}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} />}
          contentContainerStyle={list.length === 0 ? styles.emptyWrap : { paddingVertical: 8 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="people-outline" size={40} color={colors.line2} />
              <Text style={styles.emptyTitle}>
                {tab === "connections"
                  ? "No connections yet"
                  : tab === "requests"
                  ? "No pending requests"
                  : tab === "tracking"
                  ? "Not tracking anyone yet"
                  : "Nobody is tracking you yet"}
              </Text>
              <Text style={styles.emptySub}>
                {tab === "connections"
                  ? "Connect with other investors to see their ideas in your feed."
                  : tab === "requests"
                  ? "Connection requests will appear here."
                  : tab === "tracking"
                  ? "Track an investor to follow their ideas without needing them to accept."
                  : "People who track you will appear here."}
              </Text>
            </View>
          }
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.surface,
  },
  topTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 17, textAlign: "center" },
  growBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 7,
    marginHorizontal: 16,
    marginTop: 14,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 12,
  },
  growText: { color: "#fff", fontFamily: fonts.bold, fontSize: 14 },
  tabs: { flexDirection: "row", gap: 8, padding: 16 },
  tab: {
    flex: 1,
    minHeight: 44,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    gap: 2,
    paddingVertical: 6,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
  },
  tabActive: { backgroundColor: colors.accent, borderColor: colors.accent },
  tabText: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 12.5, textAlign: "center" },
  tabCount: { color: colors.muted, fontFamily: fonts.extrabold, fontSize: 13 },
  tabTextActive: { color: "#fff" },
  pnlBox: { alignItems: "flex-end", marginRight: 2 },
  pnlValue: { fontFamily: fonts.extrabold, fontSize: 14 },
  pnlLabel: { color: colors.muted, fontFamily: fonts.bold, fontSize: 8.5, letterSpacing: 0.3, marginTop: 1 },
  pnlNote: {
    flexDirection: "row",
    gap: 8,
    alignItems: "flex-start",
    backgroundColor: colors.accentSoft,
    borderRadius: 12,
    marginHorizontal: 16,
    marginBottom: 12,
    padding: 12,
  },
  pnlNoteText: { flex: 1, color: colors.inkSoft, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  pnlNoteBold: { fontFamily: fonts.bold, color: colors.ink },
  pnlNoteLink: { fontFamily: fonts.bold, color: colors.accentInk },
  row: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 10 },
  name: { color: colors.ink, fontFamily: fonts.bold, fontSize: 15 },
  username: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, marginTop: 1 },
  actionsRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  acceptBtn: { backgroundColor: colors.accent, borderRadius: 10, paddingHorizontal: 16, paddingVertical: 8 },
  acceptText: { color: "#fff", fontFamily: fonts.bold, fontSize: 13 },
  rejectBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  removeBtn: {
    width: 36,
    height: 36,
    borderRadius: 10,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.surface2,
  },
  pendingTag: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 13 },
  emptyWrap: { flexGrow: 1 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, paddingTop: 80 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 16, marginTop: 12 },
  emptySub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, textAlign: "center", marginTop: 6, lineHeight: 19 },
});

export default withBoundary(NetworkScreen, "Network");
