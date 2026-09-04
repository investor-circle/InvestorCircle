import { useEffect, useState } from "react";
import { View, Text, StyleSheet, Modal, Pressable, TextInput, KeyboardAvoidingView, Platform } from "react-native";
import { colors, fonts } from "../theme/colors";
import { fmt } from "../utils/format";

/**
 * "What price did you actually invest at?"
 *
 * Ported from the web's InvestPriceModal. The app used to record the
 * recommended price as your entry, which is only right if you bought the
 * instant the idea was posted — otherwise it quietly credits you with a gain
 * or loss you never had. Marking an idea invested is the one place a member
 * puts their own money into the record, so it should ask.
 *
 * Prefilled with the current price, as on the web: it is the closest guess to
 * what someone acting now would pay, and it makes the common case one tap.
 */
export default function InvestPriceModal({ visible, reco, onClose, onConfirm }) {
  const [price, setPrice] = useState("");

  // Re-seed each time it opens: the price moves, and a stale value from a
  // previous open would be presented as today's.
  useEffect(() => {
    if (visible) setPrice(reco?.price != null ? String(reco.price) : "");
  }, [visible, reco?.price]);

  const num = Number(price);
  const valid = price !== "" && Number.isFinite(num) && num > 0;

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <View style={styles.sheet}>
          <View style={styles.grabber} />
          <Text style={styles.title}>Mark as invested</Text>
          <Text style={styles.body}>
            What price did you invest at for {reco?.ticker || reco?.assetName || "this idea"}?
          </Text>

          <View style={styles.stats}>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Entry price</Text>
              <Text style={styles.statValue}>{fmt(reco?.priceAt)}</Text>
            </View>
            <View style={styles.stat}>
              <Text style={styles.statLabel}>Current price</Text>
              <Text style={styles.statValue}>{fmt(reco?.price)}</Text>
            </View>
          </View>

          <Text style={styles.label}>Your entry price</Text>
          <TextInput
            style={styles.input}
            value={price}
            onChangeText={setPrice}
            keyboardType="decimal-pad"
            placeholder="0"
            placeholderTextColor={colors.muted}
            autoFocus
            selectTextOnFocus
          />

          <Pressable
            style={[styles.primary, !valid && styles.primaryOff]}
            disabled={!valid}
            onPress={() => onConfirm(num)}
          >
            <Text style={styles.primaryText}>Confirm invested</Text>
          </Pressable>
          <Pressable style={styles.close} onPress={onClose}>
            <Text style={styles.closeText}>Cancel</Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 16,
  },
  title: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 19 },
  body: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 21, marginTop: 8 },
  stats: { flexDirection: "row", gap: 28, marginTop: 16 },
  stat: {},
  statLabel: { color: colors.muted, fontFamily: fonts.medium, fontSize: 11.5 },
  statValue: { color: colors.ink, fontFamily: fonts.bold, fontSize: 15, marginTop: 2 },
  label: { color: colors.muted, fontFamily: fonts.bold, fontSize: 12, marginTop: 18, marginBottom: 6 },
  input: {
    borderWidth: 1,
    borderColor: colors.line2,
    backgroundColor: colors.surface2,
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 12,
    color: colors.ink,
    fontFamily: fonts.semibold,
    fontSize: 16,
  },
  primary: {
    alignItems: "center",
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 18,
  },
  primaryOff: { opacity: 0.45 },
  primaryText: { color: "#fff", fontFamily: fonts.bold, fontSize: 15 },
  close: { alignItems: "center", paddingVertical: 13, marginTop: 2 },
  closeText: { color: colors.muted, fontFamily: fonts.bold, fontSize: 14 },
});
