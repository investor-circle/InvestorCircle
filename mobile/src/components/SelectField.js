import { useState } from "react";
import { View, Text, StyleSheet, Pressable, Modal, FlatList, TextInput } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import { colors, fonts } from "../theme/colors";

/**
 * Compact select — a field that looks like a single row (current value +
 * chevron) and opens a bottom sheet with the full option list on tap.
 *
 * Exists because a long option list (e.g. ~30 sectors) rendered as inline
 * chips, the way a short list like Horizon/Conviction reasonably can be,
 * either wraps across many rows and dominates the form, or forces the whole
 * screen to scroll past it to reach anything below. A native app doesn't
 * paginate a picker inline — it opens one. This is the RN-without-a-picker-
 * dependency way to get that: react-native's own <Modal>, no extra native
 * module. Mirrors, in behaviour, what the web's plain <select> already is —
 * one visible row, the choices tucked away until asked for.
 */
export default function SelectField({ value, onChange, options, placeholder = "Select…", searchable = false, disabled = false, locked = false, lockedLabel }) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");

  const filtered = searchable && q.trim()
    ? options.filter((o) => o.toLowerCase().includes(q.trim().toLowerCase()))
    : options;

  if (locked) {
    return (
      <View style={styles.lockedRow}>
        <Ionicons name="lock-closed" size={13} color={colors.muted} />
        <Text style={styles.lockedText}>{lockedLabel || value}</Text>
      </View>
    );
  }

  return (
    <>
      <Pressable
        style={[styles.field, disabled && styles.fieldDisabled]}
        disabled={disabled}
        onPress={() => setOpen(true)}
      >
        <Text style={[styles.fieldText, !value && styles.placeholder]} numberOfLines={1}>
          {value || placeholder}
        </Text>
        <Ionicons name="chevron-down" size={16} color={colors.muted} />
      </Pressable>

      <Modal visible={open} animationType="slide" transparent onRequestClose={() => setOpen(false)}>
        <Pressable style={styles.backdrop} onPress={() => setOpen(false)} />
        <SafeAreaView style={styles.sheet} edges={["bottom"]}>
          <View style={styles.sheetHandle} />
          {searchable ? (
            <View style={styles.searchWrap}>
              <Ionicons name="search" size={15} color={colors.muted} />
              <TextInput
                style={styles.searchInput}
                placeholder="Search…"
                placeholderTextColor={colors.muted}
                value={q}
                onChangeText={setQ}
                autoFocus
              />
            </View>
          ) : null}
          <FlatList
            data={filtered}
            keyExtractor={(item) => String(item)}
            style={{ maxHeight: 360 }}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                style={styles.option}
                onPress={() => {
                  onChange(item);
                  setOpen(false);
                  setQ("");
                }}
              >
                <Text style={[styles.optionText, item === value && styles.optionTextOn]}>{item}</Text>
                {item === value ? <Ionicons name="checkmark" size={17} color={colors.accentInk} /> : null}
              </Pressable>
            )}
            ListEmptyComponent={<Text style={styles.empty}>No matches.</Text>}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  field: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    borderWidth: 1,
    borderColor: colors.line2,
    backgroundColor: colors.surface,
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  fieldDisabled: { opacity: 0.5 },
  fieldText: { flex: 1, color: colors.ink, fontFamily: fonts.semibold, fontSize: 14 },
  placeholder: { color: colors.muted, fontFamily: fonts.regular },
  lockedRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface2,
    borderRadius: 11,
    paddingHorizontal: 13,
    paddingVertical: 11,
  },
  lockedText: { color: colors.inkSoft, fontFamily: fonts.semibold, fontSize: 14 },
  backdrop: { flex: 1, backgroundColor: "rgba(15,15,35,0.4)" },
  sheet: {
    backgroundColor: colors.surface,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    paddingTop: 10,
    paddingBottom: 8,
    maxHeight: "70%",
  },
  sheetHandle: { width: 36, height: 4, borderRadius: 2, backgroundColor: colors.line2, alignSelf: "center", marginBottom: 10 },
  searchWrap: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    marginHorizontal: 16,
    marginBottom: 8,
    paddingHorizontal: 12,
    paddingVertical: 9,
    borderRadius: 10,
    backgroundColor: colors.surface2,
  },
  searchInput: { flex: 1, color: colors.ink, fontFamily: fonts.regular, fontSize: 14, padding: 0 },
  option: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: 18,
    paddingVertical: 13,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  optionText: { color: colors.ink, fontFamily: fonts.regular, fontSize: 15 },
  optionTextOn: { fontFamily: fonts.bold, color: colors.accentInk },
  empty: { color: colors.muted, fontFamily: fonts.regular, fontSize: 14, textAlign: "center", padding: 20 },
});
