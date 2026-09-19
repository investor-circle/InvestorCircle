// Shared corner branding and generic fallback card for every
// opengraph-image.jsx in this project (security, idea, investor) —
// consolidated after being copy-pasted verbatim into all three. Same
// same-project rationale as lib/avatar.js's own header comment.
export function Brand() {
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

// `message` carries what's rendered instead of a not-found page/idea/
// profile — each caller's own copy.
export function FallbackCard({ message }) {
  return (
    <div style={{
      width: '100%', height: '100%', display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center', gap: 18,
      background: 'linear-gradient(135deg, #0a0b18 0%, #14152e 55%, #1d1032 100%)', fontFamily: 'sans-serif',
    }}>
      <Brand />
      <div style={{ display: 'flex', fontSize: 26, color: '#c9c8e0' }}>{message}</div>
    </div>
  );
}
