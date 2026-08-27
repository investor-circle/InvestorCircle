import { View, Text, StyleSheet } from "react-native";
import { colors } from "../theme/colors";
import { fmt, fmtDate, fmtPct, initialsOf, returnPct } from "../utils/format";

export default function RecoCard({ reco }) {
  const pct = returnPct(reco);
  const positive = pct >= 0;

  return (
    <View style={styles.card}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initialsOf(reco.byName)}</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.byName}>{reco.byName || "Unknown"}</Text>
          <Text style={styles.meta}>{fmtDate(reco.date)}</Text>
        </View>
        <View style={[styles.typeBadge, reco.recType === "Sell" && styles.sellBadge]}>
          <Text style={styles.typeBadgeText}>{reco.recType || "Buy"}</Text>
        </View>
      </View>

      <View style={styles.tickerRow}>
        <Text style={styles.ticker}>{reco.ticker}</Text>
        <Text style={styles.assetName} numberOfLines={1}>
          {reco.assetName}
        </Text>
      </View>

      {reco.thesis ? (
        <Text style={styles.thesis} numberOfLines={3}>
          {reco.thesis}
        </Text>
      ) : null}

      <View style={styles.footer}>
        <View>
          <Text style={styles.footerLabel}>Entry</Text>
          <Text style={styles.footerValue}>{fmt(reco.priceAt)}</Text>
        </View>
        <View>
          <Text style={styles.footerLabel}>Current</Text>
          <Text style={styles.footerValue}>{fmt(reco.price)}</Text>
        </View>
        <View>
          <Text style={styles.footerLabel}>Return</Text>
          <Text style={[styles.footerValue, { color: positive ? colors.green : colors.red }]}>{fmtPct(pct)}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.card,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  avatar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: colors.divider,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.text, fontWeight: "700", fontSize: 13 },
  byName: { color: colors.text, fontWeight: "600", fontSize: 14 },
  meta: { color: colors.textMuted, fontSize: 12, marginTop: 1 },
  typeBadge: { backgroundColor: "rgba(34,197,94,0.15)", borderRadius: 8, paddingHorizontal: 8, paddingVertical: 3 },
  sellBadge: { backgroundColor: "rgba(239,68,68,0.15)" },
  typeBadgeText: { color: colors.text, fontSize: 11, fontWeight: "700" },
  tickerRow: { flexDirection: "row", alignItems: "baseline", gap: 8, marginBottom: 4 },
  ticker: { color: colors.text, fontSize: 18, fontWeight: "700" },
  assetName: { color: colors.textMuted, fontSize: 13, flexShrink: 1 },
  thesis: { color: colors.textMuted, fontSize: 13, lineHeight: 18, marginBottom: 12 },
  footer: { flexDirection: "row", justifyContent: "space-between", borderTopWidth: 1, borderTopColor: colors.divider, paddingTop: 10 },
  footerLabel: { color: colors.textMuted, fontSize: 11, marginBottom: 2 },
  footerValue: { color: colors.text, fontSize: 14, fontWeight: "600" },
});
