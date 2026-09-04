import { useCallback, useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  TextInput,
  ActivityIndicator,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as DocumentPicker from "expo-document-picker";
import { parseCasPdf, MAX_CAS_BYTES } from "../src/services/casImport";
import { importableHoldings, splitAgainstExisting, importValue } from "../src/utils/casHoldings";
import { getPortfolioHoldings, addPortfolioHolding } from "../src/services/api/portfolioApi";
import { newHoldingId } from "../src/utils/portfolio";
import { fmt } from "../src/utils/format";
import { debugLog } from "../src/utils/logger";
import { colors, fonts } from "../src/theme/colors";
import { withBoundary } from "../src/components/ErrorBoundary";

/**
 * Import holdings from a CAS statement PDF.
 *
 * This exists on mobile because a CAS arrives by email, and on a phone the
 * statement is usually already sitting in the mail app — picking it here is
 * often easier than moving it to a computer first. The parsing is the same
 * server-side parser the web app uses (api/cas.py); only the file-picking
 * differs.
 *
 * Import is additive and never destructive: anything already in the
 * portfolio is reported as a duplicate and skipped, never overwritten.
 */
function PortfolioImportScreen() {
  const router = useRouter();
  const [file, setFile] = useState(null);
  const [password, setPassword] = useState("");
  const [parsing, setParsing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState(null); // { toAdd, duplicates, investor, warnings }
  const [error, setError] = useState("");
  const [done, setDone] = useState(null); // { added, failed }
  const mounted = useRef(true);

  // Parsing can run for up to a minute and saving walks the whole list, so
  // leaving this screen mid-import is entirely plausible — without the
  // cleanup the guards below would never actually guard anything.
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const pick = useCallback(async () => {
    setError("");
    setResult(null);
    setDone(null);
    try {
      const res = await DocumentPicker.getDocumentAsync({
        type: "application/pdf",
        copyToCacheDirectory: true, // the parser needs a readable local URI
        multiple: false,
      });
      if (res.canceled) return;
      const picked = res.assets?.[0];
      if (!picked) return;
      if (picked.size && picked.size > MAX_CAS_BYTES) {
        setError("That file is larger than 12 MB. Please import it on the web app instead.");
        return;
      }
      setFile(picked);
    } catch (e) {
      setError("Couldn't open the file picker.");
    }
  }, []);

  const parse = useCallback(async () => {
    if (!file) return;
    setParsing(true);
    setError("");
    try {
      const parsed = await parseCasPdf(file, password);
      const importable = importableHoldings(parsed);
      const existing = await getPortfolioHoldings();
      const { toAdd, duplicates } = splitAgainstExisting(importable, existing);
      debugLog(
        `cas: parsed mf=${parsed.mf.length} eq=${parsed.equity.length} importable=${importable.length} new=${toAdd.length} dupes=${duplicates.length}`
      );
      if (mounted.current) {
        setResult({ toAdd, duplicates, investor: parsed.investor, warnings: parsed.warnings });
      }
    } catch (e) {
      if (mounted.current) setError(e?.message || "Couldn't read that statement.");
    } finally {
      if (mounted.current) setParsing(false);
    }
  }, [file, password]);

  const save = useCallback(async () => {
    if (!result?.toAdd?.length) return;
    setSaving(true);
    let added = 0;
    let failed = 0;
    // Sequential rather than parallel: this is a one-off action over a
    // handful of rows, and a burst of concurrent writes on a phone
    // connection is more likely to produce partial failures than to be
    // meaningfully faster.
    for (const h of result.toAdd) {
      // The server takes a client-supplied primary key; the parser's own ids
      // are only unique within one statement, so mint fresh ones the same way
      // manual entry does to avoid colliding with a previous import.
      const ok = await addPortfolioHolding({ ...h, id: newHoldingId() });
      if (ok) added += 1;
      else failed += 1;
    }
    if (mounted.current) {
      setSaving(false);
      setDone({ added, failed });
      setResult(null);
    }
  }, [result]);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 40 }}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle}>Import statement</Text>
        <View style={{ width: 40 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">
        <Text style={styles.intro}>
          Import your holdings from a CAS statement (CAMS, KFintech, NSDL or CDSL). Your statement is read to
          extract holdings and is not stored.
        </Text>

        <Pressable style={styles.picker} onPress={pick}>
          <Ionicons name={file ? "document-text" : "cloud-upload-outline"} size={22} color={colors.accent} />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.pickerTitle} numberOfLines={1}>
              {file ? file.name : "Choose a PDF"}
            </Text>
            <Text style={styles.pickerSub}>
              {file ? "Tap to choose a different file" : "From email, Files, or Drive"}
            </Text>
          </View>
        </Pressable>

        {file ? (
          <>
            <Text style={styles.label}>
              PDF password <Text style={styles.hint}>if it has one</Text>
            </Text>
            <TextInput
              style={styles.input}
              value={password}
              onChangeText={setPassword}
              placeholder="Often your PAN, in lowercase"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              secureTextEntry
            />

            <Pressable style={[styles.primary, parsing && styles.off]} onPress={parse} disabled={parsing}>
              {parsing ? (
                <ActivityIndicator color="#fff" />
              ) : (
                <Text style={styles.primaryText}>Read statement</Text>
              )}
            </Pressable>
            {parsing ? <Text style={styles.parsingNote}>Large statements can take a minute.</Text> : null}
          </>
        ) : null}

        {error ? (
          <View style={styles.errorBox}>
            <Ionicons name="alert-circle-outline" size={18} color={colors.loss} />
            <Text style={styles.errorText}>{error}</Text>
          </View>
        ) : null}

        {result ? (
          <View style={styles.card}>
            <Text style={styles.cardTitle}>
              {result.toAdd.length} new holding{result.toAdd.length === 1 ? "" : "s"} found
            </Text>
            {result.toAdd.length > 0 ? (
              <Text style={styles.cardSub}>Worth about {fmt(importValue(result.toAdd))}</Text>
            ) : null}

            {result.duplicates.length > 0 ? (
              <Text style={styles.dupes}>
                {result.duplicates.length} already in your portfolio — these will be skipped, not changed.
              </Text>
            ) : null}

            {result.warnings?.length ? (
              <Text style={styles.warn}>{result.warnings.join(" · ")}</Text>
            ) : null}

            <View style={styles.preview}>
              {result.toAdd.slice(0, 8).map((h, i) => (
                <View key={`${h.isin || h.sym}-${i}`} style={styles.previewRow}>
                  <Text style={styles.previewSym} numberOfLines={1}>
                    {h.sym || h.name}
                  </Text>
                  <Text style={styles.previewQty}>{h.sh}</Text>
                </View>
              ))}
              {result.toAdd.length > 8 ? (
                <Text style={styles.more}>and {result.toAdd.length - 8} more</Text>
              ) : null}
            </View>

            {result.toAdd.length > 0 ? (
              <Pressable style={[styles.primary, saving && styles.off]} onPress={save} disabled={saving}>
                {saving ? (
                  <ActivityIndicator color="#fff" />
                ) : (
                  <Text style={styles.primaryText}>
                    Add {result.toAdd.length} holding{result.toAdd.length === 1 ? "" : "s"}
                  </Text>
                )}
              </Pressable>
            ) : (
              <Text style={styles.nothing}>Nothing new to import from this statement.</Text>
            )}
          </View>
        ) : null}

        {done ? (
          <View style={styles.card}>
            <Ionicons name="checkmark-circle" size={30} color={colors.gain} />
            <Text style={styles.cardTitle}>
              Added {done.added} holding{done.added === 1 ? "" : "s"}
            </Text>
            {done.failed > 0 ? (
              <Text style={styles.warn}>
                {done.failed} couldn't be saved. You can run the import again — anything already added will be
                skipped.
              </Text>
            ) : null}
            <Pressable style={styles.primary} onPress={() => router.back()}>
              <Text style={styles.primaryText}>Back to portfolio</Text>
            </Pressable>
          </View>
        ) : null}
      </ScrollView>
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
  intro: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, marginBottom: 16 },
  picker: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    borderWidth: 1,
    borderStyle: "dashed",
    borderColor: colors.line2,
    borderRadius: 14,
    padding: 16,
    backgroundColor: colors.surface,
  },
  pickerTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 14 },
  pickerSub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  label: { color: colors.muted, fontFamily: fonts.bold, fontSize: 12, marginTop: 18, marginBottom: 5 },
  hint: { fontFamily: fonts.regular, fontSize: 11 },
  input: {
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 11,
    color: colors.ink,
    fontFamily: fonts.semibold,
    fontSize: 14,
    backgroundColor: colors.surface,
  },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 14,
    alignSelf: "stretch",
  },
  off: { opacity: 0.6 },
  primaryText: { color: "#fff", fontFamily: fonts.bold, fontSize: 15 },
  parsingNote: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, textAlign: "center", marginTop: 8 },
  errorBox: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: 8,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.loss,
    borderRadius: 12,
    padding: 12,
    marginTop: 16,
  },
  errorText: { flex: 1, color: colors.loss, fontFamily: fonts.semibold, fontSize: 13, lineHeight: 18 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 16,
    marginTop: 18,
    alignItems: "flex-start",
  },
  cardTitle: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 16, marginTop: 4 },
  cardSub: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 13, marginTop: 3 },
  dupes: { color: colors.inkSoft, fontFamily: fonts.regular, fontSize: 12, marginTop: 8, lineHeight: 17 },
  // No dedicated warning colour in the theme; inkSoft reads as "note", which
  // is what these are — non-fatal parser notes and partial-save counts.
  warn: { color: colors.inkSoft, fontFamily: fonts.regular, fontSize: 12, marginTop: 8, lineHeight: 17 },
  nothing: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, marginTop: 10 },
  preview: { alignSelf: "stretch", marginTop: 12 },
  previewRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 10,
    paddingVertical: 6,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  previewSym: { flex: 1, color: colors.ink, fontFamily: fonts.semibold, fontSize: 13 },
  previewQty: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 13 },
  more: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 8 },
});

export default withBoundary(PortfolioImportScreen, "PortfolioImport");
