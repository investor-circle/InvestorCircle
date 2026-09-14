/**
 * api/seo.js — the server-rendered public pages
 *
 * Serves /stock/:symbol, /idea/:id and /search as real HTML with the content
 * already in it, via the rewrites in vercel.json. Everything else on the site
 * is still the untouched HashRouter app; these are the only URLs a search
 * engine or a link-preview crawler can read, and they exist because neither
 * Googlebot's indexing nor WhatsApp's preview card runs the app's JavaScript.
 *
 * DATA COMES FROM public-ideas, NOT FROM NEW QUERIES. The rule that a private
 * idea never leaves the server lives in exactly one file
 * (_lib/handlers/public-ideas.js) with a test that reads its SQL; adding a
 * second set of queries here would be a second place for that rule to be got
 * wrong. callPublic() below invokes that handler in-process and captures what
 * it would have sent — no HTTP hop, no duplicated WHERE clause.
 *
 * Every value interpolated into the HTML goes through esc(). Thesis text,
 * company names and author names are member-written, and this is the one
 * place in the codebase where they are pasted into markup by hand rather than
 * by React (which escapes for you).
 *
 * Profiles are deliberately NOT served here: public/robots.txt disallows
 * them and no route exists. An author's name on an idea is published; their
 * profile page is not.
 */

import handlePublicIdeas from './_lib/handlers/public-ideas.js';

const SITE = 'https://myinvestorcircle.com';
const OG_IMAGE = `${SITE}/og-image.png`;

/* ── escaping ─────────────────────────────────────────────────────────── */

const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

// JSON-LD sits inside <script>, where the HTML parser looks for "</script>"
// before anything else — so the escaping that matters there is the one that
// stops a thesis containing that string from closing the block early.
const jsonLd = (obj) =>
  JSON.stringify(obj).replace(/</g, '\\u003c').replace(/>/g, '\\u003e').replace(/&/g, '\\u0026');

/* ── data ─────────────────────────────────────────────────────────────── */

async function callPublic(query) {
  let status = 500;
  let body = null;
  const res = {
    setHeader() {},
    status(c) { status = c; return this; },
    json(b) { body = b; return this; },
    end() { return this; },
  };
  await handlePublicIdeas({ method: 'GET', query }, res);
  return { status, body };
}

/* ── formatting ───────────────────────────────────────────────────────── */

const money = (n) => (n === null || n === undefined || n === '' || Number.isNaN(Number(n)))
  ? '—' : '₹' + Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });

const pct = (n) => (n === null || n === undefined || Number.isNaN(Number(n)))
  ? null : (Number(n) >= 0 ? '+' : '') + Number(n).toFixed(1) + '%';

const day = (d) => {
  if (!d) return '';
  const t = new Date(d);
  return Number.isNaN(t.getTime()) ? '' : t.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
};

const clip = (s, n) => {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + '…';
};

/* ── shell ────────────────────────────────────────────────────────────── */

