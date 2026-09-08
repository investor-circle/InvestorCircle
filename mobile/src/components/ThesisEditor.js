import { useCallback, useRef, useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  Pressable,
  Image,
  Modal,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
} from "react-native";
import { Ionicons } from "@expo/vector-icons";
import {
  parseThesis,
  serializeThesis,
  THESIS_MAX_CHARS,
  THESIS_MAX_IMAGES,
  THESIS_MAX_MB,
  THESIS_EMOJIS,
} from "../utils/format";
import { pickThesisImages } from "../services/thesisImage";
import { colors, fonts } from "../theme/colors";

/**
 * Rich thesis editor — the mobile counterpart of the web's ThesisEditor
 * (src/features/recommendations/Recommendations.jsx). Same toolbar (bold,
 * italic, link, emoji, image), the same limits (THESIS_MAX_CHARS/IMAGES/MB),
 * and the same storage format (serializeThesis) — so a thesis written on one
 * client edits, and renders (see ThesisText), identically on the other.
 *
 * `value`/`onChange` carry the SERIALIZED string, the same contract as the
 * web's <ThesisEditor value={thesis} onChange={setThesis}/>; the caller's
 * state is just a string, this component owns the working {text, images}.
 *
 * Two adaptations for native, both purely presentational — the format and
 * limits are unchanged:
 *  - Link insertion is a small modal (URL + label fields) rather than two
 *    window.prompt() calls, which don't exist on-device.
 *  - Bold/italic wrap the current selection via TextInput's controlled
 *    `selection` prop rather than a DOM textarea's setSelectionRange.
 */
