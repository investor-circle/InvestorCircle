import { useState } from "react";
import { Text, StyleSheet } from "react-native";
import { colors, fonts } from "../theme/colors";

// The standard SEBI/regulatory disclaimer shown beneath every idea/post —
// mirrors the web's IDEA_DISCLAIMER_TEXT in src/components/common.jsx
// verbatim, so wording can never drift between platforms. Deliberately full
// text, never abbreviated — this is compliance copy, not UI copy.
//
// On the idea detail screen (defaultExpanded, driven by RecoCard's own
// expandThesis flag) there's no space pressure, so it renders plainly. On
// every compact list card (Pulse, Feed, Track record, Circle pages) a full
// paragraph competed with the card's own content, so it starts collapsed to
// a single "Disclaimer" link that expands to the identical full text in
// place — same Read more/Show less idea ThesisText already uses. No
// stopPropagation needed here: a nested Text with its own onPress claims the
// tap before it reaches the card's outer Pressable in React Native, unlike
// DOM click bubbling on web.
export const IDEA_DISCLAIMER_TEXT =
  "This is the publisher’s personal view, for informational purposes only—not investment advice or a solicitation to buy/sell. myInvestorCircle (mic) does not endorse or provide this view. Please do your own research. Investments are subject to market risks.";

export default function IdeaDisclaimer({ defaultExpanded = false, style }) {
  const [expanded, setExpanded] = useState(false);

  if (defaultExpanded) {
    return <Text style={[styles.text, style]}>{IDEA_DISCLAIMER_TEXT}</Text>;
  }

  return (
    <Text style={[styles.text, style]}>
      {expanded ? (
        <>
          {IDEA_DISCLAIMER_TEXT}{" "}
          <Text style={styles.link} onPress={() => setExpanded(false)}>
            Hide
          </Text>
        </>
      ) : (
        <Text style={styles.link} onPress={() => setExpanded(true)}>
          Disclaimer
        </Text>
      )}
    </Text>
  );
}

const styles = StyleSheet.create({
  text: {
    color: colors.muted,
    fontFamily: fonts.regular,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 8,
  },
  link: {
    color: colors.accentInk,
    fontFamily: fonts.bold,
  },
});
