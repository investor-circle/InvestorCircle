import { useEffect, useMemo, useRef, useState } from "react";
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
import { createRecommendation, getMyMadeRecos } from "../src/services/api/recommendationsApi";
import { track } from "../src/services/analytics";
import { getMyConnections } from "../src/services/api/connectionsApi";
import { announcePublicReco } from "../src/services/announceReco";
import { useAuth } from "../src/context/AuthContext";
import { getMyGroups } from "../src/services/api/groupsApi";
import { initialsOf, isExpired, HORIZONS, CONVICTIONS, FALLBACK_SECTORS, calcTargetDate, today } from "../src/utils/format";
import { getSectors } from "../src/services/api/lookupsApi";
import { getPreviousClose, sourceName } from "../src/services/marketData";
import { buildRecoPayload, validateRecoDraft } from "../src/utils/recoDraft";
import { putReco } from "../src/utils/recoStore";
import { colors, fonts } from "../src/theme/colors";
import InstrumentSearch from "../src/components/InstrumentSearch";
import SelectField from "../src/components/SelectField";
import ThesisEditor from "../src/components/ThesisEditor";
import { withBoundary } from "../src/components/ErrorBoundary";

const TYPES = ["Buy", "Sell"];
const CURRENCIES = ["INR", "USD", "GBP", "EUR"];
const CURRENCY_SYMBOL = { INR: "₹", USD: "$", GBP: "£", EUR: "€" };

