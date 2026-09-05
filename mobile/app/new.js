import { useEffect, useRef, useState } from "react";
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
import { track } from "../src/services/analytics";
import { getMyConnections } from "../src/services/api/connectionsApi";
import { announcePublicReco } from "../src/services/announceReco";
import { useAuth } from "../src/context/AuthContext";
import { getMyGroups } from "../src/services/api/groupsApi";
import { initialsOf, HORIZONS, CONVICTIONS, FALLBACK_SECTORS } from "../src/utils/format";
import { getSectors } from "../src/services/api/lookupsApi";
import { buildRecoPayload, validateRecoDraft } from "../src/utils/recoDraft";
import { colors, fonts } from "../src/theme/colors";
import InstrumentSearch from "../src/components/InstrumentSearch";
import { withBoundary } from "../src/components/ErrorBoundary";

// New recommendation. Fields + validation mirror the web's create form
// (asset name + ticker required, numeric prices, Buy/Sell, optional
// target/horizon/thesis), plus the share step: an idea can go to specific
// connections and/or Circles, and/or be posted publicly. The server
// re-validates every recipient (authorizedCircleRecipientIds) — this picker
// is a convenience, never the authority.
const TYPES = ["Buy", "Sell"];

function NewRecoScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const [assetName, setAssetName] = useState("");
  const [ticker, setTicker] = useState("");
  // Populated only when a listed instrument is picked. The nightly pricing
  // job identifies an instrument by (symbol, asset_class), so sending these
  // through is what lets a mobile-created idea be priced and categorised the
  // same way a web-created one is — previously mobile sent neither.
  const [assetClass, setAssetClass] = useState(null);
  const [sector, setSector] = useState(null);
  // Sector normally arrives with the picked instrument. When it doesn't (an
  // instrument with no sector on file, or a hand-typed ticker) the field used
  // to be simply unavailable on mobile, while the web offers a picker from
  // sector_master. Server list first, local constants only as a fallback.
  const [sectorOptions, setSectorOptions] = useState(FALLBACK_SECTORS);
  const [exchange, setExchange] = useState(null);
  const [recType, setRecType] = useState("Buy");
  const [priceAt, setPriceAt] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [horizon, setHorizon] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [conviction, setConviction] = useState("");
  const [thesis, setThesis] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  // Share targets
  const [isPublic, setIsPublic] = useState(true);
  const [connections, setConnections] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selUsers, setSelUsers] = useState({}); // userId -> true
  const [selGroups, setSelGroups] = useState({}); // groupId -> true
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      const [conns, grps] = await Promise.all([getMyConnections(), getMyGroups()]);
      if (!mounted.current) return;
      setConnections((conns || []).filter((c) => c.status === "active"));
      setGroups(grps || []);
    })();
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    getSectors()
      .then((rows) => {
        // The endpoint returns plain strings (lookups.js: sectors: rows.map(r => r.sector)).
        const names = (rows || []).filter((r) => typeof r === "string" && r);
        if (names.length && mounted.current) setSectorOptions(names);
      })
      .catch(() => {
        /* keep the fallback list */
      });
  }, []);

  const toggle = (setter) => (id) => setter((m) => ({ ...m, [id]: !m[id] }));
  const recipientCount =
    Object.values(selUsers).filter(Boolean).length + Object.values(selGroups).filter(Boolean).length;

  const submit = async () => {
    if (!assetName.trim() || !ticker.trim()) {
      setError("Asset name and ticker are required.");
      return;
    }
    const invalid = validateRecoDraft({ assetName, ticker, priceAt, targetPrice, stopLoss, isPublic, recipientCount });
    if (invalid) {
      setError(invalid);
      return;
    }
    setError("");
    setSaving(true);

    const recipients = [
      ...Object.keys(selUsers)
        .filter((id) => selUsers[id])
        .map((id) => ({ type: "user", id })),
      ...Object.keys(selGroups)
        .filter((id) => selGroups[id])
        .map((id) => ({ type: "group", id })),
    ];

    const recoPayload = buildRecoPayload({
      assetName,
      ticker,
      assetClass,
      sector,
      exchange,
      recType,
      priceAt,
      targetPrice,
      stopLoss,
      horizon,
      conviction,
      thesis,
      isPublic,
    });
    const res = await createRecommendation(recoPayload, recipients);
    setSaving(false);
    if (res.ok) {
      // The same five parameters the web sends, so the two clients' ideas
      // can be compared in one report rather than only counted.
      track("reco_created", {
        rec_type: recoPayload.recType || "Buy",
        asset_class: recoPayload.assetClass || "",
        is_public: !!isPublic,
        has_ticker: !!recoPayload.ticker,
        conviction: recoPayload.conviction || "",
      });
    }
    if (res.ok) {
      // A PUBLIC idea creates no delivery rows, so nothing notifies anyone
      // server-side — the author's connections only hear about it if the
      // client asks. The web does this in its create flow; mobile did not,
      // so an idea posted from the phone reached nobody. Fire-and-forget:
      // the post already succeeded.
      if (isPublic) {
        announcePublicReco({
          reco: recoPayload,
          recoId: res.recommendation?.id,
          me: profile,
          contacts: connections.filter((c) => c.status === "active"),
        });
      }
      router.back();
    } else {
      setError(res.error === "not_authorized" ? "You're not allowed to post this." : "Couldn't post. Try again.");
    }
  };

  return (
    <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
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
            <InstrumentSearch
              value={ticker}
              placeholder="HAL"
              onChangeText={(t) => {
                setTicker(t);
                // Hand-typed ticker: drop the details that belonged to the
                // previously selected instrument rather than mislabelling
                // this one with them.
                setAssetClass(null);
                setSector(null);
                setExchange(null);
              }}
              onSelect={(sel) => {
                setTicker(sel.symbol);
                if (sel.name) setAssetName(sel.name);
                setAssetClass(sel.assetClass);
                setSector(sel.sector);
                setExchange(sel.exchange);
              }}
            />
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

          <Field label="Stop loss (optional)">
            <TextInput style={styles.input} placeholder="3900" placeholderTextColor={colors.muted} keyboardType="numeric" value={stopLoss} onChangeText={setStopLoss} />
          </Field>

          {/* Chips, not free text. calcTargetDate only understands these four
              strings, so a typed horizon (the old field even suggested "12M",
              which is not "12m") silently produced no target date and left the
              idea with no expiry. */}
          <Field label="Horizon (optional)">
            <View style={styles.chipRow}>
              {HORIZONS.map((h) => (
                <Pressable
                  key={h}
                  style={[styles.chip, horizon === h && styles.chipOn]}
                  onPress={() => setHorizon((cur) => (cur === h ? "" : h))}
                >
                  <Text style={[styles.chipText, horizon === h && styles.chipTextOn]}>{h}</Text>
                </Pressable>
              ))}
            </View>
          </Field>

          <Field label="Sector (optional)">
            <View style={styles.chipRow}>
              {sectorOptions.map((sec) => (
                <Pressable
                  key={sec}
                  style={[styles.chip, sector === sec && styles.chipOn]}
                  onPress={() => setSector((cur) => (cur === sec ? null : sec))}
                >
                  <Text style={[styles.chipText, sector === sec && styles.chipTextOn]}>{sec}</Text>
                </Pressable>
              ))}
            </View>
          </Field>

          <Field label="Conviction (optional)">
            <View style={styles.chipRow}>
              {CONVICTIONS.map((c) => (
                <Pressable
                  key={c}
                  style={[styles.chip, conviction === c && styles.chipOn]}
                  onPress={() => setConviction((cur) => (cur === c ? "" : c))}
                >
                  <Text style={[styles.chipText, conviction === c && styles.chipTextOn]}>{c}</Text>
                </Pressable>
              ))}
            </View>
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

          {/* Share step — who sees this idea */}
          <Text style={styles.sectionLabel}>Share with</Text>

          <Pressable style={styles.checkRow} onPress={() => setIsPublic((v) => !v)}>
            <Ionicons
              name={isPublic ? "checkbox" : "square-outline"}
              size={22}
              color={isPublic ? colors.accent : colors.muted}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.checkLabel}>Post publicly</Text>
              <Text style={styles.checkSub}>Visible to everyone on the platform feed</Text>
            </View>
          </Pressable>

          {groups.length > 0 ? (
            <>
              <Text style={styles.groupLabel}>Circles</Text>
              {groups.map((g) => (
                <Pressable key={String(g.id)} style={styles.checkRow} onPress={() => toggle(setSelGroups)(g.id)}>
                  <Ionicons
                    name={selGroups[g.id] ? "checkbox" : "square-outline"}
                    size={22}
                    color={selGroups[g.id] ? colors.accent : colors.muted}
                  />
                  <View style={[styles.swatch, { backgroundColor: g.color || colors.accent }]}>
                    <Ionicons name="people" size={13} color="#fff" />
                  </View>
                  <Text style={styles.checkLabel} numberOfLines={1}>
                    {g.name}
                  </Text>
                </Pressable>
              ))}
            </>
          ) : null}

          {connections.length > 0 ? (
            <>
              <Text style={styles.groupLabel}>Connections</Text>
              {connections.map((c) => (
                <Pressable key={String(c.user_id)} style={styles.checkRow} onPress={() => toggle(setSelUsers)(c.user_id)}>
                  <Ionicons
                    name={selUsers[c.user_id] ? "checkbox" : "square-outline"}
                    size={22}
                    color={selUsers[c.user_id] ? colors.accent : colors.muted}
                  />
                  <View style={styles.miniAvatar}>
                    <Text style={styles.miniAvatarText}>{initialsOf(c.name)}</Text>
                  </View>
                  <Text style={styles.checkLabel} numberOfLines={1}>
                    {c.name || c.username || "Investor"}
                  </Text>
                </Pressable>
              ))}
            </>
          ) : null}

          <Text style={styles.note}>
            {recipientCount > 0
              ? `Sharing with ${recipientCount} recipient${recipientCount === 1 ? "" : "s"}${isPublic ? " · also public" : ""}`
              : isPublic
              ? "This idea will be posted publicly."
              : "Pick at least one recipient, or make it public."}
          </Text>
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
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 9,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 13 },
  chipTextOn: { color: "#fff" },
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
  sectionLabel: {
    color: colors.muted,
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 8,
    marginBottom: 8,
  },
  groupLabel: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 12, marginTop: 12, marginBottom: 4 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  checkLabel: { flex: 1, color: colors.ink, fontFamily: fonts.semibold, fontSize: 14 },
  checkSub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 1 },
  swatch: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  miniAvatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  miniAvatarText: { color: colors.inkSoft, fontFamily: fonts.bold, fontSize: 10 },
  note: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 10, marginBottom: 8 },
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
