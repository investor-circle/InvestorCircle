import { memo } from "react";
import { View, Text, StyleSheet, Pressable } from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts, GRADIENT } from "../theme/colors";
import { fmt, fmtDate, fmtPct, initialsOf, returnPct } from "../utils/format";

// Rich reco card — matches the web app's feed card (src/features/discovery):
// gradient avatar, "<name> recommended · via/shared-by · date", Buy/Sell pill,
// ticker + name + current price + return inset, a reco-price/target/horizon/
// conviction grid, the thesis, and a footer of status/sector pills + comments
// + invested state. Tappable (onPress) to open the detail screen.
const SOURCE_LABELS = { public: "Public", network_engagement: "From your network" };

function RecoCard({ reco, onPress }) {
  const pct = returnPct(reco);
  const positive = pct >= 0;
  const isBuy = (reco.recType || "Buy") !== "Sell";
  const sourceLabel = SOURCE_LABELS[reco.feedSource];

  // Second line under the name: circle it came via, or who forwarded it.
  const subtitle = reco.groupName
    ? `via ${reco.groupName}`
    : reco.sharedByName
    ? `shared by ${reco.sharedByName}`
    : sourceLabel;

  const status = reco.exitSignal ? "Exited" : "Active";

  const CardBody = (
    <View style={styles.card}>
      {/* WHO */}
      <View style={styles.header}>
        <LinearGradient colors={GRADIENT.colors} start={GRADIENT.start} end={GRADIENT.end} style={styles.avatar}>
          <Text style={styles.avatarText}>{initialsOf(reco.byName)}</Text>
        </LinearGradient>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.byName} numberOfLines={1}>
            {reco.byName || "Someone"} <Text style={styles.recommended}>recommended</Text>
          </Text>
          <Text style={styles.subtitle} numberOfLines={1}>
            {subtitle ? `${subtitle} · ` : ""}
            {fmtDate(reco.date)}
          </Text>
        </View>
        <View style={[styles.typePill, isBuy ? styles.buyPill : styles.sellPill]}>
          <Text style={[styles.typePillText, { color: isBuy ? colors.gain : colors.loss }]}>
            {isBuy ? "Buy" : "Sell"}
          </Text>
        </View>
      </View>

      {/* WHAT — instrument + current price + return */}
      <View style={styles.priceBox}>
        <View style={{ flex: 1, minWidth: 0 }}>
          <Text style={styles.ticker} numberOfLines={1}>
            {reco.ticker || reco.assetName}
          </Text>
          {reco.assetName && reco.ticker ? (
            <Text style={styles.assetName} numberOfLines={1}>
              {reco.assetName}
            </Text>
          ) : null}
        </View>
        <View style={{ alignItems: "flex-end" }}>
          <Text style={styles.currentPrice}>{fmt(reco.price)}</Text>
          <Text style={[styles.returnText, { color: positive ? colors.gain : colors.loss }]}>
            {positive ? "▲" : "▼"} {fmtPct(pct)}
          </Text>
        </View>
      </View>

      {/* Reco price / target / horizon / conviction grid */}
      <View style={styles.grid}>
        <View style={styles.gridCell}>
          <Text style={styles.gridLabel}>RECO PRICE</Text>
          <Text style={styles.gridValue}>{fmt(reco.priceAt)}</Text>
        </View>
        <View style={styles.gridCell}>
          <Text style={styles.gridLabel}>TARGET</Text>
          <Text style={styles.gridValue}>{reco.targetPrice ? fmt(reco.targetPrice) : "—"}</Text>
        </View>
        {reco.horizon || reco.conviction ? (
          <>
            <View style={styles.gridCell}>
              <Text style={styles.gridLabel}>HORIZON</Text>
              <Text style={styles.gridValue}>{reco.horizon || "—"}</Text>
            </View>
            <View style={styles.gridCell}>
              <Text style={styles.gridLabel}>CONVICTION</Text>
              <Text style={styles.gridValue}>{reco.conviction || "—"}</Text>
            </View>
          </>
        ) : null}
      </View>

      {reco.thesis && reco.thesis !== "—" ? (
        <Text style={styles.thesis} numberOfLines={3}>
          {reco.thesis}
        </Text>
      ) : null}

      {/* Footer — status + sector pills, comments, invested */}
      <View style={styles.footer}>
        <View style={[styles.pill, status === "Active" ? styles.pillAccent : styles.pillMuted]}>
          <Text style={[styles.pillText, status === "Active" ? styles.pillTextAccent : styles.pillTextMuted]}>
            {status}
          </Text>
        </View>
        {reco.sector ? (
          <View style={[styles.pill, styles.pillMuted]}>
            <Text style={[styles.pillText, styles.pillTextMuted]}>{reco.sector}</Text>
          </View>
        ) : null}
        <View style={{ flex: 1 }} />
        {reco.commentCount > 0 ? (
          <View style={styles.footerStat}>
            <Ionicons name="chatbubble-outline" size={15} color={colors.muted} />
            <Text style={styles.footerStatText}>{reco.commentCount}</Text>
          </View>
        ) : null}
        {reco.invested ? (
          <View style={styles.footerStat}>
            <Ionicons name="checkmark-circle" size={16} color={colors.gain} />
            <Text style={[styles.footerStatText, { color: colors.gain }]}>Invested</Text>
          </View>
        ) : null}
      </View>
    </View>
  );

  if (onPress) {
    return (
      <Pressable onPress={() => onPress(reco)} style={({ pressed }) => pressed && { opacity: 0.85 }}>
        {CardBody}
      </Pressable>
    );
  }
  return CardBody;
}

