/**
 * `next` is the exact path (e.g. /security/RELIANCE, /idea/42) this visitor
 * was looking at — carried through sign-in as a query param on the root
 * URL so the main app can land them back on it afterward instead of the
 * generic home feed. Read back in src/App.jsx's pending-navigation effect.
 * Optional: falls back to a plain sign-in link with no destination memory.
 */
export default function Gate({ line, next }) {
  const href = next
    ? `https://myinvestorcircle.com/?next=${encodeURIComponent(next)}`
    : 'https://myinvestorcircle.com/';
  return (
    <div className="gate">
      <span>{line}</span>
      <a className="btn btn-pri" href={href}>Sign in to take part</a>
    </div>
  );
}
