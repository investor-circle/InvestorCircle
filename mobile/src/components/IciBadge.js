import { View, Text, StyleSheet } from "react-native";
import { colors, fonts } from "../theme/colors";

/**
 * The ICI score, shown the way the web app shows it: the number plus its
 * band. The band colours carry the meaning at a glance, so they follow the
 * same thresholds computeIci() uses (75 / 55 / 35) rather than a separate
 * scale invented here.
 */
const BAND_STYLE = {
  Strong: { bg: colors.gainSoft, fg: colors.gain },
  Good: { bg: "#e8f0fe", fg: "#1a56b8" },
  Building: { bg: "#fff4e5", fg: "#9a5b00" },
  Early: { bg: colors.surface2, fg: colors.muted },
};

export default function IciBadge({ ici, size = "md", showBand = true }) {
  // No score is a real state (a new investor with no public ideas); render
  // nothing rather than a misleading zero.
  if (!ici || typeof ici.score !== "number") return null;

  const band = BAND_STYLE[ici.band] || BAND_STYLE.Early;
  const small = size === "sm";
  const xl = size === "xl";

  if (xl) {
    // The track record's lead figure — this is the number the whole product
    // is organised around, so it gets a ring of its own rather than a chip
    // sized the same as a status pill next to it.
    return (
      <View style={styles.ringWrap}>
        <View style={[styles.ring, { borderColor: band.fg, backgroundColor: band.bg }]}>
          <Text style={[styles.ringScore, { color: band.fg }]}>{ici.score}</Text>
          <Text style={styles.ringMax}>/ 100</Text>
        </View>
        {showBand ? <Text style={[styles.ringBand, { color: band.fg }]}>{ici.band}</Text> : null}
      </View>
    );
  }

  return (
    <View style={[styles.wrap, { backgroundColor: band.bg }, small && styles.wrapSm]}>
      <Text style={[styles.score, { color: band.fg }, small && styles.scoreSm]}>{ici.score}</Text>
      {showBand ? (
        <Text style={[styles.band, { color: band.fg }, small && styles.bandSm]}>{ici.band}</Text>
      ) : null}
    </View>
  );
}

/** The full component breakdown, for the investor profile. */
export function IciBreakdown({ ici }) {
  if (!ici?.components?.length) return null;
  return (
    <View style={styles.breakdown}>
      {ici.components.map((c) => {
        const pct = c.max > 0 ? Math.max(0, Math.min(1, c.score / c.max)) : 0;
        return (
          <View key={c.label} style={styles.row}>
            <Text style={styles.rowLabel} numberOfLines={1}>
              {c.label}
            </Text>
            <View style={styles.track}>
              <View style={[styles.fill, { width: `${pct * 100}%` }]} />
            </View>
            <Text style={styles.rowScore}>
              {c.score}/{c.max}
            </Text>
          </View>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 5,
    borderRadius: 999,
    paddingHorizontal: 9,
    paddingVertical: 4,
    alignSelf: "flex-start",
  },
  wrapSm: { paddingHorizontal: 7, paddingVertical: 2, gap: 4 },
  score: { fontFamily: fonts.extrabold, fontSize: 14 },
  scoreSm: { fontSize: 12 },
  band: { fontFamily: fonts.semibold, fontSize: 11 },
  bandSm: { fontSize: 10 },
  ringWrap: { alignItems: "center", gap: 8 },
  ring: {
    width: 108,
    height: 108,
    borderRadius: 54,
    borderWidth: 7,
    alignItems: "center",
    justifyContent: "center",
  },
  ringScore: { fontFamily: fonts.extrabold, fontSize: 38, lineHeight: 42 },
  ringMax: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 11, marginTop: -2 },
  ringBand: { fontFamily: fonts.extrabold, fontSize: 14, letterSpacing: 0.3 },
  breakdown: { alignSelf: "stretch", marginTop: 14, gap: 8 },
  row: { flexDirection: "row", alignItems: "center", gap: 8 },
  rowLabel: { flex: 1, color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 12 },
  track: { width: 70, height: 5, borderRadius: 3, backgroundColor: colors.line, overflow: "hidden" },
  fill: { height: 5, borderRadius: 3, backgroundColor: colors.accent },
  rowScore: { width: 42, textAlign: "right", color: colors.muted, fontFamily: fonts.semibold, fontSize: 11 },
});