const CSS = `
:root{--ink:#13142b;--soft:#565a78;--muted:#8d90ad;--line:#e9e9f2;--line2:#dddcec;
--accent:#6d5df5;--accent-ink:#5a49e6;--accent-soft:#eeecff;--surface:#fff;--surface2:#f1f1f8;
--bg:#f5f5fb;--dark:#0a0b18;--gain:#15924e;--loss:#c2453d;
--grad:linear-gradient(135deg,#6d5df5 0%,#9a55ee 55%,#cf52d8 100%);}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--ink);-webkit-font-smoothing:antialiased;
font-family:'Plus Jakarta Sans',-apple-system,system-ui,sans-serif;}
a{color:var(--accent-ink);text-decoration:none}a:hover{color:var(--accent)}
.wrap{max-width:940px;margin:0 auto;padding:0 22px}
.nav{border-bottom:1px solid var(--line);background:var(--surface)}
.navrow{height:64px;display:flex;align-items:center;gap:10px}
.brand{font-size:16px;font-weight:800;letter-spacing:-.3px}
.btn{border:none;border-radius:12px;font-size:13.5px;font-weight:700;padding:11px 16px;
display:inline-flex;align-items:center;justify-content:center;gap:7px;cursor:pointer;font-family:inherit}
.btn-pri{background:var(--grad);color:#fff;box-shadow:0 6px 16px rgba(124,92,252,.3)}
.btn-ghost{background:var(--surface);border:1px solid var(--line2);color:var(--ink)}
.card{background:var(--surface);border:1px solid var(--line);border-radius:16px;
box-shadow:0 1px 2px rgba(20,20,50,.04),0 6px 18px rgba(20,20,50,.05);overflow:hidden;margin-bottom:14px}
.pad{padding:18px}
h1{font-size:34px;font-weight:800;letter-spacing:-1.1px;line-height:1.15;margin:0;text-wrap:pretty}
h2{font-size:19px;font-weight:800;letter-spacing:-.4px;margin:0 0 12px}
h3{font-size:17px;font-weight:800;letter-spacing:-.3px;margin:0}
.lede{font-size:15.5px;line-height:1.8;color:var(--soft);margin:12px 0 0;text-wrap:pretty}
.eyebrow{font-size:11.5px;font-weight:800;letter-spacing:1.3px;text-transform:uppercase;color:var(--accent);margin-bottom:8px}
.tag{display:inline-flex;align-items:center;border:1px solid var(--line2);color:var(--soft);
border-radius:999px;font-size:11.5px;font-weight:600;padding:3px 9px}
.tag-open{background:#e6f4ec;color:var(--gain);border-color:transparent;font-weight:800}
.tag-closed{background:#f8eae8;color:var(--loss);border-color:transparent;font-weight:800}
.stats{display:grid;grid-template-columns:repeat(auto-fit,minmax(112px,1fr));gap:10px;margin-top:16px}
.stat{background:var(--surface2);border-radius:11px;padding:11px 13px}
.stat .k{font-size:10.5px;font-weight:700;color:var(--muted)}
.stat .v{font-size:16px;font-weight:800;letter-spacing:-.3px;margin-top:3px}
.gain{color:var(--gain)}.loss{color:var(--loss)}
.meta{font-size:12.5px;color:var(--muted)}
.thesis{font-size:14.5px;line-height:1.8;color:var(--soft);margin-top:10px}
.gate{margin-top:18px;padding:14px 16px;border-radius:12px;background:var(--dark);color:#a7abc6;
display:flex;align-items:center;gap:14px;flex-wrap:wrap;font-size:13.5px}
.gate .btn{margin-left:auto}
.foot{border-top:1px solid var(--line);background:var(--surface);margin-top:34px;padding:28px 0;
font-size:12.5px;color:var(--soft);line-height:1.75}
.searchbar{display:flex;gap:9px;margin-top:18px;flex-wrap:wrap}
.searchbar input{flex:1;min-width:200px;padding:13px 15px;border-radius:12px;border:1.5px solid var(--line2);
font-size:15px;font-family:inherit;background:var(--surface);color:var(--ink)}
@media(max-width:700px){h1{font-size:26px;letter-spacing:-.8px}.wrap{padding:0 18px}
.btn{padding:13px 16px;font-size:14px}.gate .btn{margin-left:0;width:100%}}
`;

function shell({ title, description, canonical, ld, body, noindex }) {
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<link rel="icon" type="image/png" href="/favicon.png">
<link rel="canonical" href="${esc(canonical)}">
${noindex ? '<meta name="robots" content="noindex,follow">\n' : ''}<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}">
<meta property="og:type" content="article">
<meta property="og:site_name" content="My Investor Circle">
<meta property="og:url" content="${esc(canonical)}">
<meta property="og:title" content="${esc(title)}">
<meta property="og:description" content="${esc(description)}">
<meta property="og:image" content="${OG_IMAGE}">
<meta property="og:image:width" content="1200">
<meta property="og:image:height" content="630">
<meta name="twitter:card" content="summary_large_image">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap" media="print" onload="this.media='all'">
<noscript><link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap"></noscript>
<style>${CSS}</style>
${ld ? `<script type="application/ld+json">${ld}</script>` : ''}
</head>
<body>
<div class="nav"><div class="wrap navrow">
  <a href="/" style="display:flex;align-items:center;gap:9px;color:inherit">
    <img src="/favicon.png" alt="" width="28" height="28" style="display:block">
    <span class="brand">myInvestorCircle</span>
  </a>
  <a class="btn btn-ghost" style="margin-left:auto" href="/">Sign in</a>
