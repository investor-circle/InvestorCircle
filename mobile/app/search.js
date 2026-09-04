import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  ActivityIndicator,
  SectionList,
  Keyboard,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { searchPeople } from "../src/services/api/peopleApi";
import { loadInstruments } from "../src/services/instrumentCache";
import { searchInstruments } from "../src/utils/instruments";
import { primeAvatars } from "../src/services/avatarCache";
import Avatar from "../src/components/Avatar";
import { colors, fonts } from "../src/theme/colors";
import { withBoundary } from "../src/components/ErrorBoundary";

/**
 * Global search — investors and stocks, in one box.
 *
 * WHY: the web has this in its header, covering both. The app had
 * people-only search buried at Profile → Find investors, and no way to look
 * up a stock from a standing start at all — the instrument list existed only
 * inside the new-idea and add-holding pickers, which you can't reach unless
 * you are already posting something.
 *
 * The two halves are searched DIFFERENTLY on purpose, and both mirror the web:
 *
 *   • People go to the server (people-search), because the member list is not
 *     something a client can hold.
 *   • Instruments are matched locally against the cached instrument master,
 *     because it is already downloaded for the pickers and a per-keystroke
 *     round trip to filter a list we have would be slower and worse offline.
 *
 * Both require two characters, which is what the server enforces for people;
 * applying the same floor to stocks keeps one rule for the user rather than
 * a box that half-responds at one character.
 */
const MIN_QUERY = 2;
const DEBOUNCE_MS = 250;

