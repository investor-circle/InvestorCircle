import { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  Modal,
  Pressable,
  ScrollView,
  TextInput,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { buildHolding, validateHolding, HOLDING_TYPES, CURRENCIES } from "../utils/portfolio";
import { holdingTypeFor } from "../utils/instruments";
import InstrumentSearch from "./InstrumentSearch";
import { colors, fonts } from "../theme/colors";

/**
 * Add a manual holding. Mirrors the web AddHoldingModal's manual mode.
 *
 * Picking a result from the instrument search fills in the name, sector,
 * currency and type, the same way the web modal's search mode does. Typing a
 * symbol that isn't in the master is still allowed — the master doesn't cover
 * everything, and the payload shape is identical either way.
 *
 * ISIN is only ever populated from a matched instrument; the instruments
 * endpoint doesn't currently expose one, so it stays empty for manual
 * entries exactly as it does on web when the search finds no match.
 */
export default function AddHoldingModal({ visible, onClose, onAdded }) {
  const [ticker, setTicker] = useState("");
  const [name, setName] = useState("");
  const [assetType, setAssetType] = useState("Stock");
  const [sector, setSector] = useState("");
  const [currency, setCurrency] = useState("INR");
  const [qty, setQty] = useState("");
  const [purchPrice, setPurchPrice] = useState("");
  const [isin, setIsin] = useState("");
  const [err, setErr] = useState("");
  const [saving, setSaving] = useState(false);

  const reset = () => {
    setTicker("");
    setName("");
    setAssetType("Stock");
    setSector("");
    setCurrency("INR");
    setQty("");
    setPurchPrice("");
    setIsin("");
    setErr("");
  };

  const close = () => {
    if (saving) return;
    reset();
    onClose();
  };

  const submit = async () => {
    const form = { ticker, name, assetType, sector, currency, qty, purchPrice, isin };
    const problem = validateHolding(form);
    if (problem) {
      setErr(problem);
      return;
    }
    setErr("");
    setSaving(true);
    const ok = await onAdded(buildHolding(form));
    setSaving(false);
    if (ok) {
      reset();
      onClose();
    } else {
      setErr("Couldn't save that holding — try again.");
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={close}>
      <Pressable style={styles.backdrop} onPress={close} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.sheet}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <Text style={styles.title}>Add a holding</Text>
            <Pressable onPress={close} hitSlop={10}>
              <Ionicons name="close" size={24} color={colors.muted} />
            </Pressable>
          </View>

          <ScrollView style={{ maxHeight: 430 }} keyboardShouldPersistTaps="handled">
            <Field label="Ticker / symbol" required hint="search or type your own">
              <InstrumentSearch
                value={ticker}
                placeholder="INFY"
                onChangeText={(t) => {
                  setTicker(t);
                  // Typing over a picked instrument invalidates the details
                  // that came with it — keep what the user typed, but don't
                  // silently attach the old instrument's ISIN to it.
                  setIsin("");
                }}
                onSelect={(sel) => {
                  setTicker(sel.symbol);
                  setName(sel.name);
                  setAssetType(holdingTypeFor(sel));
                  if (sel.sector) setSector(sel.sector);
                  if (sel.currency) setCurrency(sel.currency);
                  setIsin(sel.isin || "");
                }}
              />
            </Field>

            <Field label="Asset name" required>
              <TextInput
                style={styles.input}
                value={name}
                onChangeText={setName}
                placeholder="Infosys Ltd"
                placeholderTextColor={colors.muted}
              />
            </Field>

            <Field label="Type">
              <Chips options={HOLDING_TYPES} value={assetType} onChange={setAssetType} />
            </Field>

            <View style={styles.row}>
              <View style={{ flex: 1 }}>
                <Field label="Quantity" hint="optional">
                  <TextInput
                    style={styles.input}
                    value={qty}
                    onChangeText={setQty}
                    placeholder="0"
                    placeholderTextColor={colors.muted}
                    keyboardType="decimal-pad"
                  />
                </Field>
              </View>
              <View style={{ flex: 1 }}>
                <Field label="Buy price" hint="optional">
                  <TextInput
                    style={styles.input}
                    value={purchPrice}
                    onChangeText={setPurchPrice}
                    placeholder="0"
                    placeholderTextColor={colors.muted}
                    keyboardType="decimal-pad"
                  />
                </Field>
              </View>
            </View>

            <Field label="Sector" hint="optional">
              <TextInput
                style={styles.input}
                value={sector}
                onChangeText={setSector}
                placeholder="IT"
                placeholderTextColor={colors.muted}
              />
            </Field>

            <Field label="Currency">
              <Chips options={CURRENCIES} value={currency} onChange={setCurrency} />
            </Field>

            <Text style={styles.note}>
              Prices update automatically once this ticker is picked up by the nightly price run.
            </Text>
          </ScrollView>

          {err ? <Text style={styles.err}>{err}</Text> : null}

          <Pressable style={[styles.saveBtn, saving && styles.saveBtnOff]} onPress={submit} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.saveText}>Add holding</Text>}
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

function Field({ label, hint, required, children }) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>
        {label}
        {required ? <Text style={{ color: colors.loss }}> *</Text> : null}
        {hint ? <Text style={styles.hint}> {hint}</Text> : null}
      </Text>
      {children}
    </View>
  );
}

function Chips({ options, value, onChange }) {
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = o === value;
        return (
          <Pressable key={o} onPress={() => onChange(o)} style={[styles.chip, on && styles.chipOn]}>
            <Text style={[styles.chipText, on && styles.chipTextOn]}>{o}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(13,14,30,0.5)" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: 28,
    paddingTop: 8,
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line2, alignSelf: "center", marginBottom: 10 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 12 },
  title: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 18 },
  label: { color: colors.muted, fontFamily: fonts.bold, fontSize: 12, marginBottom: 5 },
  hint: { fontFamily: fonts.regular, fontSize: 11 },
  input: {
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: 10,
    paddingHorizontal: 11,
    paddingVertical: 10,
    color: colors.ink,
    fontFamily: fonts.semibold,
    fontSize: 14,
    backgroundColor: colors.bg,
  },
  row: { flexDirection: "row", gap: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 7 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line2,
    backgroundColor: colors.bg,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 12 },
  chipTextOn: { color: "#fff" },
  note: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, lineHeight: 16, marginTop: 2, marginBottom: 4 },
  err: { color: colors.loss, fontFamily: fonts.semibold, fontSize: 13, marginTop: 8, textAlign: "center" },
  saveBtn: { backgroundColor: colors.accent, borderRadius: 12, paddingVertical: 14, alignItems: "center", marginTop: 12 },
  saveBtnOff: { opacity: 0.6 },
  saveText: { color: "#fff", fontFamily: fonts.bold, fontSize: 15 },
});
