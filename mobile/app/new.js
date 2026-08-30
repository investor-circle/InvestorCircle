import { useState } from "react";
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
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { createRecommendation } from "../src/services/api/recommendationsApi";
import { colors, fonts } from "../src/theme/colors";
import { withBoundary } from "../src/components/ErrorBoundary";

// New recommendation. v1 posts a public idea (no per-circle recipient
// selection yet — that mirrors the web's more complex share step and is the
// next increment). Fields + validation mirror the web's create form: asset
// name + ticker required, prices numeric, Buy/Sell type, optional target/
// horizon/thesis.
const TYPES = ["Buy", "Sell"];

function NewRecoScreen() {
  const router = useRouter();
  const [assetName, setAssetName] = useState("");
  const [ticker, setTicker] = useState("");
  const [recType, setRecType] = useState("Buy");
  const [priceAt, setPriceAt] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [horizon, setHorizon] = useState("");
  const [thesis, setThesis] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!assetName.trim() || !ticker.trim()) {
      setError("Asset name and ticker are required.");
      return;
    }
    const priceNum = priceAt ? Number(priceAt) : null;
    const targetNum = targetPrice ? Number(targetPrice) : null;
    if ((priceAt && !Number.isFinite(priceNum)) || (targetPrice && !Number.isFinite(targetNum))) {
      setError("Prices must be numbers.");
      return;
    }
    setError("");
    setSaving(true);
    const res = await createRecommendation(
      {
        assetName: assetName.trim(),
        ticker: ticker.trim().toUpperCase(),
        recType,
        priceAt: priceNum,
        price: priceNum, // current == entry at creation time
        targetPrice: targetNum,
        horizon: horizon.trim() || null,
        thesis: thesis.trim() || null,
        isPublic: true,
      },
      []
    );
    setSaving(false);
    if (res.ok) {
      router.back();
    } else {
      setError(res.error === "not_authorized" ? "You're not allowed to post this." : "Couldn't post. Try again.");
    }
  };

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={10}>
          <Ionicons name="close" size={26} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle}>New idea</Text>
        <View style={{ width: 26 }} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.form} keyboardShouldPersistTaps="handled">
          <Field label="Asset name *">
            <TextInput style={styles.input} placeholder="Hindustan Aeronautics" placeholderTextColor={colors.muted} value={assetName} onChangeText={setAssetName} />
          </Field>
          <Field label="Ticker *">
            <TextInput style={styles.input} placeholder="HAL" placeholderTextColor={colors.muted} autoCapitalize="characters" value={ticker} onChangeText={setTicker} />
          </Field>

          <Field label="Type">
            <View style={styles.seg}>
              {TYPES.map((t) => {
                const active = recType === t;
                return (
                  <Pressable key={t} style={[styles.segBtn, active && styles.segBtnActive]} onPress={() => setRecType(t)}>
                    <Text style={[styles.segText, active && styles.segTextActive]}>{t}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          <View style={styles.row}>
            <Field label="Reco price" style={{ flex: 1 }}>
              <TextInput style={styles.input} placeholder="4380" placeholderTextColor={colors.muted} keyboardType="numeric" value={priceAt} onChangeText={setPriceAt} />
            </Field>
            <Field label="Target price" style={{ flex: 1 }}>
              <TextInput style={styles.input} placeholder="6200" placeholderTextColor={colors.muted} keyboardType="numeric" value={targetPrice} onChangeText={setTargetPrice} />
            </Field>
          </View>

          <Field label="Horizon">
            <TextInput style={styles.input} placeholder="12M" placeholderTextColor={colors.muted} value={horizon} onChangeText={setHorizon} />
          </Field>

          <Field label="Thesis">
            <TextInput
              style={[styles.input, styles.textarea]}
              placeholder="Why is this a good idea?"
              placeholderTextColor={colors.muted}
              multiline
              value={thesis}
              onChangeText={setThesis}
            />
          </Field>

          <Text style={styles.note}>This idea will be shared publicly to the platform feed.</Text>
          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable style={[styles.submit, saving && { opacity: 0.7 }]} onPress={submit} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Post idea</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function Field({ label, children, style }) {
  return (
    <View style={[{ marginBottom: 16 }, style]}>
      <Text style={styles.label}>{label}</Text>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  topbar: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
    backgroundColor: colors.surface,
  },
  topTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 17 },
  form: { padding: 16, paddingBottom: 40 },
  row: { flexDirection: "row", gap: 12 },
  label: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 13, marginBottom: 7 },
  input: {
    borderWidth: 1,
    borderColor: colors.line2,
    backgroundColor: colors.surface,
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 11,
    color: colors.ink,
    fontFamily: fonts.regular,
    fontSize: 15,
  },
  textarea: { minHeight: 100, textAlignVertical: "top" },
  seg: { flexDirection: "row", backgroundColor: colors.surface2, borderRadius: 12, padding: 3, gap: 3 },
  segBtn: { flex: 1, height: 40, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  segBtnActive: { backgroundColor: colors.surface, shadowColor: "#141432", shadowOpacity: 0.12, shadowRadius: 4, elevation: 1 },
  segText: { color: colors.muted, fontFamily: fonts.bold, fontSize: 14 },
  segTextActive: { color: colors.accentInk },
  note: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginBottom: 8 },
  error: { color: colors.loss, fontFamily: fonts.semibold, fontSize: 13, marginBottom: 8 },
  submit: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
    marginTop: 4,
  },
  submitText: { color: "#fff", fontFamily: fonts.bold, fontSize: 16 },
});

export default withBoundary(NewRecoScreen, "New idea");
