import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { searchPeople, getDiscoverMore } from "../src/services/api/peopleApi";
import { sendConnectionRequest } from "../src/services/api/connectionsApi";
import { track } from "../src/services/analytics";
import { iciFromStatsRow } from "../src/utils/ici";
import Avatar from "../src/components/Avatar";
import IciBadge from "../src/components/IciBadge";
import TrackButton from "../src/components/TrackButton";
import SelectField from "../src/components/SelectField";
import { primeAvatars } from "../src/services/avatarCache";
import { colors, fonts } from "../src/theme/colors";
import { withBoundary } from "../src/components/ErrorBoundary";

// Discover investors — mirrors the web's DiscoverPeoplePage
// (src/features/onboarding/Onboarding.jsx) exactly: same candidate pool
// (discover-more, which already excludes anyone the caller tracks or is
// connected to), same sort options, and the same "Recommended for you" /
// "Explore more investors" split — top 6 by the blended score vs everyone
// else, in the SAME order, shown only when sorting by "Recommended" with an
// empty search box. Reached from the top-bar Discover icon and from
// Profile > Discover investors — the same page either way, same as web.
const SORTS = [
  { id: "recommended", label: "Recommended" },
  { id: "name", label: "Name (A–Z)" },
  { id: "ici", label: "ICI score" },
  { id: "ideas", label: "Ideas posted" },
];
const SORT_LABEL = Object.fromEntries(SORTS.map((s) => [s.id, s.label]));

