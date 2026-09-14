import './globals.css';

export const metadata = {
  metadataBase: new URL('https://myinvestorcircle.com'),
  robots: { index: true, follow: true },
};

// This is the visitor-facing header/footer shell for every page in this
// app. It intentionally offers only "Sign in" / "Open in myInvestorCircle" —
// this app never holds a session, so there is no personalized state to show
// here. See README.md for why an anonymous visitor is the only visitor this
// app ever renders for.
export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" type="image/png" href="https://myinvestorcircle.com/favicon.png" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;600;700;800&display=swap"
        />
      </head>
      <body>
        <div className="nav">
          <div className="wrap navrow">
            <a href="https://myinvestorcircle.com/" style={{ display: 'flex', alignItems: 'center', gap: 9, color: 'inherit' }}>
              <img src="https://myinvestorcircle.com/favicon.png" alt="" width={28} height={28} style={{ display: 'block' }} />
              <span className="brand">myInvestorCircle</span>
            </a>
            <a className="btn btn-ghost" style={{ marginLeft: 'auto' }} href="https://myinvestorcircle.com/">Sign in</a>
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
      </body>
    </html>
  );
}
