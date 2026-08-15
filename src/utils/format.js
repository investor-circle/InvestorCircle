import { ADMIN_SEBI_API, CLASS_COLOR, CURRENCY_SYM, NOTIONAL, THESIS_MAX_MB, THESIS_TARGET_KB, TODAY } from "../constants/app";

export const classColor = (c) => CLASS_COLOR[c] || "#8d90ad";

export const fmt     = (n, cur='INR') => (CURRENCY_SYM[cur]||cur) + Math.round(n).toLocaleString('en-IN');

export const fmtSigned = (n, cur='INR') => (n>=0?'+':'-') + fmt(Math.abs(n), cur);

export const fmtPct  = (p) => (p >= 0 ? '+' : '') + (p * 100).toFixed(1) + '%';
// Robust date formatter: handles Date objects, ISO strings, timestamps — never shows "Invalid Date"

export const fmtDate = (d) => {
  if (!d) return '—';
  // If it's already a Date object (Neon returns these), use directly
  const dt = d instanceof Date ? d
    : typeof d === 'string' && d.length === 10 ? new Date(d + 'T00:00:00')  // bare date "2024-05-10"
    : new Date(d);  // ISO timestamp, epoch ms, etc.
  return isNaN(dt) ? '—' : dt.toLocaleDateString('en-IN', { month:'short', day:'numeric', year:'numeric' });
};

export const initialsOf = (name) => name.split(" ").map(w=>w[0]).join("").slice(0,2).toUpperCase();

export const recoStats = (recs, pred) => {
  const list = recs.filter(pred);
  const acted = list.filter(r=>r.invested);
  const pnl = acted.reduce((s,r)=> s + NOTIONAL*((r.price/(r.investedPrice||r.priceAt))-1), 0);
  return {
    count:list.length, acted:acted.length,
    liked:list.filter(r=>r.reaction==="like").length,
    disliked:list.filter(r=>r.reaction==="dislike").length,
    inMoney:list.filter(r=>(r.price-r.priceAt)/r.priceAt>=0).length,
    outMoney:list.filter(r=>(r.price-r.priceAt)/r.priceAt<0).length,
    pnl,
  };
};

export const normLevel = (lvl) => lvl==="none" ? "off" : lvl;          // their level -> off/names/full

export const myPerm = (sharing,id) => { const c=sharing[id]; if(!c||c.visibility==="off") return "off"; return c.level==="full"?"full":"names"; };

export const setMyPerm = (setSharing,id,val) => setSharing(s=>({ ...s, [id]:{ visibility: val==="off"?"off":"all", level: val==="full"?"full":"names", selected: s[id]?.selected||[] } }));

export const ret = (r) => (r.priceAt && r.priceAt !== 0) ? (r.price - r.priceAt) / r.priceAt : 0;

export const calcTargetDate = (date, horizon) => {
  if (!date || !horizon) return null;
  const d = new Date(date + "T00:00:00");
  if (horizon==="<3m") d.setMonth(d.getMonth()+3);
  else if (horizon==="6m")  d.setMonth(d.getMonth()+6);
  else if (horizon==="12m") d.setMonth(d.getMonth()+12);
  else if (horizon===">2Y") d.setFullYear(d.getFullYear()+2);
  else return null;
  return d.toISOString().slice(0,10);
};

export const getTargetDate = (r) => r.targetDate || calcTargetDate(r.date, r.horizon) || null;

export const isExpired = (r) => { const td=getTargetDate(r); return td ? td < TODAY : false; };

export function parseThesis(raw) {
  if (!raw || raw === '—') return null;
  try { const p = JSON.parse(raw); if (p.__v === '1') return p; } catch {}
  return { __v:'0', text: String(raw), images: [] };
}

export function serializeThesis({ text, images }) {
  const t = (text || '').trim();
  if (!t && !images?.length) return null;
  if (!images?.length) return t;
  return JSON.stringify({ __v:'1', text: t, images });
}

export function getThesisText(raw) {
  const p = parseThesis(raw);
  return p?.text || '';
}

