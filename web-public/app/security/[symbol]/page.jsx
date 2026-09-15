import { notFound } from 'next/navigation';
import { getSecurityByTicker } from '../../../lib/api';
import { jsonLd, day } from '../../../lib/format';
import Gate from '../../../components/Gate';
import SecurityTabs from './SecurityTabs';

export const revalidate = 120;

export async function generateMetadata({ params }) {
  const { symbol } = await params;
  const data = await getSecurityByTicker(symbol);
  if (!data || !data.summary?.idea_count) return { title: 'Not found | My Investor Circle' };

  const { name, summary } = data;
  const sym = data.symbol;
  const title = `${sym} — Stock Insights: ${summary.idea_count} investor idea${summary.idea_count === 1 ? '' : 's'} | My Investor Circle`;
  const description = `${summary.idea_count} published idea${summary.idea_count === 1 ? '' : 's'} on ${name} (${sym}) from ${summary.contributor_count} member${summary.contributor_count === 1 ? '' : 's'}, each with entry price, target and outcome on the record.`.slice(0, 200);
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
      images: [{ url: 'https://myinvestorcircle.com/og-image.png', width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image' },
  };
}

export default async function SecurityPage({ params }) {
  const { symbol } = await params;
  const data = await getSecurityByTicker(symbol);
  if (!data || !data.summary?.idea_count) notFound();

  const { name, sector, summary, ideas } = data;
  const sym = data.symbol;
  const canonical = `https://myinvestorcircle.com/security/${encodeURIComponent(sym)}`;

  const ld = jsonLd({
    '@context': 'https://schema.org',
    '@type': 'CollectionPage',
    name: `Stock Insights on ${name} (${sym})`,
    description: `${summary.idea_count} published ideas on ${name} from ${summary.contributor_count} members.`,
    url: canonical,
    isPartOf: { '@type': 'WebSite', name: 'My Investor Circle', url: 'https://myinvestorcircle.com/' },
  });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />
      <div className="eyebrow">{sector || 'Stock Insights'}</div>
      <h1>{name}</h1>
      <p className="lede">
        {summary.idea_count} {summary.idea_count === 1 ? 'person has' : 'people have'} shared their view{summary.idea_count === 1 ? '' : 's'} on{' '}
        <strong>{sym}</strong> from {summary.contributor_count} member{summary.contributor_count === 1 ? '' : 's'} —{' '}
        {summary.closed_count} of {summary.idea_count} idea{summary.idea_count === 1 ? ' is' : 's are'} now closed. Every idea here is
        permanent: entry, target and outcome stay on the record whichever way it went.
      </p>
      <div className="stats" style={{ marginTop: 20, marginBottom: 10 }}>
        <div className="stat"><div className="k">IDEAS</div><div className="v">{summary.idea_count}</div></div>
        <div className="stat"><div className="k">MEMBERS</div><div className="v">{summary.contributor_count}</div></div>
        <div className="stat"><div className="k">CLOSED</div><div className="v">{summary.closed_count}</div></div>
        <div className="stat"><div className="k">LATEST</div><div className="v" style={{ fontSize: 13.5 }}>{day(summary.last_posted)}</div></div>
      </div>

      <SecurityTabs symbol={sym} name={name} ideas={ideas} />

      {/* No separate "open in the app" link here (unlike the idea page's,
          which points at a different, non-proxied /investor/:username URL):
          /security/:symbol is itself proxied to this app (see the main
          project's vercel.json), so a fresh link to this exact path — with
          or without a #  — would just reload this same page, not the main
          app's authenticated Stock Insights view. That view lives at this
          same path too, but is only reachable by a signed-in user already
          running the app (client-side navigation, never a fresh request),
          so Gate's sign-in link above is the only meaningful CTA left. */}
      <Gate
        line={`Sign in to see Your Circle's take on ${sym}, post your own view, or track this stock.`}
        next={`/security/${encodeURIComponent(sym)}`}
      />
    </>
  );
}
