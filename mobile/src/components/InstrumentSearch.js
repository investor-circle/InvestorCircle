import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, TextInput, Pressable, ActivityIndicator, ScrollView } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { loadInstruments } from "../services/instrumentCache";
import { searchInstruments, toSelection } from "../utils/instruments";
import { colors, fonts } from "../theme/colors";

const CURRENCY_SYMBOL = { INR: "₹", USD: "$", GBP: "£", EUR: "€" };

/**
 * Type-ahead over the instrument master, mirroring the web's InstrumentSearch.
 *
 * Picking a result fills in the name, sector, currency and asset class the
 * caller would otherwise have to type — which is the point: those fields feed
 * the nightly pricing job's instrument identity, so a typo'd symbol produces
 * a holding that never gets priced.
 *
 * Free text is still allowed. The instrument master doesn't cover everything,
 * and refusing to accept an unlisted symbol would be a regression against the
 * plain text input this replaces.
 */
export default function InstrumentSearch({ value, onChangeText, onSelect, placeholder, autoFocus }) {
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const mounted = useRef(true);
  // Guards against an older, slower load resolving after a newer keystroke
  // and repopulating the list with stale results.
  const querySeq = useRef(0);

  useEffect(() => {
    mounted.current = true;
    // Warm the cache so the first keystroke is instant.
    loadInstruments();
    return () => {
      mounted.current = false;
    };
  }, []);

  const handleChange = async (text) => {
    onChangeText(text);
    const seq = ++querySeq.current;

    if (!text || text.trim().length < 2) {
      setResults([]);
      setOpen(false);
      return;
    }

    setLoading(true);
    const all = await loadInstruments();
    if (!mounted.current || seq !== querySeq.current) return;

    const hits = searchInstruments(all, text);
    setResults(hits);
    setOpen(hits.length > 0);
    setLoading(false);
  };

  const choose = (inst) => {
    querySeq.current++;
    setOpen(false);
    setResults([]);
    onSelect(toSelection(inst));
  };

  return (
    <View>
      <View style={styles.inputWrap}>
        <TextInput
          style={styles.input}
          value={value}
          onChangeText={handleChange}
          placeholder={placeholder}
          placeholderTextColor={colors.muted}
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus={autoFocus}
        />
        {loading ? (
          <ActivityIndicator size="small" color={colors.muted} style={styles.spinner} />
        ) : value ? (
          <Pressable
            onPress={() => {
              handleChange("");
            }}
            hitSlop={8}
            style={styles.spinner}
          >
            <Ionicons name="close-circle" size={17} color={colors.line2} />
          </Pressable>
        ) : null}
      </View>

      {open ? (
        <View style={styles.dropdown}>
          <ScrollView keyboardShouldPersistTaps="handled" nestedScrollEnabled style={{ maxHeight: 210 }}>
            {results.map((inst) => (
              <Pressable
                key={`${inst.symbol}-${inst.asset_class || ""}-${inst.exchange || ""}`}
                style={styles.row}
                onPress={() => choose(inst)}
                android_ripple={{ color: colors.line }}
              >
                <View style={{ flex: 1, minWidth: 0 }}>
                  <Text style={styles.sym} numberOfLines={1}>
                    {inst.symbol}
                    {inst.exchange ? <Text style={styles.exch}> · {inst.exchange}</Text> : null}
                  </Text>
                  <Text style={styles.name} numberOfLines={1}>
                    {inst.name}
                  </Text>
                </View>
                <Text style={styles.meta}>
                  {CURRENCY_SYMBOL[inst.currency] || inst.currency || ""}
                  {inst.asset_class ? ` ${inst.asset_class}` : ""}
                </Text>
              </Pressable>
            ))}
          </ScrollView>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  inputWrap: { justifyContent: "center" },
  input: {
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingRight: 34,
    paddingVertical: 10,
    color: colors.ink,
    fontFamily: fonts.semibold,
    fontSize: 14,
    backgroundColor: colors.bg,
  },
  spinner: { position: "absolute", right: 11 },
  dropdown: {
    marginTop: 4,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: 10,
    backgroundColor: colors.surface,
    overflow: "hidden",
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 11,
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  sym: { color: colors.ink, fontFamily: fonts.bold, fontSize: 13 },
  exch: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11 },
  name: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, marginTop: 1 },
  meta: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 10 },
});
