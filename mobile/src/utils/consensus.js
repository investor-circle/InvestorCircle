/**
 * Market consensus across ideas for a ticker.
 *
 * computeConsensus and computeTrend are PORTED VERBATIM from the web app's
 * src/utils/format.js. Both encode product decisions that are documented in
 * their own comments there — in particular that the label is derived from the
 * bull/bear GAP rather than bullPct alone, so the label and the strength
 * gauge can never contradict each other. A paraphrase would quietly lose
 * that, so this is a copy.
 *
 * Pure; no imports. The colour helper is NOT ported: the web returns CSS
 * variables, which mean nothing in React Native, so the same decision is
 * expressed against the RN theme instead.
 */

export function computeConsensus(recos=[]) {
  if (!recos.length) return {bull:0,bear:0,neutral:0,bullPct:0,bearPct:0,neutralPct:0,strength:0,label:'No Data',total:0};
  const bull = recos.filter(r=>r.recommendation_type==='Buy').length;
  const bear = recos.filter(r=>r.recommendation_type==='Sell').length;
  const total = recos.length;
  const bullPct = Math.round(bull/total*100);
  const bearPct = Math.round(bear/total*100);
  const neutralPct = 100-bullPct-bearPct;
  const strength = Math.abs(bullPct-bearPct);
  // Label is derived from `strength` (the same bull/bear gap the strength
  // gauge shows), not from bullPct/bearPct in isolation — previously a stock
  // could be labeled "Strong Bullish" purely from clearing a 70% bullPct
  // threshold even with a large dissenting Sell share (e.g. 75%/25%, a gap of
  // only 50), which visibly contradicted a "moderate" strength score right
  // next to it. Keeping one shared scale keeps the label and the gauge in
  // agreement.
  const leaning = bullPct>bearPct?'Bullish':bearPct>bullPct?'Bearish':'Neutral';
  const label = leaning==='Neutral' ? 'Neutral' : strength>=60?`Strong ${leaning}`:strength>=20?leaning:'Neutral';
  return {bull,bear,neutral:total-bull-bear,bullPct,bearPct,neutralPct,strength,label,total};
}

export function computeTrend(recos=[], months=6) {
  if (!recos.length) return [];
  const now=new Date(), result=[];
  for (let i=months-1; i>=0; i--) {
    const from=new Date(now.getFullYear(),now.getMonth()-i,1);
    const to  =new Date(now.getFullYear(),now.getMonth()-i+1,0);
    const mo  =recos.filter(r=>{ const d=new Date(r.created_at); return d>=from&&d<=to; });
    if (mo.length) {
      result.push(Math.round((mo.filter(r=>r.recommendation_type==='Buy').length/mo.length)*100));
    } else if (result.length) result.push(result[result.length-1]);
  }
  return result;
}


/**
 * Colour for a consensus gauge.
 *
 * Same decision as the web's consensusStrengthColor: colour by WHICH SIDE
 * leads, not by magnitude. Strength is direction-agnostic, so colouring by
 * magnitude alone painted a strongly-bearish stock in the same green used for
 * bullish everywhere else. Returns theme keys rather than CSS variables.
 */
export function consensusColor(cons, colors) {
  if (!cons) return colors.muted;
  if (cons.bullPct > cons.bearPct) return colors.gain;
  if (cons.bearPct > cons.bullPct) return colors.loss;
  return colors.muted;
}

/**
 * Group a flat list of ideas by ticker, with each group's consensus.
 * Sorted by how many ideas back each ticker — the busiest first, which is
 * what makes a consensus worth reading at all.
 */
export function consensusByTicker(recos) {
  const groups = new Map();
  for (const r of recos || []) {
    const t = String(r?.ticker || "").trim().toUpperCase();
    if (!t) continue;
    if (!groups.has(t)) groups.set(t, []);
    groups.get(t).push(r);
  }
  return [...groups.entries()]
    .map(([ticker, list]) => ({
      ticker,
      assetName: list.find((r) => r.asset_name)?.asset_name || ticker,
      recos: list,
      consensus: computeConsensus(list),
    }))
    .sort((a, b) => b.recos.length - a.recos.length || a.ticker.localeCompare(b.ticker));
}