function PeopleScreen() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [sort, setSort] = useState("recommended");
  const [candidates, setCandidates] = useState(null); // discover-more rows, raw
  const [searchResults, setSearchResults] = useState(null);
  const [sent, setSent] = useState({}); // userId -> 'pending' | 'done' | 'error'
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      const people = await getDiscoverMore();
      if (!mounted.current) return;
      setCandidates(people || []);
      primeAvatars((people || []).map((p) => p.id));
    })();
    return () => {
      mounted.current = false;
    };
  }, []);

  // Debounced server search — the endpoint needs q.length >= 2. While a
  // search is active it replaces the candidate pool entirely, same as web
  // (the split only ever applies to the unsearched "browse" pool).
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setSearchResults(null);
      return;
    }
    const t = setTimeout(async () => {
      const people = await searchPeople(term, 30);
      if (mounted.current) {
        setSearchResults(people);
        primeAvatars((people || []).map((p) => p.id));
      }
    }, 350);
    return () => clearTimeout(t);
  }, [q]);

  const connect = useCallback(async (person) => {
    setSent((s) => ({ ...s, [person.id]: "pending" }));
    const res = await sendConnectionRequest(person.id);
    if (res) track("connection_sent");
    if (!mounted.current) return;
    setSent((s) => ({ ...s, [person.id]: res?.error ? "error" : "done" }));
  }, []);

  // Same blended "recommended" ranking as the web (Onboarding.jsx
  // DiscoverPeoplePage): ici score + 2x idea count, descending.
  const withIci = useMemo(
    () => (candidates || []).map((p) => ({ ...p, ici: iciFromStatsRow(p) || { score: 0 }, total: Number(p.total) || 0 })),
    [candidates]
  );

  const sorted = useMemo(() => {
    const pool = searchResults
      ? searchResults.map((p) => ({ ...p, ici: iciFromStatsRow(p) || { score: 0 }, total: Number(p.total) || 0 }))
      : [...withIci];
    switch (sort) {
      case "name":
        return pool.sort((a, b) => (a.full_name || a.username || "").localeCompare(b.full_name || b.username || ""));
      case "ici":
        return pool.sort((a, b) => (b.ici.score || 0) - (a.ici.score || 0));
      case "ideas":
        return pool.sort((a, b) => b.total - a.total);
      case "recommended":
      default:
        return pool.sort((a, b) => (b.ici.score + b.total * 2) - (a.ici.score + a.total * 2));
    }
  }, [withIci, searchResults, sort]);

  // The split only shows for the default "Recommended" sort with no active
  // search — exactly the web's showSplit condition.
  const showSplit = sort === "recommended" && !q.trim() && !searchResults;

  const listData = useMemo(() => {
    if (candidates === null) return [];
    if (!showSplit) {
      return [
        { type: "header", key: "h-results", label: searchResults ? `Results${sorted.length ? ` · ${sorted.length}` : ""}` : "All investors" },
        ...sorted.map((p) => ({ type: "person", key: String(p.id), person: p })),
      ];
    }
    const recommended = sorted.slice(0, 6);
    const rest = sorted.slice(6);
    const out = [
      { type: "header", key: "h-rec", label: "Recommended for you" },
      ...recommended.map((p) => ({ type: "person", key: String(p.id), person: p })),
    ];
    if (rest.length) {
      out.push({ type: "header", key: "h-rest", label: "Explore more investors" });
      out.push(...rest.map((p) => ({ type: "person", key: String(p.id), person: p })));
    }
    return out;
  }, [candidates, sorted, showSplit, searchResults]);

  const renderItem = ({ item }) => {
    if (item.type === "header") {
      return <Text style={styles.sectionLabel}>{item.label}</Text>;
    }
    const p = item.person;
    const state = sent[p.id];
    return (
      <View style={styles.row}>
        <Pressable style={styles.rowMain} onPress={() => p.username && router.push(`/investor/${p.username}`)}>
          <Avatar uid={p.id} name={p.full_name} size={44} gradient />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.name} numberOfLines={1}>
              {p.full_name || "Investor"}
            </Text>
            <View style={styles.metaRow}>
              <IciBadge ici={p.ici} size="sm" />
              {p.username ? (
                <Text style={styles.username} numberOfLines={1}>
                  @{p.username}
                </Text>
              ) : null}
              {p.total > 0 ? (
                <Text style={styles.ideasCount} numberOfLines={1}>
                  {p.total} idea{p.total === 1 ? "" : "s"}
                </Text>
              ) : null}
            </View>
          </View>
        </Pressable>

        <View style={styles.actions}>
          <TrackButton targetId={p.id} initialTracking={false} compact />
          {state === "pending" ? (
            <ActivityIndicator color={colors.accent} />
          ) : state === "done" ? (
            <Text style={styles.sentTag}>Requested</Text>
          ) : (
            <Pressable style={styles.connectBtn} onPress={() => connect(p)}>
              <Ionicons name="person-add-outline" size={13} color="#fff" />
              <Text style={styles.connectText}>Connect</Text>
            </Pressable>
          )}
        </View>
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 40 }}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle}>Discover investors</Text>
        <View style={{ width: 40 }} />
      </View>

      <View style={styles.controls}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.muted} />
          <TextInput
            style={styles.search}
            placeholder="Search by name or @username"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            value={q}
            onChangeText={setQ}
            returnKeyType="search"
          />
          {q ? (
            <Pressable onPress={() => setQ("")} hitSlop={8}>
              <Ionicons name="close-circle" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
        <View style={styles.sortWrap}>
          <Text style={styles.sortLabel}>Sort by</Text>
          <SelectField value={SORT_LABEL[sort]} onChange={(label) => setSort(SORTS.find((s) => s.label === label)?.id || "recommended")} options={SORTS.map((s) => s.label)} />
        </View>
      </View>

      {candidates === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : (
        <FlatList
          data={listData}
          keyExtractor={(item) => item.key}
          renderItem={renderItem}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={listData.length === 0 ? styles.emptyWrap : { paddingBottom: 24 }}
          ListEmptyComponent={
            <View style={styles.empty}>
              <Ionicons name="search-outline" size={38} color={colors.line2} />
              <Text style={styles.emptyTitle}>{searchResults ? "No investors match that search" : "No suggestions right now"}</Text>
              <Text style={styles.emptySub}>
                {searchResults ? "Try a different name or username." : "Check back once more investors join."}
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
  topTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 17 },
  controls: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 4, gap: 10 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
  },
  search: { flex: 1, paddingVertical: 11, color: colors.ink, fontFamily: fonts.regular, fontSize: 15 },
  sortWrap: { flexDirection: "row", alignItems: "center", gap: 10 },
  sortLabel: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 12.5, width: 52 },
  sectionLabel: {
    color: colors.muted,
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 6,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingHorizontal: 16, paddingVertical: 9 },
  rowMain: { flexDirection: "row", alignItems: "center", gap: 12, flex: 1, minWidth: 0 },
  name: { color: colors.ink, fontFamily: fonts.bold, fontSize: 15 },
  metaRow: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3, flexWrap: "wrap" },
  username: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12.5 },
  ideasCount: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12.5 },
  actions: { flexDirection: "column", alignItems: "flex-end", gap: 6 },
  connectBtn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: 999,
    paddingHorizontal: 11,
    paddingVertical: 6,
    minWidth: 84,
  },
  connectText: { color: colors.inkSoft, fontFamily: fonts.bold, fontSize: 12 },
  sentTag: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 12 },
  emptyWrap: { flexGrow: 1 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, paddingTop: 60 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 16, marginTop: 12, textAlign: "center" },
  emptySub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, textAlign: "center", marginTop: 6 },
});

export default withBoundary(PeopleScreen, "Discover investors");
