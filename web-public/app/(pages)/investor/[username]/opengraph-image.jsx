import { ImageResponse } from 'next/og';
import { getPublicProfile } from '../../../../lib/api';
import { computeIci } from '../../../../lib/ici';
import { initialsOf } from '../../../../lib/avatar';
import { Brand, FallbackCard } from '../../../../components/OgBrand';

export const alt = 'An investor on My Investor Circle';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

const displayName = (profile) =>
  [profile.first_name, profile.last_name].filter(Boolean).join(' ') || profile.full_name || profile.username;

export default async function Image({ params }) {
  const { username } = await params;
  const data = await getPublicProfile(username);

  if (!data) {
    return new ImageResponse(<FallbackCard message="An investor on My Investor Circle" />, size);
  }

  const { profile, summary, realized } = data;
  const name = displayName(profile);
  const ici = computeIci({
    years_history: summary.years_history,
    total: summary.total,
    hit_rate_pct: realized.hit_rate_pct,
    median_return: realized.median_return,
    risk_adjusted_return: realized.risk_adjusted,
  });

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

        <div style={{ display: 'flex', alignItems: 'center', flex: 1, gap: 40 }}>
          <div style={{ display: 'flex' }}>
            {profile.avatar_url ? (
              <img src={profile.avatar_url} alt="" width={140} height={140} style={{ borderRadius: 999, objectFit: 'cover' }} />
            ) : (
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'center', width: 140, height: 140, borderRadius: 999,
                background: profile.avatar_color || 'linear-gradient(135deg, #6d5df5 0%, #9a55ee 55%, #cf52d8 100%)',
                color: '#fff', fontSize: 50, fontWeight: 800,
              }}>
                {initialsOf(name)}
              </div>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column' }}>
            <div style={{ display: 'flex', fontSize: 52, fontWeight: 800, color: '#fff', lineHeight: 1.05 }}>{name}</div>
            <div style={{ display: 'flex', fontSize: 24, color: '#8d90ad', marginTop: 6 }}>@{profile.username}</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: 16 }}>
          <StatBlock label="ICI score" value={`${ici.score} · ${ici.band}`} />
          <StatBlock label="Ideas posted" value={summary.total} />
          <StatBlock label="Tracked by" value={profile.tracking_count} />
        </div>
      </div>
    ),
    size
  );
}

function StatBlock({ label, value }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(255,255,255,.06)', borderRadius: 14, padding: '16px 22px', minWidth: 200 }}>
      <div style={{ display: 'flex', fontSize: 15, fontWeight: 700, letterSpacing: 1.5, color: '#8d90ad', textTransform: 'uppercase' }}>{label}</div>
      <div style={{ display: 'flex', fontSize: 30, fontWeight: 800, color: '#fff', marginTop: 4 }}>{value}</div>
    </div>
  );
}
