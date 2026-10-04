import { notFound } from 'next/navigation';
import { getSecurityByTicker, getRelatedSecurities, getDailyPrice, getPublicSymbols } from '../../../../lib/api';
import TickerTypeahead from '../../../../components/TickerTypeahead';
import { jsonLd, ideaStatusSummary, money, pct, day } from '../../../../lib/format';
import { researchRows, excerpt } from '../../../../lib/securityInsights';
import { securityModel } from '../../../../lib/securityModel';
import SecurityLayers from '../../../../components/SecurityLayers';
import Gate from '../../../../components/Gate';
import Breadcrumbs from '../../../../components/Breadcrumbs';
import SecurityTabs from './SecurityTabs';

export const revalidate = 120;

// What a security page has: Verified Research (Buy / Hold / Sell) and/or Market
// Views (Positive / Neutral / Negative). Either, both — never neither (404).
function layerCounts(data) {
  const research = data?.summary?.idea_count || 0;
  const views = data?.view_summary?.total || 0;
  return { research, views };
}

function describe({ name, sym, research, views, contributors }) {
  const parts = [];
  if (research) parts.push(`${research} piece${research === 1 ? '' : 's'} of verified research (Buy / Hold / Sell, with entry price, target and outcome on the record)`);
  if (views) parts.push(`${views} independent Market View${views === 1 ? '' : 's'} (Positive / Neutral / Negative)`);
  return `${parts.join(' and ')} on ${name} (${sym})${contributors ? ` from ${contributors} member${contributors === 1 ? '' : 's'}` : ''}.`;
}

export async function generateMetadata({ params }) {
  const { symbol } = await params;
  const data = await getSecurityByTicker(symbol);
  const { research, views } = layerCounts(data);
  if (!data || (!research && !views)) return { title: 'Not found | My Investor Circle' };

  const { name } = data;
  const sym = data.symbol;
  const what = research && views ? 'verified research & market views' : research ? 'verified research' : 'market views';
  const title = `${sym} — Stock Insights: ${what} | My Investor Circle`;
  const description = describe({
    name, sym, research, views,
    contributors: (data.summary?.contributor_count || 0) + (data.view_summary?.contributor_count || 0),
  });
  // word-aware cut (a plain slice split "members" mid-word)
  const metaDescription = excerpt(description, 200);
  const canonical = `https://myinvestorcircle.com/security/${encodeURIComponent(sym)}`;

  return {
    title,
    description: metaDescription,
    alternates: { canonical },
    openGraph: {
      type: 'website',
      siteName: 'My Investor Circle',
      url: canonical,
      title,
      description: metaDescription,
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
  const counts = data ? layerCounts(data) : { research: 0, views: 0 };
  if (!data || (!counts.research && !counts.views)) notFound();

  const { name, sector, summary, ideas } = data;
  const views = data.views || [];
  const viewSummary = data.view_summary || {};
  const viewStances = data.view_stances || [];
  const sym = data.symbol;
  const canonical = `https://myinvestorcircle.com/security/${encodeURIComponent(sym)}`;

  // Two separate datasets, two separate breakdowns — never combined.
  const { researchB, viewB } = securityModel(data);
  const statusCounts = countByStatus(researchRows(ideas));

  const collectionLd = jsonLd({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Stock Insights on ${name} (${sym})`,
    description: describe({ name, sym, research: counts.research, views: counts.views }),
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
      <h1>{name}{name.trim().toUpperCase() !== sym.toUpperCase() ? ` (${sym})` : ''} — {counts.research && counts.views ? 'Verified Research & Market Views' : counts.research ? 'Verified Research' : 'Market Views'}</h1>
      <p className="lede">
        {counts.research > 0 && (<>
          {counts.research} piece{counts.research === 1 ? '' : 's'} of verified research from{' '}
          {summary.contributor_count} publisher{summary.contributor_count === 1 ? '' : 's'}.{' '}
          {ideaStatusSummary(statusCounts.Active, statusCounts.Closed, statusCounts.Expired)}{' '}
        </>)}
        {counts.views > 0 && (<>
          {counts.views} independent Market View{counts.views === 1 ? '' : 's'} from{' '}
          {viewSummary.contributor_count} contributor{viewSummary.contributor_count === 1 ? '' : 's'}.
        </>)}
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

      {/* The two layers, visibly separate: Verified Research (Buy / Hold /
          Sell) and Market Views (Positive / Neutral / Negative). A layer with
          no data is not rendered. Sector is the eyebrow above — not repeated. */}
      <SecurityLayers research={researchB} views={viewB} />

      <SecurityTabs symbol={sym} ideas={ideas} summary={summary} views={views} viewSummary={viewSummary} viewStances={viewStances} related={related} />

      <Gate
        line={`Sign in to see Your Circle's take on ${sym}, post your own view, or track this stock.`}
        next={`/security/${encodeURIComponent(sym)}`}
      />
    </>
  );
}
