/**
 * Security Page logic — Verified Research vs Market Views.
 *
 * The Security Page answers two separate questions:
 *   "What does verified research say?"             -> Buy / Hold / Sell
 *   "What are independent participants saying?"    -> Positive / Neutral / Negative
 *
 * The two datasets are kept completely apart: nothing here ever combines them
 * into one score, and a Market View can never enter a research figure (or the
 * reverse). The functions are pure and dependency-free so they can be copied
 * byte-for-byte to the three surfaces that render the page (web, mobile,
 * web-public — Metro and the separate Next project cannot import across the
 * repo). securityInsights.test.js asserts the three files are IDENTICAL, so
 * edit one and copy it to the others:
 *   src/utils/securityInsights.js
 *   mobile/src/utils/securityInsights.js
 *   web-public/lib/securityInsights.js
 *
 * Rows may be either shape the clients hold (snake_case DB row or camelCase
 * client object); the idea type is read from recommendation_type || recType.
 */

export const RESEARCH_TYPES = ['Buy', 'Hold', 'Sell'];
export const VIEW_TYPES = ['Positive', 'Neutral', 'Negative'];

const typeOf = (r) => (r && (r.recommendation_type || r.recType)) || 'Buy';
export const isViewRow = (r) => VIEW_TYPES.includes(typeOf(r));

/** Only professional recommendations (a Market View is dropped). */
export const researchRows = (rows) => (rows || []).filter((r) => !isViewRow(r));
/** Only Market Views (a recommendation is dropped). */
export const viewRows = (rows) => (rows || []).filter(isViewRow);

/**
 * Whole-number percentages that always add up to 100 (largest-remainder), so a
 * 3-way split never shows 33 / 33 / 33. All zeros when there is nothing.
 */
export function percentSplit(counts) {
  const total = counts.reduce((a, b) => a + b, 0);
  if (!total) return counts.map(() => 0);
  const raw = counts.map((c) => (c / total) * 100);
  const floors = raw.map(Math.floor);
  let left = 100 - floors.reduce((a, b) => a + b, 0);
  const order = raw
    .map((v, i) => ({ i, rem: v - floors[i] }))
    .sort((a, b) => b.rem - a.rem || a.i - b.i);
  for (let k = 0; left > 0 && k < order.length; k++, left--) floors[order[k].i] += 1;
  return floors;
}

/**
 * Verified Research distribution: Buy / Hold / Sell. A Market View in the
 * input is ignored. `keyOf` (optional) counts distinct publishers.
 */
export function researchBreakdown(rows, keyOf) {
  const list = researchRows(rows);
  let buy = 0, hold = 0, sell = 0;
  for (const r of list) {
    const t = typeOf(r);
    if (t === 'Hold') hold++;
    else if (t === 'Sell') sell++;
    else buy++; // 'Buy' and the legacy default
  }
  const [buyPct, holdPct, sellPct] = percentSplit([buy, hold, sell]);
  const publishers = keyOf ? new Set(list.map(keyOf).filter(Boolean)).size : null;
  return { total: list.length, buy, hold, sell, buyPct, holdPct, sellPct, publishers };
}

/** Market View distribution from exact counts (server aggregate). */
export function viewBreakdownFromCounts({ positive = 0, neutral = 0, negative = 0, contributors = null } = {}) {
  const p = Number(positive) || 0, n = Number(neutral) || 0, g = Number(negative) || 0;
  const [positivePct, neutralPct, negativePct] = percentSplit([p, n, g]);
  return {
    total: p + n + g, positive: p, neutral: n, negative: g,
    positivePct, neutralPct, negativePct,
    contributors: contributors == null ? null : Number(contributors) || 0,
  };
}

/** Market View distribution from rows. A recommendation in the input is ignored. */
export function viewBreakdown(rows, keyOf) {
  const list = viewRows(rows);
  const c = { Positive: 0, Neutral: 0, Negative: 0 };
  for (const r of list) c[typeOf(r)]++;
  return viewBreakdownFromCounts({
    positive: c.Positive, neutral: c.Neutral, negative: c.Negative,
    contributors: keyOf ? new Set(list.map(keyOf).filter(Boolean)).size : null,
  });
}

/** Each contributor's most recent view (rows may be in any order). */
export function currentViews(rows, keyOf) {
  const latest = new Map();
  for (const r of viewRows(rows)) {
    const k = keyOf(r);
    if (!k) continue;
    const prev = latest.get(k);
    if (!prev || String(r.created_at) > String(prev.created_at)) latest.set(k, r);
  }
  return [...latest.values()];
}

/** Calendar-month counts for the given types, oldest first. Months with nothing are omitted. */
export function monthlyActivity(rows, types) {
  const byMonth = {};
  for (const r of rows || []) {
    const t = typeOf(r);
    if (!types.includes(t)) continue;
    const created = r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at || '');
    const mo = created.slice(0, 7);
    if (!mo) continue;
    if (!byMonth[mo]) byMonth[mo] = { mo, ...Object.fromEntries(types.map((x) => [x, 0])) };
    byMonth[mo][t]++;
  }
  return Object.values(byMonth).sort((a, b) => a.mo.localeCompare(b.mo));
}
export const researchMonthly = (rows) => monthlyActivity(rows, RESEARCH_TYPES);
export const viewMonthly = (rows) => monthlyActivity(rows, VIEW_TYPES);

/** Plain commentary text of a stored/serialised thesis (links reduced to their label, markup stripped). */
export function commentaryOf(thesis) {
  if (!thesis || thesis === '—') return '';
  let text = String(thesis);
  try { const p = JSON.parse(text); if (p && p.__v === '1') text = String(p.text || ''); } catch { /* plain */ }
  return text
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_~`#>]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

export function excerpt(text, max = 180) {
  const t = String(text || '').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max - 1);
  const sp = cut.lastIndexOf(' ');
  return (sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd() + '…';
}

/**
 * Themes appearing across Market Views — the contributors' OWN words, quoted
 * and attributed, never generated opinion or a MIC signal. Positive themes come
 * from Positive views, concerns from Negative ones; Neutral views carry no
 * theme of their own. Newest first, duplicates dropped. A side with nothing to
 * quote is empty (the caller hides it).
 */
export function viewThemes(rows, { max = 3, chars = 180, nameOf = () => null } = {}) {
  const pick = (type) => {
    const seen = new Set();
    const out = [];
    const sorted = viewRows(rows)
      .filter((r) => typeOf(r) === type)
      .sort((a, b) => String(b.created_at).localeCompare(String(a.created_at)));
    for (const r of sorted) {
      const text = excerpt(commentaryOf(r.thesis), chars);
      if (!text || seen.has(text)) continue;
      seen.add(text);
      out.push({ id: r.id, text, by: nameOf(r) });
      if (out.length >= max) break;
    }
    return out;
  };
  return { positive: pick('Positive'), concerns: pick('Negative') };
}

/** Which sections of the page have data. Everything else is hidden, not shown empty. */
export function pageSections({ research = 0, views = 0 } = {}) {
  return { hasResearch: research > 0, hasViews: views > 0, hasAny: research > 0 || views > 0 };
}