export async function compressImage(file) {
  if (file.size > THESIS_MAX_MB * 1024 * 1024)
    throw new Error(`Image "${file.name}" exceeds ${THESIS_MAX_MB} MB. Please use a smaller file.`);
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = reject;
    reader.onload = ev => {
      const img = new window.Image();
      img.onerror = reject;
      img.onload = () => {
        const canvas = document.createElement('canvas');
        let { width: w, height: h } = img;
        const maxDim = 1200;
        if (w > maxDim || h > maxDim) {
          if (w >= h) { h = Math.round(h * maxDim / w); w = maxDim; }
          else        { w = Math.round(w * maxDim / h); h = maxDim; }
        }
        canvas.width = w; canvas.height = h;
        canvas.getContext('2d').drawImage(img, 0, 0, w, h);
        const limit = THESIS_TARGET_KB * 1024 * 1.37;
        let q = 0.82, data = canvas.toDataURL('image/jpeg', q);
        while (data.length > limit && q > 0.2) { q -= 0.1; data = canvas.toDataURL('image/jpeg', q); }
        resolve(data);
      };
      img.src = ev.target.result;
    };
    reader.readAsDataURL(file);
  });
}

/* ─── ThesisEditor ────────────────────────────────────────────────────────── */

export function scoreFeedRec(r, tracked, cfg, contactIds) {
  // ── Source base (tiny — just a tiebreaker, not a dominant signal) ───────────
  const src = r.feedSource;
  let score =
    (!src || src === 'direct') ? 10 :
    src === 'group'            ?  8 :
    src === 'network_engagement' ? 8 :
    5; // public

  // ── Connection boost: recommender is someone you follow (+15) ───────────────
  const recommenderId = r.from || r.from_id || r.recommender_id;
  if (contactIds && recommenderId && contactIds.has(recommenderId)) score += 15;

  // ── Recency (0–100 pts, loses 3.5 pts/day, fully gone at ~29 days) ──────────
  const daysSince = (Date.now() - new Date(r.date)) / 86400000;
  score += Math.max(0, 100 - daysSince * 3.5);

  // ── Engagement: always on — likes + comments surface hyped content ───────────
  score += (r.likes        || 0) * 8;
  score += (r.commentCount || 0) * 5;

  // ── Price movement boost (|return| > 5% adds up to 40 pts) ──────────────────
  if (cfg.rank_price_movement && r.priceAt > 0) {
    const absRet = Math.abs((r.price - r.priceAt) / r.priceAt);
    if (absRet > 0.05) score += Math.min(40, absRet * 200);
  }

  // ── Already tracked/invested → light downrank ────────────────────────────────
  if (cfg.rank_untracked_first && (tracked.has(r.id) || r.invested)) score -= 20;

  return score;
}

/* ─── Reco Card Modal ─── */

export async function adminSebiApi(user, opts = {}) {
  if (!user) return { ok: false, infra: true };
  try {
    const idToken = await user.getIdToken();
    const res = await fetch(ADMIN_SEBI_API, {
      method: opts.method || "GET",
      headers: {
        Authorization: `Bearer ${idToken}`,
        ...(opts.body ? { "Content-Type": "application/json" } : {}),
      },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
    });
    if (res.ok) return { ok: true, data: await res.json().catch(() => ({})) };
    if (res.status === 401 || res.status === 403) return { ok: false, denied: true };
    return { ok: false, infra: true };
  } catch (e) {
    return { ok: false, infra: true };
  }
}

export function computeConsensus(recos=[]) {
  if (!recos.length) return {bull:0,bear:0,neutral:0,bullPct:0,bearPct:0,neutralPct:0,strength:0,label:'No Data',total:0};
  const bull = recos.filter(r=>r.recommendation_type==='Buy').length;
  const bear = recos.filter(r=>r.recommendation_type==='Sell').length;
  const total = recos.length;
  const bullPct = Math.round(bull/total*100);
  const bearPct = Math.round(bear/total*100);
  const neutralPct = 100-bullPct-bearPct;
  const strength = Math.abs(bullPct-bearPct);
  const label = bullPct>=70?'Strong Bullish':bullPct>=55?'Bullish':bearPct>=70?'Strong Bearish':bearPct>=55?'Bearish':total>0?'Neutral':'No Data';
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

/* ── SecurityQuickPanel — redesigned to match BRD wireframe ────── */
