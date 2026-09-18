import './globals.css';
import { Plus_Jakarta_Sans, Fraunces } from 'next/font/google';

// next/font self-hosts these (served from this app's own origin at build
// time, not a fonts.googleapis.com/fonts.gstatic.com round trip) and injects
// a real @font-face for each family name below — so LandingPageContent.jsx's
// existing, unmodified `font-family:'Plus Jakarta Sans',...`/`'Fraunces',...`
// CSS picks them up with no changes to that shared file. This is the
// first-party Next.js answer to the render-blocking-font risk: no extra
// cross-origin request on the critical path, and no CLS from a late font
// swap (next/font computes a metrics-matched fallback automatically).
// Applied via className on <html> below so both families' stylesheets are
// included on every route this layout wraps — deliberately not scoped
// per-segment; splitting Fraunces to only the homepage would save a small
// amount of KB for the /search, /security, /idea pages at the cost of a
// second font-loading strategy in this app, which isn't worth it here.
const plusJakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['400', '500', '600', '700', '800'],
  display: 'swap',
});
const fraunces = Fraunces({
  subsets: ['latin'],
  weight: ['500', '600'],
  display: 'swap',
});

export const metadata = {
  metadataBase: new URL('https://myinvestorcircle.com'),
  robots: { index: true, follow: true },
};

// Bare shell only — no nav/footer here. Those are (pages)/layout.jsx's job
// now, wrapping /search, /security/:symbol and /idea/:id, which all share
// that visitor-facing chrome. The homepage (app/page.jsx) sits OUTSIDE that
// group deliberately: it ships its own complete, self-contained nav+footer
// (see LandingPageContent.jsx), so wrapping it in the (pages) chrome too
// would duplicate both. See app/page.jsx's own comment for the full
// reasoning.
export default function RootLayout({ children }) {
  return (
    <html lang="en" className={`${plusJakarta.className} ${fraunces.className}`}>
      <head>
        {/* No preconnect for the asset host here anymore: since
            next.config.mjs's assetPrefix (see its own comment) now emits
            a same-origin path prefix instead of an absolute cross-origin
            URL, every CSS/JS/font request the browser makes resolves
            against whatever origin the HTML document itself came from —
            there is no second host to preconnect to. The previous
            AssetOriginPreconnect component (and its ReactDOM.preconnect()
            call) is removed rather than left in place as a no-op hint. */}
        <link rel="icon" type="image/png" href="https://myinvestorcircle.com/favicon.png" />
      </head>
      <body>{children}</body>
    </html>
  );
}