function SearchScreen() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [people, setPeople] = useState([]);
  const [stocks, setStocks] = useState([]);
  const [busy, setBusy] = useState(false);
  const [searched, setSearched] = useState(false);
  const mounted = useRef(true);
  // The instrument master, fetched once and reused for every keystroke.
  const instruments = useRef([]);
  // Bumped when the list arrives, so a query typed BEFORE it loaded is
  // re-matched against it. Without this, opening search and typing straight
  // away — which is exactly what autoFocus invites — left stock results
  // permanently empty for that query.
  const [instrumentsReady, setInstrumentsReady] = useState(0);

  useEffect(() => {
    mounted.current = true;
    loadInstruments()
      .then((all) => {
        if (!mounted.current) return;
        instruments.current = all || [];
        setInstrumentsReady((n) => n + 1);
      })
      .catch(() => {
        /* stock results simply stay empty; people search is unaffected */
      });
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    const term = q.trim();
    if (term.length < MIN_QUERY) {
      setPeople([]);
      setStocks([]);
      setSearched(false);
      setBusy(false);
      return undefined;
    }

    // Local matching is instant, so it happens immediately rather than
    // waiting out the debounce that exists for the network half.
    setStocks(searchInstruments(instruments.current, term, 12));
    setBusy(true);
    const t = setTimeout(async () => {
      const found = await searchPeople(term, 20).catch(() => []);
      if (!mounted.current) return;
      setPeople(found);
      setBusy(false);
      setSearched(true);
      primeAvatars(found.map((p) => p.id));
    }, DEBOUNCE_MS);
    return () => clearTimeout(t);
  }, [q, instrumentsReady]);

  const openPerson = useCallback(
    (p) => {
      // Someone with no username has no public profile to open; the row is
      // rendered non-tappable rather than navigating to a dead screen.
      if (!p?.username) return;
      Keyboard.dismiss();
      router.push(`/investor/${encodeURIComponent(p.username)}`);
    },
    [router]
  );

  const openStock = useCallback(
    (inst) => {
      Keyboard.dismiss();
      router.push(`/ticker/${encodeURIComponent(String(inst.symbol).toUpperCase())}`);
    },
    [router]
  );

  const sections = [];
  if (people.length) sections.push({ title: "Investors", data: people, kind: "person" });
  if (stocks.length) sections.push({ title: "Stocks", data: stocks, kind: "stock" });

  const term = q.trim();
  const nothing = term.length >= MIN_QUERY && searched && !busy && !sections.length;

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 36 }}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <View style={styles.box}>
          <Ionicons name="search" size={16} color={colors.muted} />
          <TextInput
            style={styles.input}
            placeholder="Investors and stocks"
            placeholderTextColor={colors.muted}
            value={q}
            onChangeText={setQ}
            autoFocus
            autoCorrect={false}
            autoCapitalize="none"
            returnKeyType="search"
          />
          {q ? (
            <Pressable onPress={() => setQ("")} hitSlop={8}>
              <Ionicons name="close-circle" size={17} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      </View>

      <SectionList
        sections={sections}
        keyExtractor={(item, i) => String(item.id ?? item.symbol ?? i)}
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingBottom: 32 }}
        renderSectionHeader={({ section }) => <Text style={styles.sectionHead}>{section.title}</Text>}
        renderItem={({ item, section }) =>
          section.kind === "person" ? (
            <Pressable
              style={[styles.row, !item.username && { opacity: 0.55 }]}
              onPress={() => openPerson(item)}
              disabled={!item.username}
            >
              <Avatar profile={item} uid={item.id} name={item.full_name} size={38} />
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.full_name || item.username || "Investor"}
                </Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {item.username ? `@${item.username}` : "No public profile yet"}
                </Text>
              </View>
              {item.username ? (
                <Ionicons name="chevron-forward" size={17} color={colors.muted} />
              ) : null}
            </Pressable>
          ) : (
            <Pressable style={styles.row} onPress={() => openStock(item)}>
              <View style={styles.tickerBadge}>
                <Text style={styles.tickerBadgeText}>{String(item.symbol || "?").slice(0, 4)}</Text>
              </View>
              <View style={{ flex: 1, minWidth: 0 }}>
                <Text style={styles.rowTitle} numberOfLines={1}>
                  {item.symbol}
                </Text>
                <Text style={styles.rowSub} numberOfLines={1}>
                  {item.name || "—"}
                  {item.exchange ? ` · ${item.exchange}` : ""}
                </Text>
              </View>
              <Ionicons name="chevron-forward" size={17} color={colors.muted} />
            </Pressable>
          )
        }
        ListFooterComponent={
          busy && !sections.length ? (
            <ActivityIndicator color={colors.accent} style={{ marginTop: 28 }} />
          ) : null
        }
        ListEmptyComponent={
          busy ? null : (
            <View style={styles.empty}>
              <Ionicons
                name={nothing ? "search-outline" : "compass-outline"}
                size={38}
                color={colors.line2}
              />
              <Text style={styles.emptyTitle}>
                {nothing ? `Nothing matching "${term}"` : "Search investors and stocks"}
              </Text>
              <Text style={styles.emptySub}>
                {nothing
                  ? "Try a different name, @username or ticker."
                  : "Type at least two characters — a name, a @username, or a ticker like INFY."}
              </Text>
            </View>
          )
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
    gap: 6,
    paddingHorizontal: 10,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.surface,
  },
  box: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    backgroundColor: colors.surface2,
    borderRadius: 11,
    paddingHorizontal: 12,
  },
  input: { flex: 1, paddingVertical: 10, color: colors.ink, fontFamily: fonts.regular, fontSize: 15 },
  sectionHead: {
    color: colors.muted,
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    paddingHorizontal: 16,
    paddingTop: 18,
    paddingBottom: 6,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    paddingHorizontal: 16,
    paddingVertical: 11,
  },
  rowTitle: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 15 },
  rowSub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12.5, marginTop: 2 },
  tickerBadge: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: colors.accentSoft,
    alignItems: "center",
    justifyContent: "center",
  },
  tickerBadgeText: { color: colors.accentInk, fontFamily: fonts.extrabold, fontSize: 11 },
  empty: { alignItems: "center", paddingHorizontal: 40, paddingTop: 70, gap: 8 },
  emptyTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 15, marginTop: 6, textAlign: "center" },
  emptySub: {
    color: colors.muted,
    fontFamily: fonts.regular,
    fontSize: 13,
    lineHeight: 20,
    textAlign: "center",
  },
});

export default withBoundary(SearchScreen, "Search");
