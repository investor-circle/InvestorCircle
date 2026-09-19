import { ImageResponse } from 'next/og';
import { getIdea } from '../../../../lib/api';

export const alt = 'An investment idea on My Investor Circle';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

// Same brand language / no-custom-font rationale as
// security/[symbol]/opengraph-image.jsx (see that file's own comment).
// Prices are shown as plain locale-formatted numbers, no ₹ symbol, for the
// same glyph-support reason.
const fmt = (n) =>
  n === null || n === undefined || n === '' || Number.isNaN(Number(n))
    ? null
    : Number(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });

function clip(s, n) {
  const t = String(s ?? '').replace(/\s+/g, ' ').trim();
  return t.length <= n ? t : t.slice(0, n - 1).trimEnd() + '…';
}

// Duplicated from src/utils/format.js's initialsOf (separate deployable
// project, no shared build step — same rationale as computeConsensus in
// lib/consensus.js).
const initialsOf = (name) => name.split(' ').map((w) => w[0]).join('').slice(0, 2).toUpperCase();

export default async function Image({ params }) {
  const { id } = await params;
  const idea = await getIdea(id);

  if (!idea) {
    return new ImageResponse(<FallbackCard />, size);
  }

  const author = idea.author_name || idea.author_username || 'A member';
  const isBuy = idea.recommendation_type === 'Buy';
  const entry = fmt(idea.reco_price);
  const target = fmt(idea.target_price);

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
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              display: 'flex', fontSize: 16, fontWeight: 800, letterSpacing: 1, padding: '7px 16px', borderRadius: 999,
              background: isBuy ? 'rgba(21,146,78,.22)' : 'rgba(194,69,61,.22)', color: isBuy ? '#4ade80' : '#f87171',
            }}>
              {isBuy ? 'BUY' : 'SELL'}
            </div>
            <div style={{ display: 'flex', fontSize: 16, fontWeight: 700, letterSpacing: 1, color: '#8d90ad', textTransform: 'uppercase' }}>
              {idea.status || 'Active'}
            </div>
          </div>
          <div style={{ display: 'flex', fontSize: 76, fontWeight: 800, color: '#fff', marginTop: 14, lineHeight: 1 }}>
            {idea.ticker}
          </div>
          {idea.asset_name && (
            <div style={{ display: 'flex', fontSize: 26, color: '#c9c8e0', marginTop: 6 }}>{idea.asset_name}</div>
          )}
          {idea.thesis && (
            <div style={{ display: 'flex', fontSize: 22, color: '#a3a6c2', marginTop: 22, maxWidth: 980 }}>
              {clip(idea.thesis, 140)}
            </div>
          )}
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 28 }}>
            {entry && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', fontSize: 14, fontWeight: 700, letterSpacing: 1.5, color: '#8d90ad', textTransform: 'uppercase' }}>Entry</div>
                <div style={{ display: 'flex', fontSize: 24, fontWeight: 800, color: '#fff', marginTop: 2 }}>{entry}</div>
              </div>
            )}
            {target && (
              <div style={{ display: 'flex', flexDirection: 'column' }}>
                <div style={{ display: 'flex', fontSize: 14, fontWeight: 700, letterSpacing: 1.5, color: '#8d90ad', textTransform: 'uppercase' }}>Target</div>
                <div style={{ display: 'flex', fontSize: 24, fontWeight: 800, color: '#fff', marginTop: 2 }}>{target}</div>
              </div>
            )}
          </div>
          <Author name={author} avatarUrl={idea.avatar_url} color={idea.avatar_color} />
        </div>
      </div>
    ),
    size
  );
}

// Mirrors src/components/common.jsx's Avatar (image when avatar_url is set,
// else a colored-initials circle, falling back to the brand gradient when
// no avatar_color is stored either) — same visual language as everywhere
// else in the app an author shows up, just re-implemented with Satori-safe
// inline styles instead of the shared .av CSS class.
function Author({ name, avatarUrl, color }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      {avatarUrl ? (
        <img src={avatarUrl} alt="" width={44} height={44} style={{ borderRadius: 999, objectFit: 'cover' }} />
      ) : (
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'center', width: 44, height: 44, borderRadius: 999,
          background: color || 'linear-gradient(135deg, #6d5df5 0%, #9a55ee 55%, #cf52d8 100%)',
          color: '#fff', fontSize: 16, fontWeight: 800,
        }}>
          {initialsOf(name)}
        </div>
      )}
      <div style={{ display: 'flex', fontSize: 20, color: '#c9c8e0' }}>{name}</div>
    </div>
  );
}

function Brand() {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
      <div style={{
        width: 40, height: 40, borderRadius: 10, display: 'flex', alignItems: 'center', justifyContent: 'center',
        background: 'linear-gradient(135deg, #6d5df5 0%, #9a55ee 55%, #cf52d8 100%)', fontSize: 15, fontWeight: 800, color: '#fff',
      }}>
        mic
      </div>
      <div style={{ display: 'flex', fontSize: 21, fontWeight: 700, color: '#c9c8e0' }}>myInvestorCircle</div>
    </div>
  );
}

function FallbackCard() {
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 18,
      background: 'linear-gradient(135deg, #0a0b18 0%, #14152e 55%, #1d1032 100%)', fontFamily: 'sans-serif',
    }}>
      <Brand />
      <div style={{ display: 'flex', fontSize: 26, color: '#c9c8e0' }}>An investor idea on My Investor Circle</div>
    </div>
  );
}
