import { useState } from "react";
import { View, Text, Pressable, StyleSheet, ScrollView, Share } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import * as WebBrowser from "expo-web-browser";
import { useAuth } from "../../src/context/AuthContext";
import { colors, fonts, GRADIENT } from "../../src/theme/colors";
import Avatar from "../../src/components/Avatar";
import InviteSheet from "../../src/components/InviteSheet";
import { withBoundary } from "../../src/components/ErrorBoundary";
import { WEB_ORIGIN, profileUrl } from "../../src/utils/links";

const PRIVACY_URL = `${WEB_ORIGIN}/#/privacy`;

function ProfileScreen() {
  const { profile, logout, userIsAdmin } = useAuth();
  const router = useRouter();
  const [inviteOpen, setInviteOpen] = useState(false);

  // The web offers "Share this profile" on a profile page; the app offered no
  // way to hand anyone your own public track record, which is the one link a
  // member is most likely to want to send.
  const shareMine = async () => {
    const url = profileUrl(profile?.username);
    if (!profile?.username) return;
    try {
      await Share.share({ message: `My investment track record on myInvestorCircle — ${url}`, url });
    } catch (_) {
      /* user dismissed the OS sheet */
    }
  };

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <LinearGradient colors={GRADIENT.colors} start={GRADIENT.start} end={GRADIENT.end} style={styles.hero}>
          <Pressable onPress={() => router.push("/track-record")} style={{ alignItems: "center" }}>
            <Avatar profile={profile} size={78} style={styles.heroAvatar} />
            <Text style={styles.name}>{profile?.full_name || "—"}</Text>
          </Pressable>
          {profile?.username ? (
            <Pressable onPress={shareMine} hitSlop={8} style={styles.shareMine}>
              <Text style={styles.username}>@{profile.username}</Text>
              <Ionicons name="share-social-outline" size={15} color="rgba(255,255,255,0.85)" />
            </Pressable>
          ) : null}
          {userIsAdmin ? (
            <View style={styles.adminBadge}>
              <Text style={styles.adminBadgeText}>Admin</Text>
            </View>
          ) : null}
        </LinearGradient>

        <View style={styles.menu}>
          <MenuRow icon="ribbon-outline" label="Your track record" onPress={() => router.push("/track-record")} />
          <MenuRow icon="people-outline" label="Your network" onPress={() => router.push("/network")} />
          <MenuRow icon="search-outline" label="Find investors" onPress={() => router.push("/people")} />
          <MenuRow icon="gift-outline" label="Invite friends" onPress={() => setInviteOpen(true)} />
          <MenuRow icon="albums-outline" label="Your Circles" onPress={() => router.push("/circles")} />
          <MenuRow icon="briefcase-outline" label="Portfolio" onPress={() => router.push("/portfolio")} />
          <MenuRow icon="stats-chart-outline" label="Market Insights" onPress={() => router.push("/market")} />
          <MenuRow icon="notifications-outline" label="Notifications" onPress={() => router.push("/notifications")} />
          <MenuRow icon="settings-outline" label="Settings" onPress={() => router.push("/settings")} last />
        </View>

        {/* Everything above is somewhere you go to DO something. These are
            reference pages people look for once, so they sit in their own
            group below rather than competing with the app's actual work. */}
        <View style={styles.menu}>
          <MenuRow icon="mail-outline" label="Contact us" onPress={() => router.push("/contact")} />
          <MenuRow icon="information-circle-outline" label="About" onPress={() => router.push("/about")} />
          {/* Opened in a browser tab, not ported: it is a legal document that
              must match the web's word for word, and a copy inside the app
              would be a copy that drifts out of date. */}
          <MenuRow
            icon="shield-checkmark-outline"
            label="Privacy policy"
            onPress={() => WebBrowser.openBrowserAsync(PRIVACY_URL).catch(() => {})}
          />
          <MenuRow icon="bug-outline" label="Diagnostics" onPress={() => router.push("/debug")} last />
        </View>

        {profile?.email ? (
          <View style={styles.infoCard}>
            <Ionicons name="mail-outline" size={18} color={colors.muted} />
            <Text style={styles.infoText}>{profile.email}</Text>
          </View>
        ) : null}

        <Pressable style={styles.signOutButton} onPress={logout}>
          <Ionicons name="log-out-outline" size={18} color={colors.loss} />
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      </ScrollView>

      <InviteSheet
        visible={inviteOpen}
        username={profile?.username}
        onClose={() => setInviteOpen(false)}
      />
    </SafeAreaView>
  );
}

function MenuRow({ icon, label, onPress, last }) {
  return (
    <Pressable style={[styles.menuRow, !last && styles.menuRowBorder]} onPress={onPress}>
      <Ionicons name={icon} size={20} color={colors.accentInk} />
      <Text style={styles.menuLabel}>{label}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  menu: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    marginHorizontal: 16,
    marginTop: 16,
    overflow: "hidden",
  },
  menuRow: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 16, paddingVertical: 15 },
  menuRowBorder: { borderBottomWidth: 1, borderBottomColor: colors.line },
  menuLabel: { flex: 1, color: colors.ink, fontFamily: fonts.semibold, fontSize: 15 },
  hero: {
    alignItems: "center",
    paddingTop: 36,
    paddingBottom: 32,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
  heroAvatar: { borderWidth: 2, borderColor: "rgba(255,255,255,0.55)", marginBottom: 10 },
  avatar: {
    width: 88,
    height: 88,
    borderRadius: 44,
    backgroundColor: "rgba(255,255,255,0.22)",
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 14,
  },
  avatarText: { color: "#fff", fontFamily: fonts.extrabold, fontSize: 30 },
  name: { color: "#fff", fontFamily: fonts.extrabold, fontSize: 22 },
  shareMine: { flexDirection: "row", alignItems: "center", gap: 6, marginTop: 3 },
  username: { color: "rgba(255,255,255,0.85)", fontFamily: fonts.medium, fontSize: 14 },
  adminBadge: {
    marginTop: 10,
    backgroundColor: "rgba(255,255,255,0.22)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 4,
  },
  adminBadgeText: { color: "#fff", fontFamily: fonts.bold, fontSize: 12 },
  infoCard: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 16,
    marginHorizontal: 16,
    marginTop: 16,
  },
  infoText: { color: colors.inkSoft, fontFamily: fonts.medium, fontSize: 14 },
  signOutButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 8,
    marginHorizontal: 16,
    marginTop: 24,
    borderWidth: 1,
    borderColor: colors.lossSoft,
    backgroundColor: colors.lossSoft,
    borderRadius: 12,
    paddingVertical: 14,
  },
  signOutText: { color: colors.loss, fontFamily: fonts.bold, fontSize: 15 },
});

export default withBoundary(ProfileScreen, "Profile");