// Memoized so scrolling / parent state changes don't re-render every card.
export default memo(RecoCard);

const styles = StyleSheet.create({
  card: {
    backgroundColor: colors.surface,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 16,
    marginHorizontal: 16,
    marginBottom: 12,
    shadowColor: "#141432",
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.05,
    shadowRadius: 12,
    elevation: 1,
  },
  header: { flexDirection: "row", alignItems: "center", gap: 10, marginBottom: 12 },
  avatar: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
  avatarText: { color: "#fff", fontFamily: fonts.extrabold, fontSize: 14 },
  byName: { color: colors.ink, fontFamily: fonts.bold, fontSize: 14 },
  recommended: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13 },
  subtitle: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 1 },
  typePill: { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  buyPill: { backgroundColor: colors.gainSoft },
  sellPill: { backgroundColor: colors.lossSoft },
  typePillText: { fontFamily: fonts.bold, fontSize: 12 },

  priceBox: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: colors.surface2,
    borderRadius: 12,
    padding: 14,
    gap: 10,
    marginBottom: 12,
  },
  ticker: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 20, letterSpacing: -0.3 },
  assetName: { color: colors.muted, fontFamily: fonts.medium, fontSize: 13, marginTop: 1 },
  currentPrice: { color: colors.ink, fontFamily: fonts.bold, fontSize: 18 },
  returnText: { fontFamily: fonts.bold, fontSize: 14, marginTop: 2 },

  grid: { flexDirection: "row", flexWrap: "wrap", marginBottom: 12 },
  gridCell: { width: "50%", marginBottom: 10 },
  gridLabel: { color: colors.muted, fontFamily: fonts.bold, fontSize: 10, letterSpacing: 0.5, marginBottom: 3 },
  gridValue: { color: colors.ink, fontFamily: fonts.bold, fontSize: 15 },

  thesis: { color: colors.inkSoft, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, marginBottom: 12 },

  footer: { flexDirection: "row", alignItems: "center", gap: 8, borderTopWidth: 1, borderTopColor: colors.line, paddingTop: 12 },
  pill: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  pillAccent: { backgroundColor: colors.accentSoft },
  pillMuted: { backgroundColor: colors.surface2 },
  pillText: { fontFamily: fonts.semibold, fontSize: 12 },
  pillTextAccent: { color: colors.accentInk },
  pillTextMuted: { color: colors.inkSoft },
  footerStat: { flexDirection: "row", alignItems: "center", gap: 4 },
  footerStatText: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 12 },
});
