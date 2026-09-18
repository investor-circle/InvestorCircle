export const metadata = { robots: { index: false, follow: false } };

export default function NotFound() {
  return (
    <>
      <h1>Not found</h1>
      <p className="lede">
        It may be private, or it may never have existed. Public ideas are visible to anyone; private ones are only
        visible to the people they were shared with.
      </p>
      <p style={{ marginTop: 18 }}>
        <a className="btn btn-pri" href="https://myinvestorcircle.com/">Go to myinvestorcircle.com</a>
      </p>
    </>
  );
}
