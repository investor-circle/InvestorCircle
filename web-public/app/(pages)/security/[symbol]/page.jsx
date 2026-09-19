import { notFound } from 'next/navigation';
import { getSecurityByTicker, getRelatedSecurities, getDailyPrice, getPublicSymbols } from '../../../../lib/api';
import TickerTypeahead from '../../../../components/TickerTypeahead';
import { jsonLd, ideaStatusSummary, money, pct, day } from '../../../../lib/format';
import { computeConsensus } from '../../../../lib/consensus';
import Gate from '../../../../components/Gate';
import Breadcrumbs from '../../../../components/Breadcrumbs';
import SecurityTabs from './SecurityTabs';

export const revalidate = 120;

export async function generateMetadata({ params }) {
  const { symbol } = await params;
  const data = await getSecurityByTicker(symbol);
  if (!data || !data.summary?.idea_count) return { title: 'Not found | My Investor Circle' };

  const { name, summary } = data;
  const sym = data.symbol;
  const title = `${sym} — Stock Insights: ${summary.idea_count} investor idea${summary.idea_count === 1 ? '' : 's'} | My Investor Circle`;
  const description = `${summary.idea_count} published idea${summary.idea_count === 1 ? '' : 's'} on ${name} (${sym}) from ${summary.contributor_count} investor${summary.contributor_count === 1 ? '' : 's'}, each with entry price, target and outcome on the record.`.slice(0, 200);
  const canonical = `https://myinvestorcircle.com/security/${encodeURIComponent(sym)}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      siteName: 'My Investor Circle',
      url: canonical,
      title,
      description,
      // No `images` here — opengraph-image.jsx in this same route segment
      // (a per-ticker generated PNG, see its own header comment) supplies
      // it via Next's file-convention metadata instead. Setting a static
      // one here too would just add a second, redundant og:image.
    },
    twitter: { card: 'summary_large_image' },
  };
}

// Idea `status` (Active/Closed/Expired) the same way SecurityTabs derives it,
// needed here too for the above-the-fold summary strip. Duplicated rather
// than lifted into a shared prop so this page and SecurityTabs each derive
// independently from the same `ideas` array — the existing pattern in this
// file (SecurityTabs already computes its own consensus/investor/month
// breakdowns the same way).
function countByStatus(ideas) {
  return ideas.reduce(
    (acc, i) => { acc[i.status] = (acc[i.status] || 0) + 1; return acc; },
    { Active: 0, Closed: 0, Expired: 0 }
  );
}

export default async function SecurityPage({ params }) {
  const { symbol } = await params;
  const [data, related, dailyPrice, symbols] = await Promise.all([
    getSecurityByTicker(symbol),
    getRelatedSecurities(symbol),
    getDailyPrice(symbol),
    getPublicSymbols(),
  ]);
  if (!data || !data.summary?.idea_count) notFound();

  const { name, sector, summary, ideas } = data;
  const sym = data.symbol;
  const canonical = `https://myinvestorcircle.com/security/${encodeURIComponent(sym)}`;
  const consensus = computeConsensus(ideas);
  const statusCounts = countByStatus(ideas);

  const collectionLd = jsonLd({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Stock Insights on ${name} (${sym})`,
    description: `${summary.idea_count} published ideas on ${name} from ${summary.contributor_count} investors.`,
    url: canonical,
    isPartOf: { '@type': 'WebSite', name: 'My Investor Circle', url: 'https://myinvestorcircle.com/' },
  });

  // "Stock Insights" points at /search?q={symbol}, not bare /search — bare
  // /search has no query, so it renders zero results and (now that it's
  // crawlable) would be a dead end for anything following this link.
  // /search?q={symbol} at least resolves to this same ticker's own public
  // ideas, keeping the round trip (this page -> /search -> /security/:symbol)
  // genuinely non-empty rather than just technically crawlable.
  const breadcrumbItems = [
    { label: 'Home', href: 'https://myinvestorcircle.com/' },
    { label: 'Stock Insights', href: `https://myinvestorcircle.com/search?q=${encodeURIComponent(sym)}` },
    { label: sym },
  ];
  const breadcrumbLd = jsonLd({
    '@context': 'https://schema.org',
    '@type': 'BreadcrumbList',
    itemListElement: breadcrumbItems.map((item, i) => ({
      '@type': 'ListItem',
      position: i + 1,
      name: item.label,
      item: item.href || canonical,
    })),
  });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: collectionLd }} />
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: breadcrumbLd }} />

      <Breadcrumbs items={breadcrumbItems} />

      {/* Lets a visitor discover OTHER public stock pages, not just this
          one — see TickerTypeahead.jsx's own header comment. */}
      <TickerTypeahead symbols={symbols} />

      <div className="eyebrow">{sector || 'Stock Insights'}</div>
      {/* Some instruments' display name IS the ticker (BSE, the exchange
          itself, being the clearest example) — "BSE (BSE) — ..." repeats
          the same four letters twice in a row for no reason. Only add the
          parenthetical when it actually adds information. */}
      <h1>{name}{name.trim().toUpperCase() !== sym.toUpperCase() ? ` (${sym})` : ''} — Investor Ideas &amp; Community Sentiment</h1>
      <p className="lede">
        {summary.idea_count} public idea{summary.idea_count === 1 ? '' : 's'} on {name} from{' '}
        {summary.contributor_count} investor{summary.contributor_count === 1 ? '' : 's'}.{' '}
        {ideaStatusSummary(statusCounts.Active, statusCounts.Closed, statusCounts.Expired)}
      </p>

      {/* Nightly-batch EOD data, never live/intraday — the visible "as of"
          date is deliberate, not just a hover title, so this can't read as
          a real-time quote it isn't. */}
      {dailyPrice && (
        <div className="badge-row" style={{ alignItems: 'center' }}>
          <span
            className="tag"
            style={dailyPrice.changePct != null ? { color: dailyPrice.changePct > 0 ? 'var(--gain)' : dailyPrice.changePct < 0 ? 'var(--loss)' : undefined } : undefined}
          >
            {money(dailyPrice.close)}{dailyPrice.changePct != null && ` ${pct(dailyPrice.changePct)}`}
          </span>
          <span className="meta">as of {day(dailyPrice.date)}</span>
        </div>
      )}

      {/* Sector isn't repeated here — it's already the eyebrow directly
          above the H1, and this page had it in both spots at first. */}
      <div className="badge-row">
        <span className="tag tag-buy">{consensus.bull} Buy</span>
        {consensus.bear > 0 && <span className="tag tag-sell">{consensus.bear} Sell</span>}
      </div>
      {/* Active/closed aren't repeated as tiles here — the sentence above
          (via ideaStatusSummary) already states them; these two tiles are
          what it doesn't cover. */}
      <div className="stats" style={{ marginTop: 10, marginBottom: 10 }}>
        <div className="stat"><div className="k">IDEAS</div><div className="v">{summary.idea_count}</div></div>
        <div className="stat"><div className="k">INVESTORS</div><div className="v">{summary.contributor_count}</div></div>
      </div>

      <SecurityTabs symbol={sym} ideas={ideas} summary={summary} related={related} />

      <Gate
        line={`Sign in to see Your Circle's take on ${sym}, post your own view, or track this stock.`}
        next={`/security/${encodeURIComponent(sym)}`}
      />
    </>
  );
}
