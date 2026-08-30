import { View, Text, Pressable, StyleSheet, ScrollView } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../../src/context/AuthContext";
import { colors, fonts, GRADIENT } from "../../src/theme/colors";
import { initialsOf } from "../../src/utils/format";

export default function ProfileScreen() {
  const { profile, logout, userIsAdmin } = useAuth();

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <ScrollView contentContainerStyle={{ paddingBottom: 24 }}>
        <LinearGradient colors={GRADIENT.colors} start={GRADIENT.start} end={GRADIENT.end} style={styles.hero}>
          <View style={styles.avatar}>
            <Text style={styles.avatarText}>{initialsOf(profile?.full_name)}</Text>
          </View>
          <Text style={styles.name}>{profile?.full_name || "—"}</Text>
          {profile?.username ? <Text style={styles.username}>@{profile.username}</Text> : null}
          {userIsAdmin ? (
            <View style={styles.adminBadge}>
              <Text style={styles.adminBadgeText}>Admin</Text>
            </View>
          ) : null}
        </LinearGradient>

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
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  hero: {
    alignItems: "center",
    paddingTop: 36,
    paddingBottom: 32,
    borderBottomLeftRadius: 24,
    borderBottomRightRadius: 24,
  },
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
  username: { color: "rgba(255,255,255,0.85)", fontFamily: fonts.medium, fontSize: 14, marginTop: 3 },
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
