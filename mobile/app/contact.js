import { useCallback, useEffect, useRef, useState } from "react";
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
  Linking,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { useAuth } from "../src/context/AuthContext";
import { submitContactForm } from "../src/services/api/lookupsApi";
import { colors, fonts } from "../src/theme/colors";
import { withBoundary } from "../src/components/ErrorBoundary";

/**
 * Contact Us — the same form, the same endpoint and the same categories as
 * the web's Contact page, so a message sent from a phone lands in the same
 * contact_submissions table and is answered the same way.
 *
 * Two deliberate differences from the web version. The name and email are
 * pre-filled from the signed-in profile (on the web this page is also
 * reachable logged-out, where it cannot be). And the feature-voting and FAQ
 * cards are not here: they are marketing surface for a landing page, not
 * something to carry into an app someone has already installed.
 */

// These keys must match CONTACT_CATEGORIES in api/_lib/handlers/lookups.js —
// the server rejects anything outside its own list with a 400.
const CATEGORIES = [
  { key: "bug", label: "Report a bug", emoji: "🐛", subject: "Bug Report" },
  { key: "feature", label: "Suggest a feature", emoji: "💡", subject: "Feature / Idea Suggestion" },
  { key: "question", label: "Ask a question", emoji: "❓", subject: "Question" },
  { key: "partner", label: "Partnerships", emoji: "🤝", subject: "Partnership Inquiry" },
  { key: "media", label: "Media & press", emoji: "📰", subject: "Media & Press" },
  { key: "misleading", label: "Misleading content", emoji: "⚠️", subject: "Report: Misleading Content" },
  { key: "abuse", label: "Abuse / fake profile", emoji: "🚫", subject: "Report: Abuse / Fake Profile" },
  { key: "other", label: "Something else", emoji: "✍️", subject: "General Enquiry" },
];

