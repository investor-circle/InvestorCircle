import { View, Text, Pressable, StyleSheet } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../src/context/AuthContext";
import { colors } from "../../src/theme/colors";
import { initialsOf } from "../../src/utils/format";

export default function ProfileScreen() {
  const { profile, logout, userIsAdmin } = useAuth();

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>{initialsOf(profile?.full_name)}</Text>
        </View>
        <Text style={styles.name}>{profile?.full_name || "—"}</Text>
        {profile?.username ? <Text style={styles.username}>@{profile.username}</Text> : null}
        {userIsAdmin ? <Text style={styles.adminBadge}>Admin</Text> : null}
      </View>

      <Pressable style={styles.signOutButton} onPress={logout}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
  header: { alignItems: "center", paddingTop: 32, paddingBottom: 24 },
  avatar: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.cardBorder,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 12,
  },
  avatarText: { color: colors.text, fontSize: 28, fontWeight: "700" },
  name: { color: colors.text, fontSize: 20, fontWeight: "700" },
  username: { color: colors.textMuted, fontSize: 14, marginTop: 2 },
  adminBadge: { color: colors.accent, fontSize: 12, fontWeight: "700", marginTop: 8 },
  signOutButton: {
    marginHorizontal: 16,
    marginTop: "auto",
    marginBottom: 24,
    borderWidth: 1,
    borderColor: colors.red,
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
  },
  signOutText: { color: colors.red, fontSize: 15, fontWeight: "600" },
});