</div></div>
<div class="wrap" style="padding-top:30px">${body}</div>
<div class="foot"><div class="wrap">
  My Investor Circle is a technology platform where members share their own investment ideas and build public
  track records. We do not provide personalised investment advice or recommend any securities. Unless explicitly
  shown on a profile, we do not verify that a member is registered with SEBI or any other regulatory authority.
  <div style="margin-top:10px">© ${new Date().getFullYear()} My Investor Circle · <a href="/">myinvestorcircle.com</a></div>
</div></div>
</body>
</html>`;
}

const gate = (line) => `<div class="gate">
  <span>${esc(line)}</span>
  <a class="btn btn-pri" href="/">Sign in to take part</a>
</div>`;

/* ── idea rendering ───────────────────────────────────────────────────── */

function ideaCard(idea, { heading = 'h3' } = {}) {
  const r = pct(idea.return_pct);
  const up = Number(idea.return_pct) >= 0;
  const closed = idea.status === 'Closed';
  const author = idea.author_name || idea.author_username || 'A member';
  return `<div class="card"><div class="pad">
    <div style="display:flex;align-items:center;gap:9px;flex-wrap:wrap">
      <${heading}>${esc(idea.ticker || '')}</${heading}>
      <span class="meta">${esc(idea.asset_name || '')}</span>
      ${idea.sector ? `<span class="tag">${esc(idea.sector)}</span>` : ''}
      <span class="tag ${closed ? 'tag-closed' : 'tag-open'}">${esc((idea.status || '').toUpperCase())}</span>
      ${r ? `<span style="margin-left:auto;font-weight:800;font-size:15px" class="${up ? 'gain' : 'loss'}">${esc(r)}</span>` : ''}
    </div>
    <div class="meta" style="margin-top:8px">
      ${esc(author)}${idea.author_username ? ` · @${esc(idea.author_username)}` : ''} · ${esc(day(idea.created_at))}${idea.horizon ? ` · ${esc(idea.horizon)} horizon` : ''}
    </div>
    ${idea.thesis ? `<p class="thesis">${esc(clip(idea.thesis, 900))}</p>` : ''}
    <div class="stats">
      <div class="stat"><div class="k">ENTRY</div><div class="v">${esc(money(idea.reco_price))}</div></div>
      <div class="stat"><div class="k">TARGET</div><div class="v">${esc(money(idea.target_price))}</div></div>
      ${closed
        ? `<div class="stat"><div class="k">EXIT</div><div class="v">${esc(money(idea.exit_price))}</div></div>`
        : `<div class="stat"><div class="k">LATEST</div><div class="v">${esc(money(idea.current_price))}</div></div>`}
      ${idea.conviction ? `<div class="stat"><div class="k">CONVICTION</div><div class="v">${esc(idea.conviction)}</div></div>` : ''}
    </div>
  </div></div>`;
}

/* ── pages ────────────────────────────────────────────────────────────── */

async function ideaPage(id) {
  const { status, body } = await callPublic({ action: 'idea', id });
  if (status !== 200 || !body?.idea) return null;
  const idea = body.idea;

  const author = idea.author_name || idea.author_username || 'A member';
  const r = pct(idea.return_pct);
  const title = `${idea.ticker} — ${author}'s investment idea | My Investor Circle`;
  const description = clip(
    idea.thesis
      ? `${author} on ${idea.ticker}: ${idea.thesis}`
      : `${author} posted an idea on ${idea.ticker}. Entry ${money(idea.reco_price)}, target ${money(idea.target_price)}.`,
    200
  );
  const canonical = `${SITE}/idea/${encodeURIComponent(idea.id)}`;
  const appUrl = idea.author_username
    ? `/#/investor/${encodeURIComponent(idea.author_username)}/idea/${encodeURIComponent(idea.id)}`
    : '/';

  return shell({
    title, description, canonical,
    ld: jsonLd({
      '@context': 'https://schema.org',
      '@type': 'DiscussionForumPosting',
      headline: `${idea.ticker} — ${author}'s investment idea`,
      datePublished: idea.created_at,
      author: { '@type': 'Person', name: author },
      articleBody: idea.thesis || '',
      url: canonical,
      isPartOf: { '@type': 'WebSite', name: 'My Investor Circle', url: SITE + '/' },
    }),
    body: `
      <div class="eyebrow">Investment idea</div>
      <h1>${esc(idea.ticker)}${idea.asset_name ? ` · ${esc(idea.asset_name)}` : ''}</h1>
      <p class="lede">Posted by ${esc(author)} on ${esc(day(idea.created_at))}. Once published, an idea on
      My Investor Circle can never be edited or deleted${r ? `, and it is currently ${esc(r)}` : ''}.</p>
      <div style="margin-top:20px">${ideaCard(idea, { heading: 'h2' })}</div>
      ${gate('Sign in to follow this member, track this idea, or add your own view.')}
      <p style="margin-top:20px"><a href="${esc(appUrl)}">Open this idea in the app →</a>
      ${idea.ticker ? ` · <a href="/stock/${encodeURIComponent(idea.ticker)}">All ideas on ${esc(idea.ticker)} →</a>` : ''}</p>
    `,
  });
}