const SUPPORT_EMAIL = "hello@myinvestorcircle.com";
// Same rule the server applies (EMAIL_RE in api/_lib/handlers/lookups.js), so
// the form can say what's wrong without a round-trip to a 400.
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function ContactScreen() {
  const router = useRouter();
  const { profile } = useAuth();

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [subject, setSubject] = useState("");
  const [category, setCategory] = useState("");
  const [message, setMessage] = useState("");
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState("");
  const mounted = useRef(true);
  useEffect(() => () => { mounted.current = false; }, []);

  // Seed from the profile once it arrives — it can be null on first render.
  // Only ever fills a field the person hasn't typed into.
  useEffect(() => {
    if (!profile) return;
    setName((n) => n || profile.full_name || "");
    setEmail((e) => e || profile.email || "");
  }, [profile]);

  const pick = (cat) => {
    setCategory(cat.key);
    // Pre-fill the subject as the web does, but never overwrite one that has
    // been edited — changing your mind about the category shouldn't discard
    // a subject you wrote yourself.
    setSubject((s) => (!s || CATEGORIES.some((c) => c.subject === s) ? cat.subject : s));
  };

  const send = useCallback(async () => {
    if (!EMAIL_RE.test(email.trim())) return setError("Enter an email address we can reply to.");
    if (!subject.trim()) return setError("Add a subject.");
    if (!message.trim()) return setError("Add a message.");
    setError("");
    setSending(true);
    const err = await submitContactForm({
      name: name.trim(),
      email: email.trim(),
      subject: subject.trim(),
      category,
      message: message.trim(),
    });
    if (!mounted.current) return;
    setSending(false);
    if (err) setError(err);
    else setSent(true);
  }, [name, email, subject, category, message]);

  return (
    <SafeAreaView style={styles.flex} edges={["top"]}>
      <View style={styles.topbar}>
        <Pressable onPress={() => router.back()} hitSlop={10} style={{ width: 40 }}>
          <Ionicons name="chevron-back" size={24} color={colors.ink} />
        </Pressable>
        <Text style={styles.topTitle}>Contact us</Text>
        <View style={{ width: 40 }} />
      </View>

      <KeyboardAvoidingView style={styles.flex} behavior={Platform.OS === "ios" ? "padding" : undefined}>
        <ScrollView contentContainerStyle={styles.body} keyboardShouldPersistTaps="handled">
          {sent ? (
            <View style={[styles.card, styles.done]}>
              <Text style={styles.doneEmoji}>🎉</Text>
              <Text style={styles.doneTitle}>Message sent</Text>
              <Text style={styles.doneText}>
                Thanks for reaching out. We aim to reply within 1–2 business days.
              </Text>
              <Pressable
                style={styles.ghostBtn}
                onPress={() => {
                  setSent(false);
                  setSubject("");
                  setCategory("");
                  setMessage("");
                }}
              >
                <Text style={styles.ghostBtnText}>Send another</Text>
              </Pressable>
            </View>
          ) : (
            <>
              <View style={styles.card}>
                <Text style={styles.intro}>
                  Found a bug, have an idea, or just want to say hello? We read everything, and a lot
                  of what's in the app started as a message like yours.
                </Text>
                <Pressable
                  style={styles.mailRow}
                  onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`).catch(() => {})}
                >
                  <Ionicons name="mail-outline" size={18} color={colors.accentInk} />
                  <Text style={styles.mailText}>{SUPPORT_EMAIL}</Text>
                </Pressable>
              </View>

              <Text style={styles.sectionTitle}>What can we help with?</Text>
              <View style={styles.chips}>
                {CATEGORIES.map((c) => {
                  const on = category === c.key;
                  return (
                    <Pressable key={c.key} style={[styles.chip, on && styles.chipOn]} onPress={() => pick(c)}>
                      <Text style={styles.chipEmoji}>{c.emoji}</Text>
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{c.label}</Text>
                    </Pressable>
                  );
                })}
              </View>

              <View style={styles.card}>
                <Text style={styles.fieldLabel}>Your name</Text>
                <TextInput
                  style={styles.input}
                  placeholder="Your name"
                  placeholderTextColor={colors.muted}
                  value={name}
                  onChangeText={setName}
                />
                <Text style={styles.fieldLabel}>Email address</Text>
                <TextInput
                  style={styles.input}
                  placeholder="you@example.com"
                  placeholderTextColor={colors.muted}
                  value={email}
                  onChangeText={setEmail}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                />
                <Text style={styles.fieldLabel}>Subject</Text>
                <TextInput
                  style={styles.input}
                  placeholder="What's this about?"
                  placeholderTextColor={colors.muted}
                  value={subject}
                  onChangeText={setSubject}
                  maxLength={300}
                />
                <Text style={styles.fieldLabel}>Message</Text>
                <TextInput
                  style={[styles.input, styles.multiline]}
                  placeholder="Tell us what's on your mind…"
                  placeholderTextColor={colors.muted}
                  value={message}
                  onChangeText={setMessage}
                  multiline
                  maxLength={5000}
                />
                <Text style={styles.counter}>{message.length}/5000</Text>

                {error ? <Text style={styles.error}>{error}</Text> : null}

                <Pressable
                  style={[styles.sendBtn, sending && { opacity: 0.7 }]}
                  onPress={send}
                  disabled={sending}
                >
                  {sending ? (
                    <ActivityIndicator color="#fff" />
                  ) : (
                    <Text style={styles.sendText}>Send message</Text>
                  )}
                </Pressable>
              </View>

              <Pressable onPress={() => router.push("/about")} style={styles.aboutLink}>
                <Text style={styles.aboutLinkText}>About My Investor Circle</Text>
                <Ionicons name="chevron-forward" size={15} color={colors.muted} />
              </Pressable>
            </>
          )}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  flex: { flex: 1, backgroundColor: colors.bg },
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
  body: { padding: 16, paddingBottom: 44 },
  card: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 14,
    padding: 16,
    marginBottom: 16,
  },
  intro: { color: colors.inkSoft, fontFamily: fonts.regular, fontSize: 14, lineHeight: 23 },
  mailRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 9,
    marginTop: 14,
    backgroundColor: colors.surface2,
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  mailText: { color: colors.accentInk, fontFamily: fonts.bold, fontSize: 14 },
  sectionTitle: { color: colors.ink, fontFamily: fonts.bold, fontSize: 15, marginBottom: 9 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 18 },
  chip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 7,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line2,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipEmoji: { fontSize: 14 },
  chipText: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 12.5 },
  chipTextOn: { color: "#fff" },
  fieldLabel: { color: colors.muted, fontFamily: fonts.bold, fontSize: 12, marginTop: 12, marginBottom: 6 },
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
  multiline: { minHeight: 120, textAlignVertical: "top", paddingTop: 10 },
  counter: { color: colors.muted, fontFamily: fonts.regular, fontSize: 11, textAlign: "right", marginTop: 4 },
  error: { color: colors.loss, fontFamily: fonts.semibold, fontSize: 13, marginTop: 10 },
  sendBtn: {
    backgroundColor: colors.accent,
    borderRadius: 11,
    paddingVertical: 13,
    alignItems: "center",
    marginTop: 14,
  },
  sendText: { color: "#fff", fontFamily: fonts.bold, fontSize: 15 },
  done: { alignItems: "center", paddingVertical: 30 },
  doneEmoji: { fontSize: 38, marginBottom: 12 },
  doneTitle: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 18, marginBottom: 6 },
  doneText: {
    color: colors.muted,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 22,
    textAlign: "center",
  },
  ghostBtn: {
    marginTop: 18,
    borderWidth: 1,
    borderColor: colors.line2,
    borderRadius: 11,
    paddingHorizontal: 18,
    paddingVertical: 10,
  },
  ghostBtnText: { color: colors.inkSoft, fontFamily: fonts.bold, fontSize: 14 },
  aboutLink: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    paddingVertical: 12,
  },
  aboutLinkText: { color: colors.muted, fontFamily: fonts.semibold, fontSize: 13 },
});

export default withBoundary(ContactScreen, "Contact");
