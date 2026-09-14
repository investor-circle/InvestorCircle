import { notFound } from 'next/navigation';
import { getIdea } from '../../../lib/api';
import { jsonLd, day, pct } from '../../../lib/format';
import IdeaCard from '../../../components/IdeaCard';
import Gate from '../../../components/Gate';

export const revalidate = 120;

export async function generateMetadata({ params }) {
  const { id } = await params;
  const idea = await getIdea(id);
  if (!idea) return { title: 'Not found | My Investor Circle' };

  const author = idea.author_name || idea.author_username || 'A member';
  const title = `${idea.ticker} — ${author}'s investment idea | My Investor Circle`;
  const description = (idea.thesis
    ? `${author} on ${idea.ticker}: ${idea.thesis}`
    : `${author} posted an idea on ${idea.ticker}.`
  ).slice(0, 200);
  const canonical = `https://myinvestorcircle.com/idea/${encodeURIComponent(idea.id)}`;

  return {
    title,
    description,
    alternates: { canonical },
    openGraph: {
      type: 'article',
      siteName: 'My Investor Circle',
      url: canonical,
      title,
      description,
      images: [{ url: 'https://myinvestorcircle.com/og-image.png', width: 1200, height: 630 }],
    },
    twitter: { card: 'summary_large_image' },
  };
}

export default async function IdeaPage({ params }) {
  const { id } = await params;
  const idea = await getIdea(id);
  if (!idea) notFound();

  const author = idea.author_name || idea.author_username || 'A member';
  const r = pct(idea.return_pct);
  const canonical = `https://myinvestorcircle.com/idea/${encodeURIComponent(idea.id)}`;
  const appUrl = idea.author_username
    ? `https://myinvestorcircle.com/investor/${encodeURIComponent(idea.author_username)}/idea/${encodeURIComponent(idea.id)}`
    : 'https://myinvestorcircle.com/';

  const ld = jsonLd({
    '@context': 'https://schema.org',
    '@type': 'DiscussionForumPosting',
    headline: `${idea.ticker} — ${author}'s investment idea`,
    datePublished: idea.created_at,
    author: { '@type': 'Person', name: author },
    articleBody: idea.thesis || '',
    url: canonical,
    isPartOf: { '@type': 'WebSite', name: 'My Investor Circle', url: 'https://myinvestorcircle.com/' },
  });

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />
      <div className="eyebrow">Investment idea</div>
      <h1>{idea.ticker}{idea.asset_name ? ` · ${idea.asset_name}` : ''}</h1>
      <p className="lede">
        Posted by {author} on {day(idea.created_at)}. Once published, an idea on My Investor Circle can never be
        edited or deleted{r ? `, and it is currently ${r}` : ''}.
      </p>
      <div style={{ marginTop: 20 }}>
        <IdeaCard idea={idea} full headingTag="h2" />
      </div>
      <Gate line="Sign in to follow this member, track this idea, or add your own view." />
      <p style={{ marginTop: 20 }}>
        <a href={appUrl}>Open this idea in the app →</a>
        {idea.ticker && <> · <a href={`/security/${encodeURIComponent(idea.ticker)}`}>All ideas on {idea.ticker} →</a></>}
      </p>
    </>
  );
}
