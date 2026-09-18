import LandingPageContent from '../components/LandingPageContent.jsx';
import { jsonLd } from '../lib/format';

/**
 * The real, server-rendered public homepage — Stage 2 of the homepage-SSR
 * proposal. NOT yet wired into production traffic: vercel.json on the main
 * project still serves "/" unconditionally from the SPA (see that
 * project's vercel.json and /middleware.js) — this page is reachable today
 * only at this project's own *.vercel.app URL, for review and testing.
 * Stage 3 (adding "/" to vercel.json's rewrites and /middleware.js's
 * cookie-gated matcher, exactly like /security/:symbol and /idea/:id
 * already work) is a deliberately separate, not-yet-taken step.
 *
 * DELIBERATELY OUTSIDE the (pages) route group (see app/(pages)/layout.jsx
 * and app/layout.jsx's own comments): /search, /security/:symbol and
 * /idea/:id all share one generic nav+footer chrome via that group's
 * layout. LandingPageContent already ships its own complete, self-styled
 * nav (.lp-nav) and footer (with social links, disclaimer, /search link) —
 * reusing the (pages) group's layout here would stack a second, generic
 * nav/footer around/inside the homepage's own, duplicating both. Sitting
 * outside the group means this page gets ONLY the bare root layout
 * (html/body/fonts/favicon), and supplies 100% of its own chrome, matching
 * exactly what a visitor sees at "/" in the SPA today.
 *
 * No Firebase, no auth, no client-side session check of any kind — this
 * app is anonymous-only by design (see README.md). "Sign in"/"Create
 * account" are real <a href> links to https://myinvestorcircle.com/?next=/
 * (and &signup=1), which lands back on "/" — with `next` present, which
 * (once Stage 3 ships) is one of App.jsx's existing bypass conditions that
 * always sends a request straight to the SPA regardless of cookie state, so
 * the SPA's own, already-tested `cameFromNextParam` logic shows LoginPage
 * directly. Zero App.jsx changes required for this to work — see the
 * architecture proposal for the full reasoning.
 */

// Purely static content — no per-request data — so Next.js prerenders this
// once at build time and serves it from cache; no `revalidate`/dynamic
// data fetching needed here, unlike /security/:symbol or /idea/:id.

const TITLE = 'My Investor Circle | Discover & Share Investment Ideas';
const DESCRIPTION = 'My Investor Circle is a private investing community to discover, share and discuss investment ideas with other investors, advisors and research professionals.';
const OG_DESCRIPTION = 'A private investing community to discover, share and discuss investment ideas with other investors, advisors and research professionals.';
const CANONICAL = 'https://myinvestorcircle.com/';

// Kept in sync with SOCIAL_LINKS in src/constants/app.js (the main app's
// own copy) — same already-established pattern as this project's
// ideaStatusSummary() in lib/format.js and the sameAs list in the main
// app's index.html. All list the same three accounts; change together.
const SOCIAL_LINKS = [
  { key: 'x', label: 'X', url: 'https://x.com/myInvestorCircl' },
  { key: 'facebook', label: 'Facebook', url: 'https://www.facebook.com/profile.php?id=61593318230104' },
  { key: 'instagram', label: 'Instagram', url: 'https://www.instagram.com/myinvestorcircle' },
];

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  alternates: { canonical: CANONICAL },
  openGraph: {
    type: 'website',
    siteName: 'My Investor Circle',
    url: CANONICAL,
    title: TITLE,
    description: OG_DESCRIPTION,
    images: [{ url: 'https://myinvestorcircle.com/og-image.png', width: 1200, height: 630, alt: 'myInvestorCircle — discover, share and discuss investment ideas with a circle of investors you trust.' }],
  },
  twitter: { card: 'summary_large_image' },
};

const STRUCTURED_DATA = {
  '@context': 'https://schema.org',
  '@graph': [
    {
      '@type': 'Organization',
      '@id': 'https://myinvestorcircle.com/#organization',
      name: 'My Investor Circle',
      alternateName: ['myInvestorCircle', 'MIC'],
      url: 'https://myinvestorcircle.com/',
      logo: {
        '@type': 'ImageObject',
        url: 'https://myinvestorcircle.com/mic-logo.png',
        width: 1024,
        height: 1024,
      },
      image: 'https://myinvestorcircle.com/og-image.png',
      description: 'A private investing community where members share investment ideas and build a transparent, permanent public track record. My Investor Circle does not provide investment advice and does not recommend securities.',
      sameAs: SOCIAL_LINKS.map((s) => s.url),
      contactPoint: {
        '@type': 'ContactPoint',
        contactType: 'customer support',
        email: 'hello@myinvestorcircle.com',
        availableLanguage: 'English',
      },
    },
    {
      '@type': 'WebSite',
      '@id': 'https://myinvestorcircle.com/#website',
      name: 'My Investor Circle',
      url: 'https://myinvestorcircle.com/',
      inLanguage: 'en',
      publisher: { '@id': 'https://myinvestorcircle.com/#organization' },
      potentialAction: {
        '@type': 'SearchAction',
        target: {
          '@type': 'EntryPoint',
          urlTemplate: 'https://myinvestorcircle.com/search?q={search_term_string}',
        },
        'query-input': 'required name=search_term_string',
      },
    },
  ],
};

function SignInAnchor(props) {
  return <a href="https://myinvestorcircle.com/?next=/" {...props} />;
}
function CreateAccountAnchor(props) {
  return <a href="https://myinvestorcircle.com/?next=/&signup=1" {...props} />;
}

export default function Home() {
  return (
    <>
      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: jsonLd(STRUCTURED_DATA) }} />
      <LandingPageContent
        signInCTA={(props) => <SignInAnchor {...props} />}
        createAccountCTA={(props) => <CreateAccountAnchor {...props} />}
        socialLinks={SOCIAL_LINKS}
      />
    </>
  );
}
