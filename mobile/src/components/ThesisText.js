import { useMemo, useState } from "react";
import { View, Text, Image, Pressable, StyleSheet, Linking } from "react-native";
import { parseThesis, parseThesisRuns } from "../utils/format";
import { colors, fonts } from "../theme/colors";

/**
 * Renders a stored thesis with the same formatting the web's ThesisRenderer
 * shows (src/features/recommendations/Recommendations.jsx) — bold, italic,
 * links, and attached images — plus the same "isLong" expand/collapse
 * behavior. React Native has no dangerouslySetInnerHTML, so the markup is
 * parsed into styled <Text> runs (see parseThesisRuns) instead of an HTML
 * string; the visual result is the same for any thesis written on either
 * client, since both parse the identical stored format.
 */
export default function ThesisText({ thesis, previewLines = 3, defaultExpanded = false }) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const parsed = useMemo(() => parseThesis(thesis), [thesis]);
  const text = parsed?.text;
  const images = parsed?.images;
  const lines = useMemo(() => (text ? parseThesisRuns(text) : []), [text]);

  if (!parsed) return null;
  if (!text && !images?.length) return null;

  const isLong = text.length > 200 || images?.length > 0;
  const imgLabel = images?.length ? ` + ${images.length} image${images.length > 1 ? "s" : ""}` : "";

  const renderRuns = (clamp) =>
    text ? (
      <Text style={styles.text} numberOfLines={clamp ? previewLines : undefined}>
        {lines.map((runs, li) => (
          <Text key={li}>
            {li > 0 ? "\n" : ""}
            {runs.map((r, ri) =>
              r.link ? (
                <Text key={ri} style={styles.link} onPress={() => Linking.openURL(r.link).catch(() => {})}>
                  {r.text}
                </Text>
              ) : (
                <Text key={ri} style={[r.bold && styles.bold, r.italic && styles.italic]}>
                  {r.text}
                </Text>
              )
            )}
          </Text>
        ))}
      </Text>
    ) : null;

  const renderImages = () =>
    images?.map((src, i) => <Image key={i} source={{ uri: src }} style={styles.image} />);

  if (!isLong) {
    return (
      <View>
        {renderRuns(false)}
        {renderImages()}
      </View>
    );
  }

  return (
    <View>
      {expanded ? (
        <>
          {renderRuns(false)}
          {renderImages()}
          <Pressable onPress={() => setExpanded(false)} hitSlop={4}>
            <Text style={styles.toggle}>Show less ↑</Text>
          </Pressable>
        </>
      ) : (
        <>
          {renderRuns(true)}
          <Pressable onPress={() => setExpanded(true)} hitSlop={4}>
            <Text style={styles.toggle}>Read more{imgLabel} →</Text>
          </Pressable>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  text: { color: colors.inkSoft, fontFamily: fonts.regular, fontSize: 12.5, lineHeight: 18 },
  bold: { fontFamily: fonts.extrabold },
  italic: { fontStyle: "italic" },
  link: { color: colors.accentInk, textDecorationLine: "underline" },
  image: { width: "100%", height: 180, borderRadius: 8, marginTop: 8, borderWidth: 1, borderColor: colors.line },
  toggle: { color: colors.accentInk, fontFamily: fonts.bold, fontSize: 12, marginTop: 4 },
});
