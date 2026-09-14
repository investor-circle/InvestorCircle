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

// JSON-LD sits inside <script>, where the HTML parser looks for "</script>"
// before anything else — the escaping that matters here stops a thesis
// containing that string from closing the block early. Copied verbatim from
// api/seo.js's jsonLd() in the main repo for the same reason.
export const jsonLd = (obj) =>
  JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

export const statusColors = (status) =>
  ({
    Active: { bg: '#dbeafe', fg: '#1d4ed8' },
    Closed: { bg: '#dcfce7', fg: '#15803d' },
    Expired: { bg: '#f3f4f6', fg: '#6b7280' },
  })[status] || { bg: '#f3f4f6', fg: '#6b7280' };
