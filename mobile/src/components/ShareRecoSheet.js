import { useEffect, useRef, useState } from "react";
import { View, Text, StyleSheet, Modal, Pressable, ScrollView, ActivityIndicator, Share } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { forwardRecommendation } from "../services/api/recommendationsApi";
import { getMyConnections } from "../services/api/connectionsApi";
import { getMyGroups } from "../services/api/groupsApi";
import { recoUrl } from "../utils/links";
import { getRecommenderUsername } from "../services/api/recommendationsApi";
import { initialsOf } from "../utils/format";
import { colors, fonts } from "../theme/colors";

/**
 * Bottom-sheet for sharing an idea onward: forward it to connections/Circles
 * through the server's forward action, or hand the public link to the OS
 * share sheet. The public link is the SAME shareable URL the web app uses
 * (#/investor/:username/reco/:id) so a shared link opens the same page
 * regardless of which client sent it.
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
    // Only the public-feed payload carries the author's username, so for an
    // idea reached any other way it is looked up. The lookup runs with the
    // sharer's own token and they can obviously see this idea, so it resolves
    // in practice; the empty case is an idea whose author has no username,
    // which genuinely has no public page to link to.
    let uname = reco?.from_username;
    if (!uname) {
      setMsg("Getting the link…");
      try {
        uname = await getRecommenderUsername(reco.id);
      } catch (_) {
        /* handled by the null check below */
      }
      if (!mounted.current) return;
      setMsg("");
    }
    const url = recoUrl(uname, reco.id);
    if (!url) {
      // Deliberately NOT a best-effort link. The web has no id-only route, so
      // the alternative was a URL that opens in the app and lands everyone
      // else on the home feed — and almost everyone a link is sent to does
      // not have the app.
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
                  <View style={styles.avatar}>
                    <Text style={styles.avatarText}>{initialsOf(c.name)}</Text>
                  </View>
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
  avatar: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.surface2,
    alignItems: "center",
    justifyContent: "center",
  },
  avatarText: { color: colors.inkSoft, fontFamily: fonts.bold, fontSize: 10 },
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
