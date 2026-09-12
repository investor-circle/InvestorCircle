import { Text, StyleSheet } from "react-native";
import { colors, fonts } from "../theme/colors";

// The standard SEBI/regulatory disclaimer shown beneath every idea/post —
// mirrors the web's IDEA_DISCLAIMER_TEXT in src/components/common.jsx
// verbatim, so wording can never drift between platforms. Deliberately full
// text, never abbreviated — this is compliance copy, not UI copy. Visual
// weight is kept low via typography (small, muted) rather than by shortening
// the text, so it reads as fine print without competing with the card's own
// content for attention.
export const IDEA_DISCLAIMER_TEXT =
  "This is the publisher’s personal view, for informational purposes only—not investment advice or a solicitation to buy/sell. myInvestorCircle (mic) does not endorse or provide this view. Please do your own research. Investments are subject to market risks.";

export default function IdeaDisclaimer({ style }) {
  return <Text style={[styles.text, style]}>{IDEA_DISCLAIMER_TEXT}</Text>;
}

const styles = StyleSheet.create({
  text: {
    color: colors.muted,
    fontFamily: fonts.regular,
    fontSize: 10,
    lineHeight: 14,
    marginTop: 8,
  },
});
