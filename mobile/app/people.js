import { useCallback, useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, FlatList, Pressable, TextInput, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { searchPeople, getDiscoverMore } from "../src/services/api/peopleApi";
import { sendConnectionRequest } from "../src/services/api/connectionsApi";
import { track } from "../src/services/analytics";
import Avatar from "../src/components/Avatar";
import { primeAvatars } from "../src/services/avatarCache";
import { colors, fonts } from "../src/theme/colors";
import { withBoundary } from "../src/components/ErrorBoundary";

// Find investors — search by name/username, or browse the server's
// discover-more candidates (people the caller doesn't already track/know).
function PeopleScreen() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [results, setResults] = useState(null);
  const [suggested, setSuggested] = useState([]);
  const [sent, setSent] = useState({}); // userId -> 'pending' | 'done' | 'error'
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      const people = await getDiscoverMore();
      if (mounted.current) {
        setSuggested(people);
        primeAvatars((people || []).map((p) => p.id));
      }
    })();
    return () => {
      mounted.current = false;
    };
  }, []);

  // Debounced search — the endpoint needs q.length >= 2.
  useEffect(() => {
    const term = q.trim();
    if (term.length < 2) {
      setResults(null);
      return;
    }
    const t = setTimeout(async () => {
      const people = await searchPeople(term, 30);
      if (mounted.current) {
        setResults(people);
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

  const list = results ?? suggested;

  const renderItem = ({ item }) => {
    const state = sent[item.id];
    return (
      <View style={styles.row}>
        <Pressable
          style={styles.rowMain}
          onPress={() => item.username && router.push(`/investor/${item.username}`)}
        >
          <Avatar uid={item.id} name={item.full_name} size={44} gradient />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.name} numberOfLines={1}>
              {item.full_name || "Investor"}
            </Text>
            {item.username ? (
              <Text style={styles.username} numberOfLines={1}>
                @{item.username}
              </Text>
            ) : null}
          </View>
        </Pressable>

        {state === "pending" ? (
          <ActivityIndicator color={colors.accent} />
        ) : state === "done" ? (
          <Text style={styles.sentTag}>Requested</Text>
        ) : (
          <Pressable style={styles.connectBtn} onPress={() => connect(item)}>
            <Ionicons name="person-add-outline" size={15} color="#fff" />
            <Text style={styles.connectText}>Connect</Text>
          </Pressable>
        )}
      </View>
    );
  };

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 40 }}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle}>Find investors</Text>
        <Pressable onPress={() => router.push("/suggested")} hitSlop={10} style={{ width: 40, alignItems: "flex-end" }}>
          <Ionicons name="sparkles-outline" size={21} color={colors.accent} />
        </Pressable>
      </View>

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

      <Text style={styles.sectionLabel}>
        {results ? `Results${results.length ? ` · ${results.length}` : ""}` : "Suggested for you"}
      </Text>

      <FlatList
        data={list}
        keyExtractor={(p) => String(p.id)}
        renderItem={renderItem}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={list.length === 0 ? styles.emptyWrap : { paddingBottom: 24 }}
        ListEmptyComponent={
          <View style={styles.empty}>
            <Ionicons name="search-outline" size={38} color={colors.line2} />
            <Text style={styles.emptyTitle}>
              {results ? "No investors match that search" : "No suggestions right now"}
            </Text>
            <Text style={styles.emptySub}>
              {results ? "Try a different name or username." : "Search by name or @username to find people."}
            </Text>
          </View>
        }
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
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.surface,
  },
  topTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 17 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 12,
    paddingHorizontal: 14,
    marginHorizontal: 16,
    marginTop: 16,
  },
  search: { flex: 1, paddingVertical: 11, color: colors.ink, fontFamily: fonts.regular, fontSize: 15 },
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
  username: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, marginTop: 1 },
  connectBtn: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  connectText: { color: "#fff", fontFamily: fonts.bold, fontSize: 12 },
  sentTag: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 12 },
  emptyWrap: { flexGrow: 1 },
  empty: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 40, paddingTop: 60 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 16, marginTop: 12, textAlign: "center" },
  emptySub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, textAlign: "center", marginTop: 6 },
});

export default withBoundary(PeopleScreen, "Find investors");
