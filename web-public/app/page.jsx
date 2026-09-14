// This app never receives real "/" traffic — vercel.json on the main
// project only proxies /security/:symbol, /idea/:id and /search here. This
// page exists only so `npm run dev` has something to show at the root
// during local development; see README.md.
export const metadata = { robots: { index: false, follow: false } };

export default function Home() {
  return (
    <>
      <h1>investorcircle-public</h1>
      <p className="lede">
        This project only serves <code>/security/:symbol</code>, <code>/idea/:id</code> and{' '}
        <code>/search</code> — proxied here from myinvestorcircle.com. See README.md.
      </p>
    </>
  );
}
