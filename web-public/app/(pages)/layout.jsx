import SignInLink from '../../components/SignInLink';
import SignUpLink from '../../components/SignUpLink';

// The visitor-facing header/footer shell for /search, /security/:symbol and
// /idea/:id — moved out of the root layout (app/layout.jsx) so the homepage
// (app/page.jsx, outside this route group) doesn't inherit it and end up
// with two navs/two footers stacked against its own self-contained ones.
// A route group's folder name ((pages)) never appears in the URL — /search
// is still exactly /search — this only changes which layout wraps it.
//
// It intentionally offers only "Sign in" / "Create account" — this app
// never holds a session, so there is no personalized state to show here.
// See README.md for why an anonymous visitor is the only visitor this app
// ever renders for.
export default function PagesLayout({ children }) {
  return (
    <>
      <div className="nav">
        <div className="wrap navrow">
          <a href="https://myinvestorcircle.com/" style={{ display: 'flex', alignItems: 'center', gap: 9, color: 'inherit', minWidth: 0 }}>
            <img src="https://myinvestorcircle.com/favicon.png" alt="" width={34} height={34} style={{ display: 'block', flexShrink: 0 }} />
            <span className="brand">myInvestorCircle</span>
          </a>
          <SignInLink />
          <SignUpLink />
        </div>
      </div>
      <div className="wrap" style={{ paddingTop: 30, paddingBottom: 30 }}>{children}</div>
      <div className="foot">
        <div className="wrap">
          My Investor Circle is a technology platform where members share their own investment ideas and build public
          track records. We do not provide personalised investment advice or recommend any securities. Unless explicitly
          shown on a profile, we do not verify that a member is registered with SEBI or any other regulatory authority.
          <div style={{ marginTop: 10 }}>© {new Date().getFullYear()} My Investor Circle · <a href="https://myinvestorcircle.com/">myinvestorcircle.com</a></div>
        </div>
      </div>
    </>
  );
}
