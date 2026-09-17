// Plain, zero-JS breadcrumb nav. `items` is an ordered array of
// { label, href? } — the last item is rendered as the current page (no
// link) whether or not it has an href. Kept as a small standalone component,
// the same pattern as Gate/IdeaCard, so another page can adopt it later
// without duplicating the markup.
export default function Breadcrumbs({ items }) {
  return (
    <nav className="crumbs" aria-label="Breadcrumb">
      {items.map((item, i) => {
        const isLast = i === items.length - 1;
        return (
          <span key={item.label}>
            {i > 0 && <span className="sep">/</span>}
            {item.href && !isLast ? <a href={item.href}>{item.label}</a> : <span aria-current="page">{item.label}</span>}
          </span>
        );
      })}
    </nav>
  );
}
