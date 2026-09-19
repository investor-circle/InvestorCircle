import { ImageResponse } from 'next/og';
import { getSecurityByTicker } from '../../../../lib/api';
import { computeConsensus } from '../../../../lib/consensus';
import { Brand, FallbackCard } from '../../../../components/OgBrand';

export const alt = 'Stock Insights on My Investor Circle';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Same dark/purple gradient brand language as the site-wide og-image.png
// (public/og-image.png in the main repo), but per-ticker and denser —
// filling the frame with the ticker's own idea/investor/consensus counts
// instead of a mostly-empty logo banner. No custom font is loaded: the
// default Satori font covers plain ASCII fine, and prices are rendered
// without the ₹ symbol specifically to avoid it (an unverified glyph in
// the default font would silently render as a missing-glyph box).
function StatBlock({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,.06)', borderRadius: 14, padding: '16px 22px', minWidth: 160 }}>
      <div style={{ display: 'flex', fontSize: 15, fontWeight: 700, letterSpacing: 1.5, color: '#8d90ad', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ display: 'flex', fontSize: 30, fontWeight: 800, color: '#fff', marginTop: 4 }}>{value}</div>
    </div>
  );
}

export default async function Image({ params }) {
  const { symbol } = await params;
  const data = await getSecurityByTicker(symbol);

  if (!data || !data.summary?.idea_count) {
    return new ImageResponse(<FallbackCard message="Investor ideas & community sentiment" />, size);
  }

  const { name, sector, summary, ideas } = data;
  const consensus = computeConsensus(ideas);

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', flexDirection: 'column',
          background: 'linear-gradient(135deg, #0a0b18 0%, #14152e 55%, #1d1032 100%)',
          padding: '56px 68px', fontFamily: 'sans-serif',
        }}
      >
        <Brand />

        <div style={{ display: 'flex', flexDirection: 'column', flex: 1, justifyContent: 'center' }}>
          <div style={{ display: 'flex', fontSize: 20, fontWeight: 700, letterSpacing: 2, color: '#a78bfa', textTransform: 'uppercase' }}>
            {sector || 'Stock Insights'}
          </div>
          <div style={{ display: 'flex', fontSize: 92, fontWeight: 800, color: '#fff', marginTop: 6, lineHeight: 1 }}>
            {data.symbol}
          </div>
          <div style={{ display: 'flex', fontSize: 30, color: '#c9c8e0', marginTop: 8 }}>
            {name}
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16 }}>
          <StatBlock label="Ideas" value={summary.idea_count} />
          <StatBlock label="Investors" value={summary.contributor_count} />
          <StatBlock label="Community" value={consensus.label} />
        </div>
      </div>
    ),
    size
  );
}
