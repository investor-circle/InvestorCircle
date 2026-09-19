'use client';

import { useState, useRef, useEffect, useId } from 'react';
import { useRouter } from 'next/navigation';

/**
 * Ticker/company typeahead for anonymous visitors — the public equivalent of
 * the authenticated app's InstrumentSearch (src/components/common.jsx), but
 * backed by a genuinely public data source: the authenticated one calls
 * lookups.js's instruments-list action, which requires a real Firebase
 * token (requireUid) a signed-out visitor here never has. `symbols` (passed
 * in, fetched server-side via lib/api.js's getPublicSymbols()) comes from
 * public-ideas.js's already-public `symbols` action instead — already
 * scoped to exactly the tickers that have a reachable /security/:symbol
 * page (a ticker with zero public ideas 404s there today, so suggesting one
 * would be a dead end).
 *
 * Wrapped in a real <form method="GET" action="/search">, so the fallback
 * path — press Enter without picking a suggestion — still works exactly as
 * /search's own page already does, with or without this component's JS
 * having loaded at all. Only picking a suggestion (click, or Enter with one
 * highlighted) does something this form couldn't do on its own: a client-side
 * push straight to that ticker's own /security/:symbol page.
 */
// variant="lp": rendered inside LandingPageContent.jsx's own `.lp` scope,
// which defines its own lp-prefixed class family (lp-searchbar/lp-btn) with
// slightly different spacing than the global .searchbar/.btn this component
// otherwise uses (globals.css) — same color tokens either way (the two
// files' CSS custom properties are kept value-identical on purpose), so the
// only thing that actually needs to switch is the class names, not the
// dropdown's own inline-styled var(--...) references below.
export default function TickerTypeahead({ symbols, placeholder, variant }) {
  const isLp = variant === 'lp';
  const formClass = isLp ? 'lp-searchbar' : 'searchbar';
  const buttonClass = isLp ? 'lp-btn lp-btn-ghost' : 'btn btn-ghost btn-sm';
  const router = useRouter();
  const listboxId = useId();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const ref = useRef(null);

  useEffect(() => {
    const onClickOutside = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', onClickOutside);
    return () => document.removeEventListener('mousedown', onClickOutside);
  }, []);

  const term = q.trim().toLowerCase();
  const results = term.length < 1 ? [] : symbols
    .filter((s) => s.symbol.toLowerCase().startsWith(term) || (s.name && s.name.toLowerCase().includes(term)))
    .slice(0, 8);

  const goToSecurity = (symbol) => {
    setOpen(false);
    setQ('');
    router.push(`/security/${encodeURIComponent(symbol)}`);
  };

  const onChange = (e) => {
    setQ(e.target.value);
    setOpen(true);
    setActiveIndex(-1);
  };

  const onKeyDown = (e) => {
    if (!open || !results.length) return;
    if (e.key === 'ArrowDown') { e.preventDefault(); setActiveIndex((i) => Math.min(i + 1, results.length - 1)); }
    else if (e.key === 'ArrowUp') { e.preventDefault(); setActiveIndex((i) => Math.max(i - 1, 0)); }
    else if (e.key === 'Enter' && activeIndex >= 0) { e.preventDefault(); goToSecurity(results[activeIndex].symbol); }
    else if (e.key === 'Escape') { setOpen(false); }
  };

  return (
    <form className={formClass} method="GET" action="/search" style={{ position: 'relative' }} ref={ref} autoComplete="off">
      <input
        type="search"
        name="q"
        value={q}
        onChange={onChange}
        onKeyDown={onKeyDown}
        onFocus={() => results.length && setOpen(true)}
        placeholder={placeholder || 'Search public ideas by ticker, company or thesis'}
        aria-label="Search public investor ideas"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        aria-controls={listboxId}
      />
      <button className={buttonClass} type="submit">Search</button>
      {open && results.length > 0 && (
        <ul
          id={listboxId}
          role="listbox"
          style={{
            position: 'absolute', top: '100%', left: 0, right: 0, marginTop: 6,
            background: 'var(--surface)', border: '1px solid var(--line)', borderRadius: 12,
            boxShadow: '0 8px 24px rgba(20,20,50,.10)', listStyle: 'none', padding: 6, zIndex: 20,
            maxHeight: 320, overflowY: 'auto',
          }}
        >
          {results.map((s, i) => (
            <li key={s.symbol} role="option" aria-selected={i === activeIndex}>
              <button
                type="button"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => goToSecurity(s.symbol)}
                onMouseEnter={() => setActiveIndex(i)}
                style={{
                  width: '100%', textAlign: 'left', border: 'none', cursor: 'pointer', font: 'inherit',
                  padding: '9px 10px', borderRadius: 8, display: 'flex', alignItems: 'baseline', gap: 8,
                  background: i === activeIndex ? 'var(--surface2)' : 'transparent', color: 'var(--ink)',
                }}
              >
                <span style={{ fontWeight: 800, fontSize: 13.5 }}>{s.symbol}</span>
                {s.name && <span style={{ color: 'var(--muted)', fontSize: 12.5, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{s.name}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </form>
  );
}