export default function ThesisEditor({ value, onChange }) {
  const init = useRef(parseThesis(value));
  const [text, setText] = useState(init.current?.text || "");
  const [images, setImages] = useState(init.current?.images || []);
  const [selection, setSelection] = useState({ start: 0, end: 0 });
  const [showEmoji, setShowEmoji] = useState(false);
  const [imgErr, setImgErr] = useState("");
  const [imgBusy, setImgBusy] = useState(false);
  const [linkModal, setLinkModal] = useState(null); // { url, label } while open

  const emit = useCallback(
    (t, im) => onChange(serializeThesis({ text: t ?? text, images: im ?? images })),
    [onChange, text, images]
  );

  const setTextAt = (next, caretStart, caretEnd) => {
    const v = next.slice(0, THESIS_MAX_CHARS);
    setText(v);
    emit(v, undefined);
    if (caretStart != null) setSelection({ start: caretStart, end: caretEnd ?? caretStart });
  };

  const wrapSel = (open, close) => {
    const { start, end } = selection;
    const sel = text.slice(start, end) || "text";
    const next = text.slice(0, start) + open + sel + close + text.slice(end);
    setTextAt(next, start + open.length, start + open.length + sel.length);
  };

  const addEmoji = (em) => {
    const at = selection.start ?? text.length;
    const next = text.slice(0, at) + em + text.slice(at);
    setTextAt(next, at + em.length, at + em.length);
    setShowEmoji(false);
  };

  const openLinkModal = () => {
    const { start, end } = selection;
    setLinkModal({ url: "", label: text.slice(start, end) || "" });
  };

  const confirmLink = () => {
    const url = (linkModal?.url || "").trim();
    if (!url.startsWith("http")) { setLinkModal(null); return; }
    const label = (linkModal?.label || "").trim() || "Click for more details";
    const { start, end } = selection;
    const str = `[${label}](${url})`;
    const next = text.slice(0, start) + str + text.slice(end);
    setTextAt(next, start + str.length, start + str.length);
    setLinkModal(null);
  };

  const handlePickImages = async () => {
    if (images.length >= THESIS_MAX_IMAGES) return;
    setImgErr("");
    setImgBusy(true);
    const res = await pickThesisImages(images.length);
    setImgBusy(false);
    if (res.error) { setImgErr(res.error); return; }
    if (res.images?.length) {
      const next = [...images, ...res.images];
      setImages(next);
      emit(undefined, next);
    }
  };

  const removeImage = (i) => {
    const next = images.filter((_, j) => j !== i);
    setImages(next);
    emit(undefined, next);
    setImgErr("");
  };

  const pct = text.length / THESIS_MAX_CHARS;
  const counterColor = pct > 0.9 ? colors.loss : pct > 0.75 ? colors.amber : colors.muted;
  const atMaxImages = images.length >= THESIS_MAX_IMAGES;
  const linkValid = (linkModal?.url || "").trim().startsWith("http");

  return (
    <View>
      <View style={styles.toolbar}>
        <Pressable style={styles.tbtn} onPress={() => wrapSel("**", "**")} hitSlop={4}>
          <Text style={styles.tbtnBold}>B</Text>
        </Pressable>
        <Pressable style={styles.tbtn} onPress={() => wrapSel("_", "_")} hitSlop={4}>
          <Text style={styles.tbtnItalic}>I</Text>
        </Pressable>
        <Pressable style={styles.tbtn} onPress={openLinkModal} hitSlop={4}>
          <Ionicons name="link" size={15} color={colors.ink} />
        </Pressable>
        <Pressable
          style={[styles.tbtn, showEmoji && styles.tbtnActive]}
          onPress={() => setShowEmoji((v) => !v)}
          hitSlop={4}
        >
          <Text style={{ fontSize: 15 }}>😊</Text>
        </Pressable>
        <Pressable
          style={[styles.tbtn, atMaxImages && styles.tbtnOff]}
          onPress={handlePickImages}
          disabled={atMaxImages || imgBusy}
          hitSlop={4}
        >
          {imgBusy ? (
            <ActivityIndicator size="small" color={colors.ink} />
          ) : (
            <Ionicons name="image-outline" size={15} color={colors.ink} />
          )}
        </Pressable>
        <Text style={styles.tbHint}>
          📷 Max {THESIS_MAX_IMAGES} images{"\n"}· {THESIS_MAX_MB}MB each
        </Text>
      </View>

      {showEmoji && (
        <View style={styles.emojiGrid}>
          {THESIS_EMOJIS.map((em) => (
            <Pressable key={em} style={styles.emojiCell} onPress={() => addEmoji(em)}>
              <Text style={{ fontSize: 18 }}>{em}</Text>
            </Pressable>
          ))}
        </View>
      )}

      <TextInput
        style={styles.textarea}
        value={text}
        onChangeText={(v) => setTextAt(v)}
        onSelectionChange={(e) => setSelection(e.nativeEvent.selection)}
        selection={selection}
        multiline
        maxLength={THESIS_MAX_CHARS}
        placeholder={`Share your investment thesis… Use **bold**, _italic_, links · Max ${THESIS_MAX_CHARS} chars`}
        placeholderTextColor={colors.muted}
      />

      <View style={styles.counterRow}>
        <Text style={[styles.counter, { color: counterColor }]}>
          {text.length}/{THESIS_MAX_CHARS}
        </Text>
      </View>

      {imgErr ? <Text style={styles.err}>{imgErr}</Text> : null}

      {images.length > 0 && (
        <View style={styles.previewRow}>
          {images.map((src, i) => (
            <View key={i} style={styles.previewWrap}>
              <Image source={{ uri: src }} style={styles.preview} />
              <Pressable style={styles.removeBtn} onPress={() => removeImage(i)} hitSlop={4}>
                <Ionicons name="close" size={13} color="#fff" />
              </Pressable>
              <View style={styles.indexBadge}>
                <Text style={styles.indexBadgeText}>#{i + 1}</Text>
              </View>
            </View>
          ))}
        </View>
      )}

      <Modal visible={!!linkModal} animationType="fade" transparent onRequestClose={() => setLinkModal(null)}>
        <Pressable style={styles.backdrop} onPress={() => setLinkModal(null)} />
        <KeyboardAvoidingView
          behavior={Platform.OS === "ios" ? "padding" : undefined}
          style={styles.modalWrap}
          pointerEvents="box-none"
        >
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Insert link</Text>
            <Text style={styles.modalLabel}>URL</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="https://…"
              placeholderTextColor={colors.muted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="url"
              value={linkModal?.url || ""}
              onChangeText={(v) => setLinkModal((m) => ({ ...m, url: v }))}
              autoFocus
            />
            <Text style={styles.modalLabel}>Link text</Text>
            <TextInput
              style={styles.modalInput}
              placeholder="Click for more details"
              placeholderTextColor={colors.muted}
              value={linkModal?.label || ""}
              onChangeText={(v) => setLinkModal((m) => ({ ...m, label: v }))}
            />
            <View style={styles.modalActions}>
              <Pressable style={styles.modalCancel} onPress={() => setLinkModal(null)}>
                <Text style={styles.modalCancelText}>Cancel</Text>
              </Pressable>
              <Pressable
                style={[styles.modalConfirm, !linkValid && styles.modalConfirmOff]}
                onPress={confirmLink}
                disabled={!linkValid}
              >
                <Text style={styles.modalConfirmText}>Insert</Text>
              </Pressable>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  toolbar: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: colors.surface2,
    borderTopLeftRadius: 10,
    borderTopRightRadius: 10,
    borderWidth: 1,
    borderColor: colors.line,
    borderBottomWidth: 0,
  },
  tbtn: {
    minWidth: 30,
    height: 30,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: 7,
    backgroundColor: colors.surface,
    alignItems: "center",
    justifyContent: "center",
  },
  tbtnActive: { backgroundColor: colors.accentSoft },
  tbtnOff: { opacity: 0.45 },
  tbtnBold: { fontFamily: fonts.extrabold, fontSize: 14, color: colors.ink },
  tbtnItalic: { fontFamily: fonts.regular, fontStyle: "italic", fontSize: 14, color: colors.ink },
  tbHint: {
    marginLeft: "auto",
    fontFamily: fonts.regular,
    fontSize: 9.5,
    color: colors.muted,
    textAlign: "right",
    lineHeight: 12,
  },
  emojiGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    borderWidth: 1,
    borderColor: colors.line,
    borderTopWidth: 0,
    backgroundColor: colors.surface,
    paddingVertical: 4,
  },
  emojiCell: { width: "10%", alignItems: "center", justifyContent: "center", paddingVertical: 4 },
  textarea: {
    borderWidth: 1,
    borderColor: colors.line,
    borderBottomLeftRadius: 10,
    borderBottomRightRadius: 10,
    backgroundColor: colors.surface,
    color: colors.ink,
    fontFamily: fonts.regular,
    fontSize: 14,
    lineHeight: 20,
    padding: 12,
    minHeight: 90,
    textAlignVertical: "top",
  },
  counterRow: { flexDirection: "row", justifyContent: "flex-end", marginTop: 3 },
  counter: { fontFamily: fonts.medium, fontSize: 11 },
  err: { color: colors.loss, fontFamily: fonts.medium, fontSize: 12, marginTop: 4 },
  previewRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  previewWrap: { position: "relative" },
  preview: { width: 96, height: 96, borderRadius: 8, borderWidth: 1, borderColor: colors.line },
  removeBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    width: 20,
    height: 20,
    borderRadius: 10,
    backgroundColor: "rgba(0,0,0,0.65)",
    alignItems: "center",
    justifyContent: "center",
  },
  indexBadge: {
    position: "absolute",
    bottom: 4,
    left: 4,
    backgroundColor: "rgba(0,0,0,0.5)",
    borderRadius: 3,
    paddingHorizontal: 4,
    paddingVertical: 1,
  },
  indexBadgeText: { color: "#fff", fontFamily: fonts.bold, fontSize: 9 },
  backdrop: { flex: 1, backgroundColor: "rgba(0,0,0,0.45)" },
  modalWrap: { position: "absolute", left: 0, right: 0, top: 0, bottom: 0, alignItems: "center", justifyContent: "center" },
  modalCard: {
    width: "86%",
    backgroundColor: colors.surface,
    borderRadius: 16,
    padding: 20,
  },
  modalTitle: { color: colors.ink, fontFamily: fonts.extrabold, fontSize: 17, marginBottom: 12 },
  modalLabel: { color: colors.muted, fontFamily: fonts.bold, fontSize: 12, marginBottom: 6, marginTop: 10 },
  modalInput: {
    borderWidth: 1,
    borderColor: colors.line2,
    backgroundColor: colors.surface2,
    borderRadius: 10,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    fontFamily: fonts.regular,
    fontSize: 14,
  },
  modalActions: { flexDirection: "row", gap: 10, marginTop: 18 },
  modalCancel: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 10, backgroundColor: colors.surface2 },
  modalCancelText: { color: colors.inkSoft, fontFamily: fonts.bold, fontSize: 14 },
  modalConfirm: { flex: 1, alignItems: "center", paddingVertical: 12, borderRadius: 10, backgroundColor: colors.accent },
  modalConfirmOff: { opacity: 0.45 },
  modalConfirmText: { color: "#fff", fontFamily: fonts.bold, fontSize: 14 },
});
