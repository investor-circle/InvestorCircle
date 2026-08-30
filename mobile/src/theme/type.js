import { fonts, colors } from "./colors";

// Reusable text presets so the whole app renders in Plus Jakarta Sans at the
// same sizes/weights the web app uses. RN can't synthesize a bold from a
// regular custom face — each weight must name its own loaded family — so use
// these presets (or `fonts.*`) instead of a bare fontWeight.
export const type = {
  // page title — matches web .page-title (26/800/-.6)
  pageTitle: { fontFamily: fonts.extrabold, fontSize: 24, letterSpacing: -0.6, color: colors.ink },
  // eyebrow — .eyebrow (12/800/1.4 uppercase accent)
  eyebrow: {
    fontFamily: fonts.extrabold,
    fontSize: 11,
    letterSpacing: 1.4,
    textTransform: "uppercase",
    color: colors.accent,
  },
  h2: { fontFamily: fonts.bold, fontSize: 18, letterSpacing: -0.3, color: colors.ink },
  h3: { fontFamily: fonts.bold, fontSize: 15, color: colors.ink },
  bodyStrong: { fontFamily: fonts.semibold, fontSize: 14, color: colors.ink },
  body: { fontFamily: fonts.regular, fontSize: 14, color: colors.inkSoft },
  small: { fontFamily: fonts.medium, fontSize: 12, color: colors.muted },
  cap: {
    fontFamily: fonts.bold,
    fontSize: 10,
    letterSpacing: 0.5,
    textTransform: "uppercase",
    color: colors.muted,
  },
};