async function stockPage(symbol) {
  const { status, body } = await callPublic({ action: 'by-symbol', symbol });
  if (status !== 200 || !body?.ideas?.length) return null;

  const { name, sector, summary, ideas } = body;
  const sym = body.symbol;
  const title = `${sym} — ${summary.idea_count} investor idea${summary.idea_count === 1 ? '' : 's'} and track records | My Investor Circle`;
  const description = clip(
    `${summary.idea_count} published idea${summary.idea_count === 1 ? '' : 's'} on ${name} (${sym}) from ${summary.contributor_count} member${summary.contributor_count === 1 ? '' : 's'}, each with entry price, target and outcome on the record.`,
    200
  );
  // Canonical (and therefore og:url / JSON-LD url, which shell() derives
  // from this same value) points at /security/:symbol, NOT this page's own
  // /stock/:symbol URL. /security/:symbol (web-public/, a separate SSR
  // Next.js app — see its README.md) now covers the same ground with the
  // real Stock Insights experience rather than this simplified template,
  // and having both independently indexable at their own URLs would be
  // duplicate content. This page is deliberately left otherwise unchanged
  // and still resolves — it is not being retired yet — this one line just
  // tells Google which of the two is authoritative in the meantime.
  const canonical = `${SITE}/security/${encodeURIComponent(sym)}`;

  return shell({
    title, description, canonical,
    ld: jsonLd({
      '@context': 'https://schema.org',
      '@type': 'CollectionPage',
      name: `Investor ideas on ${name} (${sym})`,
      description,
      url: canonical,
      isPartOf: { '@type': 'WebSite', name: 'My Investor Circle', url: SITE + '/' },
    }),
    body: `
      <div class="eyebrow">${esc(sector || 'Stock')}</div>
      <h1>Investor ideas on ${esc(name)}</h1>
      <p class="lede">${esc(String(summary.idea_count))} published idea${summary.idea_count === 1 ? '' : 's'} on
      <strong>${esc(sym)}</strong> from ${esc(String(summary.contributor_count))} member${summary.contributor_count === 1 ? '' : 's'},
      ${esc(String(summary.closed_count))} of them now closed. Every idea here is permanent — entry, target and
      outcome stay on the record whichever way it went.</p>
      <div class="stats" style="margin-top:20px;margin-bottom:26px">
        <div class="stat"><div class="k">IDEAS</div><div class="v">${esc(String(summary.idea_count))}</div></div>
        <div class="stat"><div class="k">MEMBERS</div><div class="v">${esc(String(summary.contributor_count))}</div></div>
        <div class="stat"><div class="k">CLOSED</div><div class="v">${esc(String(summary.closed_count))}</div></div>
        <div class="stat"><div class="k">LATEST</div><div class="v" style="font-size:13.5px">${esc(day(summary.last_posted))}</div></div>
      </div>
      <h2>Every idea on ${esc(sym)}</h2>
      ${ideas.map((i) => ideaCard(i)).join('')}
      ${gate(`Sign in to post your own view on ${sym}, or follow the members above.`)}
    `,
  });
}

