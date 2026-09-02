import { View, StyleSheet } from "react-native";
import { colors } from "../theme/colors";

/**
 * A minimal sparkline drawn with plain Views.
 *
 * Deliberately not react-native-svg: that is another native module, and this
 * project has already paid for native-dependency churn. A column chart made
 * of flex children conveys the same shape for a handful of daily closes,
 * needs no new dependency, and cannot break a Gradle build.
 *
 * Values are normalised against their own min/max, so the shape shows
 * MOVEMENT rather than absolute level — the same thing the web's line chart
 * communicates at this size.
 */
export default function Sparkline({ values, color, height = 40, style }) {
  // Number(null) is 0, not NaN, and Number("") is 0 too — so a missing point
  // would silently plot as a crash to zero rather than being skipped. Reject
  // the non-numeric shapes BEFORE converting.
  const nums = (values || [])
    .filter((v) => (typeof v === "number" || typeof v === "string") && String(v).trim() !== "")
    .map(Number)
    .filter(Number.isFinite);
  // One point is a dot, not a trend; two is the minimum that can show a
  // direction, so anything less renders nothing rather than a misleading bar.
  if (nums.length < 2) return null;

  const min = Math.min(...nums);
  const max = Math.max(...nums);
  const span = max - min;
  const tint = color || (nums[nums.length - 1] >= nums[0] ? colors.gain : colors.loss);

  return (
    <View style={[styles.wrap, { height }, style]}>
      {nums.map((v, i) => {
        // A flat series has no span; show a consistent mid-height baseline
        // rather than dividing by zero.
        const frac = span > 0 ? (v - min) / span : 0.5;
        return (
          <View
            key={i}
            style={[
              styles.bar,
              {
                // Floor at 2px so an all-time low is still visible as a mark
                // rather than vanishing into the axis.
                height: Math.max(2, frac * height),
                backgroundColor: tint,
                opacity: 0.35 + 0.65 * (i / Math.max(1, nums.length - 1)),
              },
            ]}
          />
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { flexDirection: "row", alignItems: "flex-end", gap: 2, overflow: "hidden" },
  bar: { flex: 1, borderRadius: 1.5, minWidth: 1 },
});
