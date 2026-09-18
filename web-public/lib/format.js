// Formatting helpers. React/JSX escapes text content automatically, so
// unlike api/seo.js in the main repo (which hand-writes HTML strings and
// must escape everything itself), most of this is plain formatting — the
// one place that still needs manual escaping is JSON-LD (see jsonLd below),
// because it sits inside a <script> tag, outside JSX's escaping entirely.

export const money = (n) =>
  n === null || n === undefined || n === '' || Number.isNaN(Number(n))
    ? '—'
    : '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });

export const pct = (n) =>
  n === null || n === undefined || Number.isNaN(Number(n))
    ? null
    : (Number(n) >= 0 ? '+' : '') + Number(n).toFixed(1) + '%';

export const day = (d) => {
  if (!d) return '';
  const t = new Date(d);
  return Number.isNaN(t.getTime())
    ? ''
    : t.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

export const clip = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + '…';
};

// Splits thesis text into a short preview and the remainder, for a
// concise-preview-plus-"Read more" UI. Unlike clip(), this never drops any
// characters — preview + rest reconstructs the full text — because the
// remainder still has to land in the server-rendered HTML (inside a native
// <details>), not be discarded for visual reasons. Cuts at the last space at
// or before `n`, so words don't get split mid-token; falls back to a hard
// cut only when there's no reasonable space to break on (e.g. one long URL).
export const splitPreview = (s, n) => {
  const t = String(s ?? '');
  if (t.length <= n) return { preview: t, rest: '' };
  let cut = t.lastIndexOf(' ', n);
  if (cut < n * 0.6) cut = n;
  return { preview: t.slice(0, cut).trimEnd(), rest: t.slice(cut).trimStart() };
};

// JSON-LD sits inside <script>, where the HTML parser looks for "</script>"
// before anything else — the escaping that matters here stops a thesis
// containing that string from closing the block early. Copied verbatim from
// api/seo.js's jsonLd() in the main repo for the same reason.
export const jsonLd = (obj) =>
  JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

// One-line factual status mix for a set of ideas on a security — e.g.
// "4 ideas are active, while 1 is closed." Each non-zero bucket gets its own
// clause; a bucket at zero is omitted entirely rather than stated as "0 are
// closed". Singular/plural agreement ("1 idea is" vs "4 ideas are") is
// derived from the count, never hardcoded. Duplicated verbatim in the main
// repo's src/utils/format.js (a separate deployable project, no shared build
// step) — keep the two copies in sync, same as computeConsensus in
// lib/consensus.js.
export function ideaStatusSummary(active = 0, closed = 0, expired = 0) {
  const buckets = [
    { n: active, label: 'active' },
    { n: closed, label: 'closed' },
    { n: expired, label: 'expired' },
  ].filter((b) => b.n > 0);
  if (!buckets.length) return '';
  const clauses = buckets.map((b, i) => {
    const be = b.n === 1 ? 'is' : 'are';
    return i === 0 ? `${b.n} idea${b.n === 1 ? '' : 's'} ${be} ${b.label}` : `${b.n} ${be} ${b.label}`;
  });
  if (clauses.length === 1) return `${clauses[0]}.`;
  if (clauses.length === 2) return `${clauses[0]}, while ${clauses[1]}.`;
  return `${clauses.slice(0, -1).join(', ')}, and ${clauses[clauses.length - 1]}.`;
}

export const statusColors = (status) =>
  ({
    Active: { bg: '#dbeafe', fg: '#1d4ed8' },
    Closed: { bg: '#dcfce7', fg: '#15803d' },
    Expired: { bg: '#f3f4f6', fg: '#6b7280' },
  })[status] || { bg: '#f3f4f6', fg: '#6b7280' };