async function searchPage(q) {
  const query = String(q || '').slice(0, 80);
  const { body } = query ? await callPublic({ action: 'search', q: query }) : { body: { ideas: [] } };
  const ideas = body?.ideas || [];
  const title = query
    ? `“${query}” — investor ideas | My Investor Circle`
    : 'Search investor ideas | My Investor Circle';
  const description = query
    ? `${ideas.length} public investor idea${ideas.length === 1 ? '' : 's'} matching “${query}” on My Investor Circle.`
    : 'Search published investment ideas by stock, company or thesis. Every idea is permanent, with entry, target and outcome on the record.';

  return shell({
    title, description,
    canonical: `${SITE}/search`,
    // A results page is not something to index — the ideas themselves are.
    noindex: true,
    ld: null,
    body: `
      <div class="eyebrow">Search</div>
      <h1>${query ? `Ideas matching “${esc(query)}”` : 'Search investor ideas'}</h1>
      <form class="searchbar" method="GET" action="/search">
        <input type="search" name="q" value="${esc(query)}" placeholder="Try a ticker, a company, or a thesis" aria-label="Search ideas">
        <button class="btn btn-pri" type="submit">Search</button>
      </form>
      ${query && !ideas.length
        ? `<p class="lede">No public ideas match “${esc(query)}” yet.</p>`
        : ideas.map((i) => ideaCard(i)).join('')}
      ${gate('Sign in to post an idea, or to follow the members behind these.')}
    `,
  });
}

function notFound(what) {
  return shell({
    title: `Not found | My Investor Circle`,
    description: 'This page is not available.',
    canonical: `${SITE}/`,
    noindex: true,
    ld: null,
    body: `<h1>${esc(what)}</h1>
      <p class="lede">It may be private, or it may never have existed. Public ideas are visible to anyone;
      private ones are only visible to the people they were shared with.</p>
      <p style="margin-top:18px"><a class="btn btn-pri" href="/">Go to myinvestorcircle.com</a></p>`,
  });
}

/* ── entry point ──────────────────────────────────────────────────────── */

export default async function handler(req, res) {
  if (req.method !== 'GET') { res.status(405).send('Method not allowed'); return; }

  const page = String(req.query?.page || '');
  try {
    let html = null;
    let missing = 'Page not found';

    if (page === 'idea') {
      html = await ideaPage(String(req.query?.id || ''));
      missing = 'Idea not found';
    } else if (page === 'stock') {
      html = await stockPage(String(req.query?.symbol || ''));
      missing = 'No public ideas on this stock yet';
    } else if (page === 'search') {
      html = await searchPage(req.query?.q);
    } else {
      res.status(400).send('Unknown page');
      return;
    }

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    if (html) {
      // Cached at the edge so a crawler working through the sitemap does not
      // spend origin transfer on every hit; stale-while-revalidate keeps the
      // page current without making anyone wait for a fresh render.
      res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
      res.status(200).send(html);
    } else {
      res.setHeader('Cache-Control', 'public, s-maxage=60');
      res.status(404).send(notFound(missing));
    }
  } catch (err) {
    console.error('[seo]', page, err);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.status(500).send(notFound('Something went wrong'));
  }
}
