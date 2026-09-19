import { notFound } from 'next/navigation';
import { getPublicProfile } from '../../../../lib/api';
import { computeIci } from '../../../../lib/ici';
import { jsonLd, day } from '../../../../lib/format';
import Gate from '../../../../components/Gate';
import Breadcrumbs from '../../../../components/Breadcrumbs';

export const revalidate = 120;

const initialsOf = (name) => name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

const displayName = (profile) =>
  [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.full_name || profile.username;

export async function generateMetadata({ params }) {
  const { username } = await params;
  const data = await getPublicProfile(username);
  if (!data) return { title: 'Not found | My Investor Circle' };

  const { profile, summary } = data;
  const name = displayName(profile);
  const title = `${name} (@${profile.username}) — Investor on My Investor Circle`;
  const description = `${summary.total} public idea${summary.total === 1 ? '' : 's'} posted, tracked by ${profile.tracking_count} investor${profile.tracking_count === 1 ? '' : 's'} on My Investor Circle.`.slice(0, 200);
  const canonical = `https://myinvestorcircle.com/investor/${encodeURIComponent(profile.username)}`;

  return {
    title,
    description,
    alternates: { canonical },
    // Deliberately noindex — member profiles stay out of the search index
    // on purpose (see public/robots.txt's own Disallow: /investor/ comment,
    // which remains the load-bearing rule; this is defense-in-depth on the
    // same decision, not a second, independent one). A shared LINK still
    // needs to render correctly (title/description/image), which is the
    // part this page and its opengraph-image.jsx exist for — "not indexed"
    // and "not linkable" are different things.
    robots: { index: false, follow: false },
    openGraph: {
      type: 'profile',
      siteName: 'My Investor Circle',
      url: canonical,
      title,
      description,
      // No `images` here — opengraph-image.jsx in this same route segment
      // supplies it via Next's file-convention metadata instead.
    },
    twitter: { card: 'summary_large_image' },
  };
}

export default async function InvestorPage({ params }) {
  const { username } = await params;
  const data = await getPublicProfile(username);
  if (!data) notFound();

  const { profile, summary, realized } = data;
  const name = displayName(profile);
  const ici = computeIci({
    years_history: summary.years_history,
    total: summary.total,
    hit_rate_pct: realized.hit_rate_pct,
    median_return: realized.median_return,
    risk_adjusted_return: realized.risk_adjusted,
  });
  const canonical = `https://myinvestorcircle.com/investor/${encodeURIComponent(profile.username)}`;
  const memberSince = profile.created_at ? day(profile.created_at) : null;

  const ld = jsonLd({
    '@context': 'https://schema.org',
    '@type': 'ProfilePage',
    name: `${name} on My Investor Circle`,
    url: canonical,
    isPartOf: { '@type': 'WebSite', name: 'My Investor Circle', url: 'https://myinvestorcircle.com/' },
  });

  const breadcrumbItems = [
    { label: 'Home', href: 'https://myinvestorcircle.com/' },
    { label: name },
  ];

  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: ld }} />

      <Breadcrumbs items={breadcrumbItems} />

      <div style={{ display: 'flex', alignItems: 'center', gap: 18, flexWrap: 'wrap' }}>
        {profile.avatar_url ? (
          <img src={profile.avatar_url} alt="" width={72} height={72} className="avatar" />
        ) : (
          <div className="avatar-fallback" style={{ width: 72, height: 72, fontSize: 24, background: profile.avatar_color || undefined }}>
            {initialsOf(name)}
          </div>
        )}
        <div>
          <div className="eyebrow">Investor{memberSince ? ` · member since ${memberSince}` : ''}</div>
          <h1>{name}</h1>
          <p className="meta" style={{ marginTop: 2 }}>@{profile.username}</p>
        </div>
      </div>

      {profile.bio && <p className="lede">{profile.bio}</p>}

      <div className="badge-row">
        <span className="tag" style={{ background: 'var(--accent-soft)', color: 'var(--accent-ink)' }}>
          ICI {ici.score} · {ici.band}
        </span>
      </div>

      <div className="stats">
        <div className="stat"><div className="k">IDEAS POSTED</div><div className="v">{summary.total}</div></div>
        <div className="stat"><div className="k">TRACKED BY</div><div className="v">{profile.tracking_count}</div></div>
        <div className="stat"><div className="k">CONNECTIONS</div><div className="v">{profile.connection_count}</div></div>
      </div>

      {/* Deliberately thin — no sector breakdown, best/worst picks, or the
          full idea list here (that stays behind sign-in, unlike the fully
          public security/idea pages). Profiles are a smaller, deliberate
          exception to "public by default" — see this page's own
          generateMetadata comment and public/robots.txt. */}
      <Gate
        line={`Sign in to see ${name}'s full track record, follow them, or track their performance.`}
        next={`/investor/${encodeURIComponent(profile.username)}`}
      />
    </>
  );
}
