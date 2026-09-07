import { View, Text, StyleSheet } from "react-native";
import Svg, { Circle, G } from "react-native-svg";
import { colors, fonts } from "../theme/colors";

/**
 * SVG donut ring — mirrors the web's My Tracked widget exactly
 * (src/features/discovery/Discovery.jsx TrackedSummaryWidget: R=32, cx=cy=40,
 * stroke=9, each segment a stroked circle with strokeDasharray/
 * strokeDashoffset, rotated -90deg so the ring starts at 12 o'clock).
 *
 * `segments` is drawn in order, each stacked after the previous one's arc
 * length — same cumulative-offset technique as the web, so 2 or 3 segments
 * both "just work" without special-casing.
 */
const R = 32;
const CX = 40;
const CY = 40;
const STROKE = 9;
const CIRC = 2 * Math.PI * R;

export default function DonutRing({ total, segments, label = "tracked" }) {
  let offset = 0;
  const arcs = segments
    .filter((s) => s.value > 0)
    .map((s) => {
      const dash = CIRC * (s.value / total);
      const arc = { ...s, dash, offset: -offset };
      offset += dash;
      return arc;
    });

  return (
    <View style={styles.wrap}>
      <Svg width={80} height={80}>
        <Circle cx={CX} cy={CY} r={R} fill="none" stroke={colors.line2} strokeWidth={STROKE} />
        <G rotation={-90} origin={`${CX}, ${CY}`}>
          {arcs.map((a, i) => (
            <Circle
              key={i}
              cx={CX}
              cy={CY}
              r={R}
              fill="none"
              stroke={a.color}
              strokeWidth={STROKE}
              strokeDasharray={`${a.dash} ${CIRC - a.dash}`}
              strokeDashoffset={a.offset}
              strokeLinecap="round"
            />
          ))}
        </G>
      </Svg>
      <View style={styles.centerText} pointerEvents="none">
        <Text style={styles.total}>{total}</Text>
        <Text style={styles.label}>{label}</Text>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { width: 80, height: 80, alignItems: "center", justifyContent: "center" },
  centerText: { position: "absolute", alignItems: "center" },
  total: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 18 },
  label: { color: colors.muted, fontFamily: fonts.regular, fontSize: 9, marginTop: 1 },
});
