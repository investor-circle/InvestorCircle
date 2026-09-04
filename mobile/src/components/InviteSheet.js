import { useState } from "react";
import { View, Text, StyleSheet, Modal, Pressable, Share } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import { inviteUrl } from "../utils/links";
import { colors, fonts } from "../theme/colors";

/**
 * Your personal invite link.
 *
 * The app could RECEIVE an invite — open the link, greet the newcomer, credit
 * the referrer — but there was no way to generate one, so a member could be
 * invited and never invite anyone. This is the other half.
 *
 * Anyone who signs up through the link is attributed to you server-side
 * (lookups process-referral) and the two of you are connected immediately,
 * which is what the copy promises here.
 *
 * NOT ported from the web's InviteModal: its "N friends joined through your
 * invite" counter. That reads `referred_by_me` / `source` off the connection
 * rows, and the connections endpoint returns neither field — so the web's
 * count is always zero. Showing a number that is structurally always zero
 * would be worse than showing none.
 */
export default function InviteSheet({ visible, username, onClose }) {
  const [copied, setCopied] = useState(false);
  const link = inviteUrl(username);

  const copy = async () => {
    if (!link) return;
    try {
      await Clipboard.setStringAsync(link);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (_) {
      /* the share button below is the other way through */
    }
  };

  const share = async () => {
    if (!link) return;
    try {
      await Share.share({
        message:
          "I track and share stock ideas on myInvestorCircle — a trusted network for " +
          `serious investors. Join me here:\n${link}`,
        url: link,
      });
    } catch (_) {
      /* user dismissed the OS sheet */
    }
  };

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} />
      <View style={styles.sheet}>
        <View style={styles.grabber} />
        <Text style={styles.title}>Invite friends</Text>
        <Text style={styles.body}>
          Share your personal invite link. Anyone who signs up through it is added to your circle
          automatically — you'll see each other's ideas straight away.
        </Text>

        {link ? (
          <>
            <View style={styles.linkBox}>
              <Text style={styles.linkText} selectable numberOfLines={2}>
                {link}
              </Text>
            </View>

            <Pressable style={styles.primary} onPress={share}>
              <Ionicons name="share-social-outline" size={17} color="#fff" />
              <Text style={styles.primaryText}>Share invite link</Text>
            </Pressable>

            <Pressable style={styles.secondary} onPress={copy}>
              <Ionicons
                name={copied ? "checkmark" : "copy-outline"}
                size={16}
                color={copied ? colors.gain : colors.inkSoft}
              />
              <Text style={[styles.secondaryText, copied && { color: colors.gain }]}>
                {copied ? "Copied" : "Copy link"}
              </Text>
            </Pressable>

            <Text style={styles.note}>
              They join your circle as soon as they sign up — no extra steps.
            </Text>
          </>
        ) : (
          // An invite link IS a username; there is nothing to share without one.
          <Text style={styles.note}>
            Set a username first — your invite link is built from it.
          </Text>
        )}

        <Pressable style={styles.close} onPress={onClose}>
          <Text style={styles.closeText}>Close</Text>
        </Pressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  grabber: {
    width: 36,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line2,
    alignSelf: "center",
    marginTop: 10,
    marginBottom: 16,
  },
  title: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 19 },
  body: { color: colors.muted, fontFamily: fonts.regular, fontSize: 13.5, lineHeight: 21, marginTop: 8 },
  linkBox: {
    backgroundColor: colors.surface2,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 11,
    marginTop: 18,
  },
  linkText: { color: colors.inkSoft, fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18 },
  primary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    backgroundColor: colors.accent,
    borderRadius: 12,
    paddingVertical: 14,
    marginTop: 14,
  },
  primaryText: { color: "#fff", fontFamily: fonts.bold, fontSize: 15 },
  secondary: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: 12,
    paddingVertical: 13,
    marginTop: 10,
  },
  secondaryText: { color: colors.inkSoft, fontFamily: fonts.bold, fontSize: 14.5 },
  note: {
    color: colors.muted,
    fontFamily: fonts.regular,
    fontSize: 12,
    lineHeight: 18,
    textAlign: "center",
    marginTop: 14,
  },
  close: { alignItems: "center", paddingVertical: 14, marginTop: 4 },
  closeText: { color: colors.muted, fontFamily: fonts.bold, fontSize: 14 },
});
