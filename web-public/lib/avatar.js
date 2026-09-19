// Shared by the three per-page opengraph-image.jsx files (security, idea,
// investor) and investor/[username]/page.jsx's own avatar-fallback circle —
// consolidated after being copy-pasted verbatim into all three. Unlike
// computeConsensus/computeIci (deliberately duplicated ACROSS this project
// and the main repo, which are separately deployed), everything here lives
// inside this one project, so there's no deployment boundary forcing a
// second copy.
export const initialsOf = (name) => name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();
