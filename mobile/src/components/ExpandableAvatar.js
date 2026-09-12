import { useState } from "react";
import { useSyncExternalStore } from "react";
import { Modal, Pressable, Image, StyleSheet } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import Avatar from "./Avatar";
import { avatarSource } from "../utils/avatar";
import { subscribeAvatars, cachedAvatar } from "../services/avatarCache";

/**
 * An Avatar that expands to a full-screen view of the photo on tap.
 *
 * Drop-in replacement for Avatar — same props — for the one place someone's
 * profile picture is the focal point of the screen (a track record's hero).
 * Only a REAL photo expands; tapping an initials fallback (no avatar_url, no
 * cached picture) does nothing, since there is nothing bigger to show.
 *
 * Deliberately no pinch-zoom library: a static full-screen `contain` image
 * is what "show the full version" needs, and adding one would be a new
 * native dependency — not OTA-shippable, unlike this.
 */
export default function ExpandableAvatar({ profile, uid, name, size = 40, gradient = false, style }) {
  const [open, setOpen] = useState(false);
  // Same two ways of resolving a picture as Avatar itself (see its own
  // comment) — mirrored here rather than imported, since it's the one bit of
  // Avatar's internals a wrapper needs to know "is there something to expand."
  const cached = useSyncExternalStore(
    subscribeAvatars,
    () => (uid ? cachedAvatar(uid) : null),
    () => null
  );
  const source = avatarSource(profile) || (cached ? { uri: cached } : null);

  return (
    <>
      <Pressable onPress={() => source && setOpen(true)} disabled={!source} hitSlop={4}>
        <Avatar profile={profile} uid={uid} name={name} size={size} gradient={gradient} style={style} />
      </Pressable>
      {source ? (
        <Modal visible={open} transparent animationType="fade" onRequestClose={() => setOpen(false)}>
          <Pressable style={styles.backdrop} onPress={() => setOpen(false)}>
            <Image source={source} style={styles.full} resizeMode="contain" />
            <Pressable style={styles.closeBtn} onPress={() => setOpen(false)} hitSlop={12}>
              <Ionicons name="close-circle" size={34} color="rgba(255,255,255,0.9)" />
            </Pressable>
          </Pressable>
        </Modal>
      ) : null}
    </>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.92)", alignItems: "center", justifyContent: "center" },
  full: { width: "88%", aspectRatio: 1, borderRadius: 16 },
  closeBtn: { position: "absolute", top: 54, right: 20 },
});
