import { useEffect, useRef, useState } from "react";
import { Text, StyleSheet, Pressable, ActivityIndicator } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { trackInvestor, untrackInvestor, getTrackingStatus } from "../services/api/trackingApi";
import { colors, fonts } from "../theme/colors";

/**
 * Track / Tracking toggle for an investor.
 *
 * Tracking is one-way and needs no approval, unlike a connection request —
 * so this flips optimistically and only reverts if the server refuses.
 *
 * `initialTracking` lets a list that already knows the answer (because it
 * fetched everyone's status in one go) skip the per-row status call; without
 * it the button fetches its own state once on mount.
 */
export default function TrackButton({ targetId, initialTracking, onChange, compact }) {
  const [tracking, setTracking] = useState(initialTracking ?? null);
  const [busy, setBusy] = useState(false);
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (initialTracking !== undefined) {
      setTracking(initialTracking);
      return;
    }
    if (!targetId) return;
    let cancelled = false;
    getTrackingStatus(targetId).then((t) => {
      if (!cancelled && mounted.current) setTracking(t);
    });
    return () => {
      cancelled = true;
    };
  }, [targetId, initialTracking]);

  // Unknown state renders nothing rather than guessing "Track" — showing the
  // wrong verb and flipping it a moment later is worse than a brief gap.
  if (tracking === null || !targetId) return null;

  const toggle = async () => {
    if (busy) return;
    const next = !tracking;
    setBusy(true);
    setTracking(next);
    onChange?.(next);

    const ok = next ? await trackInvestor(targetId) : await untrackInvestor(targetId);
    if (!mounted.current) return;
    setBusy(false);
    if (!ok) {
      setTracking(!next);
      onChange?.(!next);
    }
  };

  return (
    <Pressable
      style={[styles.btn, compact && styles.btnCompact, tracking && styles.btnOn]}
      onPress={toggle}
      disabled={busy}
      accessibilityRole="button"
      accessibilityLabel={tracking ? "Stop tracking this investor" : "Track this investor"}
    >
      {busy ? (
        <ActivityIndicator size="small" color={tracking ? colors.inkSoft : "#fff"} />
      ) : (
        <>
          <Ionicons
            name={tracking ? "checkmark" : "add"}
            size={compact ? 13 : 15}
            color={tracking ? colors.inkSoft : "#fff"}
          />
          <Text style={[styles.text, compact && styles.textCompact, tracking && styles.textOn]}>
            {tracking ? "Tracking" : "Track"}
          </Text>
        </>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 5,
    backgroundColor: colors.accent,
    borderWidth: 1,
    borderColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
    minWidth: 96,
  },
  btnCompact: { paddingHorizontal: 11, paddingVertical: 6, minWidth: 84 },
  btnOn: { backgroundColor: colors.surface, borderColor: colors.line2 },
  text: { color: "#fff", fontFamily: fonts.bold, fontSize: 13 },
  textCompact: { fontSize: 12 },
  textOn: { color: colors.inkSoft },
});