function NewRecoScreen() {
  const router = useRouter();
  const { profile } = useAuth();
  const myId = profile?.id;

  // Instrument — search-first, same order as the web's New Idea modal: pick
  // (or type) the instrument before anything else, since everything else on
  // this screen either derives from it (industry, currency, entry price) or
  // is just easier to fill in once you know what you're posting about.
  const [selectedInstr, setSelectedInstr] = useState(null); // { symbol, name, exchange, assetClass, currency, sector }
  const [manualOpen, setManualOpen] = useState(false);
  const [assetName, setAssetName] = useState("");
  const [ticker, setTicker] = useState("");
  const [assetClass, setAssetClass] = useState(null);
  const [sector, setSector] = useState(null);
  const [currency, setCurrency] = useState("INR");
  const [exchange, setExchange] = useState(null);
  const [sectorOptions, setSectorOptions] = useState(FALLBACK_SECTORS);

  const [recType, setRecType] = useState("Buy");
  // Auto-stamped entry price — never typed, same as web (getPreviousClose the
  // moment an instrument is picked). Renamed from "Reco price": the number is
  // the price the idea's return is measured FROM, i.e. the entry, and mobile
  // used to invite a hand-typed value here which the web has never allowed.
  const [priceData, setPriceData] = useState(null); // { price, source, date }
  const [priceLoading, setPriceLoading] = useState(false);
  const [priceError, setPriceError] = useState("");
  const [targetPrice, setTargetPrice] = useState("");
  const [horizon, setHorizon] = useState("12m");
  const [stopLoss, setStopLoss] = useState("");
  const [conviction, setConviction] = useState("");
  const [thesis, setThesis] = useState("");
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  // Set once the idea is live — swaps the form for the confirmation screen
  // (see the web's MakeRecoModal `posted` state), so posting always ends in
  // visible feedback instead of just snapping back to the previous screen.
  const [posted, setPosted] = useState(null); // { id, ticker, assetName }

  // Share targets
  const [isPublic, setIsPublic] = useState(true);
  const [connections, setConnections] = useState([]);
  const [groups, setGroups] = useState([]);
  const [madeRecos, setMadeRecos] = useState([]);
  const [selUsers, setSelUsers] = useState({}); // userId -> true
  const [selGroups, setSelGroups] = useState({}); // groupId -> true
  const [peopleOpen, setPeopleOpen] = useState(false);
  const [peopleSearch, setPeopleSearch] = useState("");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    (async () => {
      const [conns, grps, made] = await Promise.all([getMyConnections(), getMyGroups(), getMyMadeRecos()]);
      if (!mounted.current) return;
      setConnections((conns || []).filter((c) => c.status === "accepted"));
      setGroups(grps || []);
      setMadeRecos(made || []);
    })();
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    getSectors()
      .then((rows) => {
        const names = (rows || []).filter((r) => typeof r === "string" && r);
        if (names.length && mounted.current) setSectorOptions(names);
      })
      .catch(() => {
        /* keep the fallback list */
      });
  }, []);

  // Auto-stamp the entry price the instant an instrument is picked — same
  // call, same trigger, as the web (Recommendations.jsx MakeRecoModal).
  useEffect(() => {
    if (!selectedInstr) {
      setPriceData(null);
      setPriceError("");
      setPriceLoading(false);
      return;
    }
    let cancelled = false;
    setPriceData(null);
    setPriceError("");
    setPriceLoading(true);
    getPreviousClose(selectedInstr.symbol, selectedInstr.exchange || "NSE")
      .then((d) => {
        if (cancelled || !mounted.current) return;
        if (d) setPriceData(d);
        else setPriceError("Price unavailable — will be stamped by tonight's batch.");
        setPriceLoading(false);
      })
      .catch(() => {
        if (cancelled || !mounted.current) return;
        setPriceError("Price unavailable — will be stamped by tonight's batch.");
        setPriceLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [selectedInstr?.symbol, selectedInstr?.exchange]);

  // Posting permission, mirrored from the web (Recommendations.jsx
  // MakeRecoModal): a private Circle is shared among friends, so any active
  // member may post to it; a public Circle is its owner's broadcast channel,
  // so only its admin may post there. This just keeps the picker from
  // offering a Circle the server would reject anyway.
  const myGroups = useMemo(
    () =>
      (groups || []).filter((g) => {
        const isMember = g.my_role === "admin" || g.members?.some((m) => m.user_id === myId && m.status === "active");
        if (!isMember) return false;
        if (g.circle_type === "public" && g.my_role !== "admin") return false;
        return true;
      }),
    [groups, myId]
  );

  const onInstrSelect = (sel) => {
    if (!sel) {
      setSelectedInstr(null);
      setSector(null);
      return;
    }
    setSelectedInstr(sel);
    setTicker(sel.symbol);
    setAssetName(sel.name);
    setAssetClass(sel.assetClass || null);
    setCurrency(sel.currency || "INR");
    setExchange(sel.exchange || null);
    setSector(sel.sector || null); // auto-fill industry from the instrument master
  };

  // Heads-up, not a blocker: does the author already have a live idea on this
  // ticker? Same rule as web (isExpired() + not exited).
  const activeRecoForTicker = useMemo(() => {
    const tickerUp = (selectedInstr?.symbol || ticker || "").toUpperCase();
    if (!tickerUp) return null;
    // getMyMadeRecos rows use `exit` (see api/_lib/handlers/recommendations.js
    // getMade's reshape), not `exitSignal` — the field name recommendations
    // carry everywhere else on mobile. Easy to mix up; got this wrong once
    // already while writing this check.
    return (madeRecos || []).find((r) => (r.ticker || "").toUpperCase() === tickerUp && !r.exit && !isExpired(r)) || null;
  }, [selectedInstr?.symbol, ticker, madeRecos]);

  const toggle = (setter) => (id) => setter((m) => ({ ...m, [id]: !m[id] }));
  const selectedContactsCount = Object.values(selUsers).filter(Boolean).length;
  const selectedGroupsCount = Object.values(selGroups).filter(Boolean).length;
  const recipientCount = selectedContactsCount + selectedGroupsCount;
  const filteredContacts = peopleSearch.trim()
    ? connections.filter((c) => (c.name || "").toLowerCase().includes(peopleSearch.trim().toLowerCase()))
    : connections;
  const allContactsSelected = connections.length > 0 && connections.every((c) => selUsers[c.user_id]);
  const selectAllContacts = () => {
    setSelUsers(allContactsSelected ? {} : Object.fromEntries(connections.map((c) => [c.user_id, true])));
  };

  // A public Circle is discoverable by anyone, so an idea shared to one can
  // never be marked non-public — forcing (not defaulting) this keeps the
  // toggle truthful even if it was switched off before a public Circle was
  // picked. Mirrors web's hasPublicCircleSelected effect exactly.
  const hasPublicCircleSelected = useMemo(
    () => Object.keys(selGroups).some((id) => selGroups[id] && myGroups.find((g) => String(g.id) === String(id))?.circle_type === "public"),
    [selGroups, myGroups]
  );
  useEffect(() => {
    if (hasPublicCircleSelected) setIsPublic(true);
  }, [hasPublicCircleSelected]);

  const submit = async () => {
    const invalid = validateRecoDraft({
      assetName,
      ticker,
      priceAt: priceData?.price || 0,
      priceError,
      targetPrice,
      stopLoss,
      isPublic: isPublic || hasPublicCircleSelected,
      recipientCount,
    });
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
      currency,
      exchange,
      recType,
      priceAt: priceData?.price || 0,
      priceSource: priceData?.source || null,
      targetPrice,
      stopLoss,
      horizon,
      conviction,
      thesis,
      isPublic: isPublic || hasPublicCircleSelected,
    });
    const res = await createRecommendation(recoPayload, recipients);
    setSaving(false);
    if (res.ok) {
      track("reco_created", {
        rec_type: recoPayload.recType || "Buy",
        asset_class: recoPayload.assetClass || "",
        is_public: !!recoPayload.isPublic,
        has_ticker: !!recoPayload.ticker,
        conviction: recoPayload.conviction || "",
      });
      if (recoPayload.isPublic) {
        announcePublicReco({
          reco: recoPayload,
          recoId: res.recommendation?.id,
          me: profile,
          contacts: connections,
        });
      }
      // Only show the confirmation when the server actually gave back a real
      // id — same guard as the web — otherwise there's no live idea to link
      // to, so just leave like before.
      if (res.recommendation?.id) {
        setPosted({ id: String(res.recommendation.id), ticker: recoPayload.ticker, assetName: recoPayload.assetName });
      } else {
        router.back();
      }
    } else {
      setError(res.error === "not_authorized" ? "You're not allowed to post this." : "Couldn't post. Try again.");
    }
  };

  // "Post another idea" from the confirmation screen — same screen, blanked
  // back to a fresh form instead of leaving, so posting several ideas in one
  // sitting doesn't mean reopening New Idea each time. Mirrors the web's
  // resetForm exactly (Recommendations.jsx MakeRecoModal).
  const resetForm = () => {
    setSelectedInstr(null);
    setManualOpen(false);
    setAssetName("");
    setTicker("");
    setAssetClass(null);
    setSector(null);
    setCurrency("INR");
    setExchange(null);
    setRecType("Buy");
    setPriceData(null);
    setPriceLoading(false);
    setPriceError("");
    setTargetPrice("");
    setHorizon("12m");
    setStopLoss("");
    setConviction("");
    setThesis("");
    setError("");
    setIsPublic(true);
    setSelUsers({});
    setSelGroups({});
    setPeopleOpen(false);
    setPeopleSearch("");
    setPosted(null);
  };

  const targetDate = calcTargetDate(today(), horizon);
  const valid =
    (assetName.trim() || ticker.trim()) &&
    (isPublic || hasPublicCircleSelected || recipientCount > 0) &&
    ((priceData?.price || 0) > 0 || !!priceError);

  // Confirmation screen: shown in place of the form once the idea is live,
  // matching the web's MakeRecoModal `posted` state exactly — same title,
  // copy, and the two actions (post another / go look at it).
  if (posted) {
    return (
      <SafeAreaView style={styles.flex} edges={["top", "bottom"]}>
        <View style={styles.topbar}>
          <View style={{ width: 26 }} />
          <Text style={styles.topTitle}>Idea posted</Text>
          <Pressable onPress={() => router.back()} hitSlop={10}>
            <Ionicons name="close" size={26} color={colors.ink} />
          </Pressable>
        </View>
        <View style={styles.postedWrap}>
          <View style={styles.postedIcon}>
            <Ionicons name="checkmark" size={28} color={colors.gain} />
          </View>
          <Text style={styles.postedTitle}>Your idea has been posted</Text>
          <Text style={styles.postedSub}>
            {posted.ticker && posted.ticker !== "—" ? posted.ticker : posted.assetName} is now live in your circle.
          </Text>
          <View style={styles.postedActions}>
            <Pressable style={styles.postedGhostBtn} onPress={resetForm}>
              <Text style={styles.postedGhostText}>Post another idea</Text>
            </Pressable>
            <Pressable style={styles.postedPriBtn} onPress={() => router.replace(`/reco/${posted.id}`)}>
              <Text style={styles.postedPriText}>Check it here</Text>
            </Pressable>
          </View>
        </View>
      </SafeAreaView>
    );
  }

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
          {/* ── Idea type — the first, quickest decision ─────────────── */}
          <Field label="Idea type">
            <View style={styles.seg}>
              {TYPES.map((t) => {
                const active = recType === t;
                return (
                  <Pressable
                    key={t}
                    style={[
                      styles.segBtn,
                      active && (t === "Buy" ? styles.segBtnBuy : styles.segBtnSell),
                    ]}
                    onPress={() => setRecType(t)}
                  >
                    <Text style={[styles.segText, active && (t === "Buy" ? styles.segTextBuy : styles.segTextSell)]}>{t}</Text>
                  </Pressable>
                );
              })}
            </View>
          </Field>

          {/* ── Instrument — search first; everything else follows from it ── */}
          <Field label="Search ticker or company">
            <InstrumentSearch
              value={ticker}
              placeholder="e.g. RELIANCE or Reliance Industries…"
              onChangeText={(t) => {
                setTicker(t);
                // Editing away from a picked instrument drops the fields that
                // belonged to it — otherwise a hand-typed ticker would keep a
                // stale locked industry/currency/entry-price from whatever
                // was selected before.
                if (selectedInstr) {
                  setSelectedInstr(null);
                  setAssetClass(null);
                  setSector(null);
                  setExchange(null);
                }
              }}
              onSelect={onInstrSelect}
            />
          </Field>

          {selectedInstr ? (
            <View style={styles.instrChip}>
              <Ionicons name="checkmark-circle" size={15} color={colors.accentInk} />
              <Text style={styles.instrChipText} numberOfLines={1}>
                {selectedInstr.symbol} — {selectedInstr.name}
              </Text>
              <Text style={styles.instrChipMeta}>{selectedInstr.exchange}</Text>
            </View>
          ) : (
            <Pressable onPress={() => setManualOpen((v) => !v)} style={styles.manualToggle}>
              <Text style={styles.manualToggleText}>Not in the list? Enter manually</Text>
              <Ionicons name={manualOpen ? "chevron-up" : "chevron-down"} size={14} color={colors.muted} />
            </Pressable>
          )}

          {manualOpen && !selectedInstr ? (
            <View style={styles.manualRow}>
              <Field label="Asset name" style={{ flex: 1 }}>
                <TextInput style={styles.input} placeholder="e.g. Apple Inc." placeholderTextColor={colors.muted} value={assetName} onChangeText={setAssetName} />
              </Field>
            </View>
          ) : null}

          {activeRecoForTicker ? (
            <View style={styles.warnNote}>
              <Ionicons name="warning-outline" size={14} color={colors.accentInk} />
              <Text style={styles.warnText}>
                You already have a live idea on {activeRecoForTicker.ticker}. You can post this one too, or{" "}
                <Text
                  style={styles.warnLink}
                  onPress={() => {
                    // The detail screen resolves a private idea from this
                    // hand-off, not a public-feed lookup — without it, an
                    // idea that isn't public would show as unopenable. Made
                    // recos carry no author fields (they're the caller's
                    // own — see api's getMade reshape), so stamp them the
                    // same way the Track tab's "Created" list already does,
                    // or isOwner on the detail screen reads false and hides
                    // the exit control on the author's own idea.
                    putReco({ ...activeRecoForTicker, byName: profile?.full_name || "You", from: profile?.id });
                    router.push(`/reco/${activeRecoForTicker.id}`);
                  }}
                >
                  share a follow-up
                </Text>{" "}
                on the original instead.
              </Text>
            </View>
          ) : null}

          {/* ── Classification — industry auto-fills and locks from the
              instrument master, exactly like the web ──────────────────── */}
          <View style={styles.row}>
            <Field label="Industry" style={{ flex: 1 }}>
              <SelectField
                value={sector}
                onChange={setSector}
                options={sectorOptions}
                placeholder="Select industry"
                searchable
                locked={!!selectedInstr?.sector}
                lockedLabel={selectedInstr?.sector}
              />
            </Field>
            <Field label="Conviction" style={{ flex: 1 }}>
              <SelectField value={conviction} onChange={setConviction} options={CONVICTIONS} placeholder="Not specified" />
            </Field>
          </View>

          <View style={styles.row}>
            <Field label="Currency" style={{ flex: 1 }}>
              <SelectField
                value={currency}
                onChange={setCurrency}
                options={CURRENCIES}
                locked={!!selectedInstr}
                lockedLabel={`${CURRENCY_SYMBOL[currency] || currency} ${currency}`}
              />
            </Field>
            <Field label="Horizon" style={{ flex: 1 }}>
              <SelectField value={horizon} onChange={setHorizon} options={HORIZONS} />
            </Field>
          </View>

          {/* ── Entry price — auto-stamped, never typed ──────────────────── */}
          <Field label={`Entry price (${CURRENCY_SYMBOL[currency] || currency})`}>
            {priceLoading ? (
              <View style={styles.priceBoxNeutral}>
                <ActivityIndicator size="small" color={colors.muted} />
                <Text style={styles.priceNeutralText}>Fetching previous close…</Text>
              </View>
            ) : priceData ? (
              <View style={styles.priceBoxGood}>
                <Text style={styles.priceGoodValue}>
                  {CURRENCY_SYMBOL[currency] || currency}
                  {Number(priceData.price).toLocaleString("en-IN")}
                </Text>
                <Text style={styles.priceGoodMeta}>
                  Auto-stamped · {sourceName(priceData.source)} · {priceData.date}
                </Text>
              </View>
            ) : priceError ? (
              <View style={styles.priceBoxWarn}>
                <Ionicons name="alert-circle-outline" size={14} color={colors.accent} />
                <Text style={styles.priceWarnText}>{priceError}</Text>
              </View>
            ) : (
              <View style={styles.priceBoxNeutral}>
                <Text style={styles.priceNeutralText}>Select an instrument above</Text>
              </View>
            )}
          </Field>

          <View style={styles.row}>
            <Field label="Target price (opt.)" style={{ flex: 1 }}>
              <TextInput style={styles.input} placeholder="0" placeholderTextColor={colors.muted} keyboardType="numeric" value={targetPrice} onChangeText={setTargetPrice} />
            </Field>
            <Field label="Stop loss (opt.)" style={{ flex: 1 }}>
              <TextInput style={styles.input} placeholder="0" placeholderTextColor={colors.muted} keyboardType="numeric" value={stopLoss} onChangeText={setStopLoss} />
            </Field>
          </View>

          <Field label="Thesis (optional)">
            <ThesisEditor value={thesis} onChange={setThesis} />
          </Field>

          {/* ── Who should see this? ─────────────────────────────────── */}
          <Text style={styles.sectionLabel}>Who should see this?</Text>

          <Pressable
            style={[styles.publicRow, hasPublicCircleSelected && styles.publicRowLocked]}
            onPress={() => !hasPublicCircleSelected && setIsPublic((v) => !v)}
            disabled={hasPublicCircleSelected}
          >
            <Ionicons
              name={isPublic || hasPublicCircleSelected ? "checkbox" : "square-outline"}
              size={22}
              color={isPublic || hasPublicCircleSelected ? colors.accent : colors.muted}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.checkLabel}>🌐 Public</Text>
              <Text style={styles.checkSub}>Anyone on myInvestorCircle can discover this.</Text>
              {hasPublicCircleSelected ? (
                <Text style={styles.lockedNote}>Can't be turned off — a public Circle is selected below.</Text>
              ) : null}
            </View>
          </Pressable>

          {/* Circles — a handful at most, so tappable chips (like web) beat a
              checkbox list. */}
          <View style={styles.shareBlock}>
            <Text style={styles.shareBlockTitle}>⭕ Circles</Text>
            <Text style={styles.shareBlockSub}>Select one or more Circles.</Text>
            {myGroups.length === 0 ? (
              <Text style={styles.emptyNote}>No Circles yet — Circles you belong to (or own) will appear here.</Text>
            ) : (
              <View style={styles.chipWrap}>
                {myGroups.map((g) => {
                  const on = !!selGroups[g.id];
                  return (
                    <Pressable key={String(g.id)} style={[styles.circleChip, on && styles.circleChipOn]} onPress={() => toggle(setSelGroups)(g.id)}>
                      {on ? <Ionicons name="checkmark" size={13} color="#fff" /> : null}
                      <Ionicons name={g.circle_type === "public" ? "globe-outline" : "lock-closed-outline"} size={13} color={on ? "#fff" : colors.muted} />
                      <Text style={[styles.circleChipText, on && styles.circleChipTextOn]} numberOfLines={1}>
                        {g.name}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
            )}
          </View>

          {/* People — expandable + searchable, with a select-all shortcut for
              when the circle of connections is small enough to just pick
              everyone. */}
          <View style={styles.shareBlock}>
            <Pressable style={styles.peopleHead} onPress={() => setPeopleOpen((o) => !o)}>
              <View style={{ flex: 1 }}>
                <Text style={styles.shareBlockTitle}>👥 People</Text>
                <Text style={styles.shareBlockSub}>{selectedContactsCount > 0 ? `${selectedContactsCount} selected` : "Select specific people."}</Text>
              </View>
              <Ionicons name={peopleOpen ? "chevron-up" : "chevron-down"} size={16} color={colors.muted} />
            </Pressable>

            {peopleOpen ? (
              connections.length === 0 ? (
                <Text style={styles.emptyNote}>No connections yet.</Text>
              ) : (
                <View style={{ marginTop: 8 }}>
                  <View style={styles.peopleSearchRow}>
                    <View style={styles.peopleSearchBox}>
                      <Ionicons name="search" size={14} color={colors.muted} />
                      <TextInput
                        style={styles.peopleSearchInput}
                        placeholder="Search people…"
                        placeholderTextColor={colors.muted}
                        value={peopleSearch}
                        onChangeText={setPeopleSearch}
                      />
                    </View>
                    <Pressable style={styles.selectAllBtn} onPress={selectAllContacts}>
                      <Text style={styles.selectAllText}>{allContactsSelected ? "Clear all" : "Select all"}</Text>
                    </Pressable>
                  </View>
                  <View style={{ maxHeight: 260 }}>
                    <ScrollView nestedScrollEnabled keyboardShouldPersistTaps="handled">
                      {filteredContacts.length === 0 ? (
                        <Text style={styles.emptyNote}>No people match "{peopleSearch}".</Text>
                      ) : (
                        filteredContacts.map((c) => (
                          <Pressable key={String(c.user_id)} style={styles.checkRow} onPress={() => toggle(setSelUsers)(c.user_id)}>
                            <Ionicons
                              name={selUsers[c.user_id] ? "checkbox" : "square-outline"}
                              size={20}
                              color={selUsers[c.user_id] ? colors.accent : colors.muted}
                            />
                            <View style={styles.miniAvatar}>
                              <Text style={styles.miniAvatarText}>{initialsOf(c.name)}</Text>
                            </View>
                            <Text style={styles.checkLabel} numberOfLines={1}>
                              {c.name || c.username || "Investor"}
                            </Text>
                          </Pressable>
                        ))
                      )}
                    </ScrollView>
                  </View>
                </View>
              )
            ) : null}
          </View>

          <Text style={styles.note}>
            {recipientCount > 0
              ? `Sharing with ${recipientCount} recipient${recipientCount === 1 ? "" : "s"}${isPublic || hasPublicCircleSelected ? " · also public" : ""}`
              : isPublic || hasPublicCircleSelected
              ? "This idea will be posted publicly."
              : "Pick at least one person or Circle, or post publicly."}
          </Text>
          {targetDate ? <Text style={styles.note}>Target date: {targetDate}</Text> : null}
          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>

        {/* Primary action stays pinned above the keyboard, not buried at the
            bottom of a long scroll. */}
        <View style={styles.footer}>
          <Pressable style={[styles.submit, (!valid || saving) && styles.submitDisabled]} onPress={submit} disabled={!valid || saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={styles.submitText}>Post idea</Text>}
          </Pressable>
        </View>
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
  form: { padding: 16, paddingBottom: 24 },
  postedWrap: { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32 },
  postedIcon: {
    width: 60,
    height: 60,
    borderRadius: 30,
    backgroundColor: colors.gainSoft,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 18,
  },
  postedTitle: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 18, textAlign: "center" },
  postedSub: {
    color: colors.muted,
    fontFamily: fonts.regular,
    fontSize: 13.5,
    textAlign: "center",
    marginTop: 8,
    marginBottom: 26,
    lineHeight: 20,
  },
  postedActions: { flexDirection: "row", gap: 10, width: "100%" },
  postedGhostBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.surface2,
  },
  postedGhostText: { color: colors.inkSoft, fontFamily: fonts.bold, fontSize: 14 },
  postedPriBtn: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    paddingVertical: 14,
    borderRadius: 12,
    backgroundColor: colors.accent,
  },
  postedPriText: { color: "#fff", fontFamily: fonts.bold, fontSize: 14 },
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
  seg: { flexDirection: "row", backgroundColor: colors.surface2, borderRadius: 12, padding: 3, gap: 3 },
  segBtn: { flex: 1, height: 42, borderRadius: 9, alignItems: "center", justifyContent: "center" },
  segBtnBuy: { backgroundColor: colors.gainSoft },
  segBtnSell: { backgroundColor: colors.lossSoft },
  segText: { color: colors.muted, fontFamily: fonts.bold, fontSize: 14 },
  segTextBuy: { color: colors.gain },
  segTextSell: { color: colors.loss },

  instrChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginTop: -6,
    marginBottom: 16,
    padding: 11,
    borderRadius: 10,
    backgroundColor: colors.accentSoft,
  },
  instrChipText: { flex: 1, color: colors.accentInk, fontFamily: fonts.semibold, fontSize: 13 },
  instrChipMeta: { color: colors.accentInk, fontFamily: fonts.bold, fontSize: 11 },
  manualToggle: { flexDirection: "row", alignItems: "center", gap: 5, marginTop: -6, marginBottom: 16 },
  manualToggleText: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 12 },
  manualRow: { marginBottom: 4 },

  warnNote: {
    flexDirection: "row",
    gap: 8,
    padding: 11,
    borderRadius: 10,
    backgroundColor: colors.accentSoft,
    marginBottom: 16,
  },
  warnText: { flex: 1, color: colors.accentInk, fontFamily: fonts.regular, fontSize: 12, lineHeight: 17 },
  warnLink: { fontFamily: fonts.bold, textDecorationLine: "underline" },

  priceBoxGood: { padding: 12, borderWidth: 1, borderColor: colors.gain, borderRadius: 11, backgroundColor: colors.gainSoft },
  priceGoodValue: { color: colors.gain, fontFamily: fonts.extrabold, fontSize: 16 },
  priceGoodMeta: { color: colors.gain, fontFamily: fonts.regular, fontSize: 10.5, marginTop: 3 },
  priceBoxWarn: { flexDirection: "row", alignItems: "center", gap: 7, padding: 12, borderRadius: 11, backgroundColor: colors.accentSoft },
  priceWarnText: { flex: 1, color: colors.accentInk, fontFamily: fonts.regular, fontSize: 12, lineHeight: 16 },
  priceBoxNeutral: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 11, borderWidth: 1, borderColor: colors.line2, borderStyle: "dashed", backgroundColor: colors.surface2 },
  priceNeutralText: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13 },

  sectionLabel: {
    color: colors.muted,
    fontFamily: fonts.bold,
    fontSize: 11,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    marginTop: 8,
    marginBottom: 10,
  },
  publicRow: {
    flexDirection: "row",
    gap: 10,
    alignItems: "flex-start",
    padding: 12,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: colors.line,
    marginBottom: 10,
  },
  publicRowLocked: { backgroundColor: colors.surface2 },
  checkLabel: { color: colors.ink, fontFamily: fonts.bold, fontSize: 13.5 },
  checkSub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  lockedNote: { color: colors.accentInk, fontFamily: fonts.regular, fontSize: 11.5, marginTop: 4 },

  shareBlock: { padding: 12, borderWidth: 1, borderColor: colors.line, borderRadius: 11, marginBottom: 10 },
  shareBlockTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 13.5 },
  shareBlockSub: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 2 },
  emptyNote: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12.5, marginTop: 8 },
  chipWrap: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  circleChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: colors.line2,
    backgroundColor: colors.surface,
    maxWidth: "100%",
  },
  circleChipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  circleChipText: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 13 },
  circleChipTextOn: { color: "#fff" },

  peopleHead: { flexDirection: "row", alignItems: "center", gap: 10 },
  peopleSearchRow: { flexDirection: "row", gap: 8, marginBottom: 8 },
  peopleSearchBox: {
    flex: 1,
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 10,
    borderRadius: 9,
    backgroundColor: colors.surface2,
  },
  peopleSearchInput: { flex: 1, color: colors.ink, fontFamily: fonts.regular, fontSize: 13, paddingVertical: 8 },
  selectAllBtn: { paddingHorizontal: 12, justifyContent: "center", borderRadius: 9, backgroundColor: colors.accentSoft },
  selectAllText: { color: colors.accentInk, fontFamily: fonts.bold, fontSize: 12 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  miniAvatar: { width: 26, height: 26, borderRadius: 13, backgroundColor: colors.surface2, alignItems: "center", justifyContent: "center" },
  miniAvatarText: { color: colors.inkSoft, fontFamily: fonts.bold, fontSize: 10 },

  note: { color: colors.muted, fontFamily: fonts.regular, fontSize: 12, marginTop: 4 },
  error: { color: colors.loss, fontFamily: fonts.semibold, fontSize: 13, marginTop: 10 },

  footer: {
    padding: 14,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
  },
  submit: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 15,
    alignItems: "center",
  },
  submitDisabled: { opacity: 0.5 },
  submitText: { color: "#fff", fontFamily: fonts.bold, fontSize: 16 },
});

export default withBoundary(NewRecoScreen, "New idea");
