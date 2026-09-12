import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, ScrollView, Pressable, Switch, ActivityIndicator } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { getFeedConfigAndPrefs, setFeedPref } from "../src/services/api/feedApi";
import { useAuth } from "../src/context/AuthContext";
import { colors, fonts } from "../src/theme/colors";
import { withBoundary } from "../src/components/ErrorBoundary";

// Feed Settings — mirrors the web's Sharing.jsx exactly: the same 3
// categories (sources/ranking/filters), the same "required, can't be
// turned off" lock for always_on options, same fallback to each option's
// default_on when the caller has no saved preference for it yet. This is
// what "Settings" in the Profile menu should have opened all along — it
// was pointed at the profile-EDIT screen (app/settings.js) instead, which
// is a different thing (and still correctly reached from Track record's
// "Edit profile" button).
const CATEGORY_LABEL = { sources: "Feed Sources", ranking: "Ranking", filters: "Filters" };
const CATEGORY_ORDER = ["sources", "ranking", "filters"];

function FeedSettingsScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const [options, setOptions] = useState(null);
  const [prefs, setPrefs] = useState({}); // config_key -> enabled
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      const { options: opts, prefs: rows } = await getFeedConfigAndPrefs();
      if (!mounted.current) return;
      setOptions(opts || []);
      setPrefs(Object.fromEntries((rows || []).map((p) => [p.config_key, p.enabled])));
    })();
    return () => {
      mounted.current = false;
    };
  }, []);

  const valueOf = (o) => {
    if (o.always_on) return true;
    const configKey = o.config_key ?? o.key;
    return configKey in prefs ? prefs[configKey] : !!o.default_on;
  };

  const toggle = (o) => {
    if (o.always_on) return;
    const configKey = o.config_key ?? o.key;
    const next = !valueOf(o);
    setPrefs((p) => ({ ...p, [configKey]: next }));
    if (profile?.id) setFeedPref(configKey, next).catch(() => {});
  };

  const enabledOptions = (options || []).filter((o) => o.admin_enabled);

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 40 }}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle}>Feed Settings</Text>
        <View style={{ width: 40 }} />
      </View>

      {options === null ? (
        <View style={styles.center}>
          <ActivityIndicator color={colors.accent} size="large" />
        </View>
      ) : (
        <ScrollView contentContainerStyle={{ padding: 16, paddingBottom: 32 }}>
          <Text style={styles.intro}>
            Personalise what appears in your idea feed. Options marked{" "}
            <Ionicons name="lock-closed" size={11} color={colors.accentInk} /> are required by the platform and
            can't be turned off.
          </Text>

          {enabledOptions.length === 0 ? (
            <Text style={styles.empty}>No feed settings are available right now.</Text>
          ) : (
            CATEGORY_ORDER.map((cat) => {
              const opts = enabledOptions.filter((o) => o.category === cat);
              if (!opts.length) return null;
              return (
                <View key={cat} style={styles.section}>
                  <Text style={styles.sectionLabel}>{CATEGORY_LABEL[cat] || cat}</Text>
                  <View style={styles.card}>
                    {opts.map((o, i) => {
                      const on = valueOf(o);
                      const locked = !!o.always_on;
                      return (
                        <View key={o.key} style={[styles.row, i > 0 && styles.rowBorder]}>
                          <View style={{ flex: 1, minWidth: 0 }}>
                            <View style={styles.rowLabelLine}>
                              <Text style={styles.rowLabel}>{o.label}</Text>
                              {locked ? (
                                <View style={styles.lockedBadge}>
                                  <Ionicons name="lock-closed" size={9} color={colors.accentInk} />
                                  <Text style={styles.lockedBadgeText}>Required</Text>
                                </View>
                              ) : null}
                            </View>
                            {o.description ? <Text style={styles.rowDesc}>{o.description}</Text> : null}
                          </View>
                          <Switch
                            value={on}
                            onValueChange={() => toggle(o)}
                            disabled={locked}
                            trackColor={{ false: colors.line2, true: colors.accent }}
                            thumbColor="#fff"
                          />
                        </View>
                      );
                    })}
                  </View>
                </View>
              );
            })
          )}
        </ScrollView>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
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
  intro: { color: colors.inkSoft, fontFamily: fonts.regular, fontSize: 13, lineHeight: 19, marginBottom: 18 },
  empty: { color: colors.muted, fontFamily: fonts.regular, fontSize: 14, textAlign: "center", marginTop: 40 },
  section: { marginBottom: 20 },
  sectionLabel: {
    color: colors.muted,
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    paddingHorizontal: 14,
  },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 13 },
  rowBorder: { borderTopWidth: 1, borderTopColor: colors.line },
  rowLabelLine: { flexDirection: "row", alignItems: "center", gap: 7, flexWrap: "wrap" },
  rowLabel: { color: colors.ink, fontFamily: fonts.semibold, fontSize: 14 },
  rowDesc: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 2, lineHeight: 16 },
  lockedBadge: {
    flexDirection: "row",
    alignItems: "center",
    gap: 3,
    backgroundColor: colors.accentSoft,
    borderRadius: 5,
    paddingHorizontal: 6,
    paddingVertical: 2,
  },
  lockedBadgeText: { color: colors.accentInk, fontFamily: fonts.bold, fontSize: 9.5 },
});

export default withBoundary(FeedSettingsScreen, "Feed Settings");
