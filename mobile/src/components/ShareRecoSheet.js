import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, ActivityIndicator, Share } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { forwardRecommendation } from "../services/api/recommendationsApi";
import { getMyConnections } from "../services/api/connectionsApi";
import { getMyGroups } from "../services/api/groupsApi";
import { recoUrl } from "../utils/links";
import { colors, fonts } from "../theme/colors";
import Avatar from "./Avatar";

/**
 * Bottom-sheet for sharing an idea onward: forward it to connections/Circles
 * through the server's forward action, or hand the public link to the OS
 * share sheet. The public link is the SAME shareable, server-rendered
 * /idea/:id URL the web app's own "Share this idea" uses (RecoPostPage in
 * src/features/recommendations/RecommendationsPages.jsx) — same page,
 * same preview image, regardless of which client sent it.
 */
export default function ShareRecoSheet({ visible, reco, onClose }) {
  const [connections, setConnections] = useState([]);
  const [groups, setGroups] = useState([]);
  const [selUsers, setSelUsers] = useState({});
  const [selGroups, setSelGroups] = useState({});
  const [sending, setSending] = useState(false);
  const [msg, setMsg] = useState("");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (!visible) return;
    setMsg("");
    setSelUsers({});
    setSelGroups({});
    (async () => {
      const [conns, grps] = await Promise.all([getMyConnections(), getMyGroups()]);
      if (!mounted.current) return;
      setConnections((conns || []).filter((c) => c.status === "accepted"));
      setGroups(grps || []);
    })();
  }, [visible]);

  const count = Object.values(selUsers).filter(Boolean).length + Object.values(selGroups).filter(Boolean).length;

  const send = async () => {
    if (count === 0) return;
    setSending(true);
    const recipients = [
      ...Object.keys(selUsers).filter((id) => selUsers[id]).map((id) => ({ type: "user", id })),
      ...Object.keys(selGroups).filter((id) => selGroups[id]).map((id) => ({ type: "group", id })),
    ];
    const res = await forwardRecommendation(reco.id, recipients);
    if (!mounted.current) return;
    setSending(false);
    if (res.ok) {
      setMsg(`Shared with ${count} recipient${count === 1 ? "" : "s"}.`);
      setTimeout(() => mounted.current && onClose(), 900);
    } else {
      setMsg(res.error === "not_authorized" ? "You can't share this idea there." : "Couldn't share — try again.");
    }
  };

  const shareLink = async () => {
    // Built from WEB_ORIGIN, not API_ORIGIN. Those are two different
    // deployments — the site on the custom domain, the functions on Vercel —
    // and this used to point at the API host, so every link shared from the
    // app was a well-formed URL to the wrong place.
    //
    // No username lookup needed — recoUrl() now builds the bare, id-only
    // /idea/:id shape (see its own comment in utils/links.js), which is the
    // one that actually gets server-rendered content and a preview image.
    const url = recoUrl(reco.id);
    if (!url) {
      setMsg("This idea doesn't have a public page to link to.");
      return;
    }
    try {
      await Share.share({
        message: `${reco?.ticker || reco?.assetName || "An idea"} on myInvestorCircle — ${url}`,
        url,
      });
    } catch (_) {
      /* user dismissed the OS sheet */
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.handle} />
        <View style={styles.header}>
          <Text style={styles.title}>Share this idea</Text>
          <Pressable onPress={onClose} hitSlop={10}>
            <Ionicons name="close" size={24} color={colors.muted} />
          </Pressable>
        </View>

        <Pressable style={styles.linkRow} onPress={shareLink}>
          <Ionicons name="share-outline" size={19} color={colors.accentInk} />
          <Text style={styles.linkText}>Share a link…</Text>
        </Pressable>

        <ScrollView style={{ maxHeight: 320 }} contentContainerStyle={{ paddingBottom: 8 }}>
          {groups.length > 0 ? (
            <>
              <Text style={styles.groupLabel}>Circles</Text>
              {groups.map((g) => (
                <Pressable
                  key={String(g.id)}
                  style={styles.row}
                  onPress={() => setSelGroups((m) => ({ ...m, [g.id]: !m[g.id] }))}
                >
                  <Ionicons
                    name={selGroups[g.id] ? "checkbox" : "square-outline"}
                    size={22}
                    color={selGroups[g.id] ? colors.accent : colors.muted}
                  />
                  <View style={[styles.swatch, { backgroundColor: g.color || colors.accent }]}>
                    <Ionicons name="people" size={13} color="#fff" />
                  </View>
                  <Text style={styles.rowLabel} numberOfLines={1}>
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
                <Pressable
                  key={String(c.user_id)}
                  style={styles.row}
                  onPress={() => setSelUsers((m) => ({ ...m, [c.user_id]: !m[c.user_id] }))}
                >
                  <Ionicons
                    name={selUsers[c.user_id] ? "checkbox" : "square-outline"}
                    size={22}
                    color={selUsers[c.user_id] ? colors.accent : colors.muted}
                  />
                  <Avatar profile={c} uid={c.user_id} name={c.name} size={26}/>
                  <Text style={styles.rowLabel} numberOfLines={1}>
                    {c.name || c.username || "Investor"}
                  </Text>
                </Pressable>
              ))}
            </>
          ) : null}

          {groups.length === 0 && connections.length === 0 ? (
            <Text style={styles.empty}>No connections or Circles yet — use "Share a link" above.</Text>
          ) : null}
        </ScrollView>

        {msg ? <Text style={styles.msg}>{msg}</Text> : null}

        <Pressable style={[styles.sendBtn, (count === 0 || sending) && styles.sendBtnOff]} onPress={send} disabled={count === 0 || sending}>
          {sending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.sendText}>{count > 0 ? `Send to ${count}` : "Select recipients"}</Text>
          )}
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(13,14,30,0.5)" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingHorizontal: 16,
    paddingBottom: 28,
    paddingTop: 8,
    // See AddHoldingModal.js's sheet style for why: capped and centered so
    // this doesn't stretch edge-to-edge on iPad.
    width: "100%",
    maxWidth: 480,
    alignSelf: "center",
  },
  handle: { width: 40, height: 4, borderRadius: 2, backgroundColor: colors.line2, alignSelf: "center", marginBottom: 10 },
  header: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 10 },
  title: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 18 },
  linkRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingVertical: 13,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
    marginBottom: 6,
  },
  linkText: { color: colors.accentInk, fontFamily: fonts.semibold, fontSize: 15 },
  groupLabel: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 12, marginTop: 12, marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 9 },
  rowLabel: { flex: 1, color: colors.ink, fontFamily: fonts.semibold, fontSize: 14 },
  swatch: { width: 26, height: 26, borderRadius: 8, alignItems: "center", justifyContent: "center" },
  empty: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13, paddingVertical: 14 },
  msg: { color: colors.accentInk, fontFamily: fonts.semibold, fontSize: 13, textAlign: "center", marginTop: 8 },
  sendBtn: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 12,
  },
  sendBtnOff: { backgroundColor: colors.line2 },
  sendText: { color: "#fff", fontFamily: fonts.bold, fontSize: 15 },
});
