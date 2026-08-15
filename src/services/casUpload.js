export const _CAS_API = import.meta.env.VITE_CAS_API_URL
  ? `${import.meta.env.VITE_CAS_API_URL}/api/cas`
  : '/api/cas';

export const _CAS_CONFIGURED = !!import.meta.env.VITE_CAS_API_URL;

/* ── Transactional email helper (calls Vercel /api/email via Resend) ─── */

export async function parseCasPdf(file, password = '') {
  const form = new FormData();
  form.append('file', file, file.name || 'cas.pdf');
  form.append('password', (password || '').trim());
  let res;
  try {
    res = await fetch(_CAS_API, { method: 'POST', body: form });
  } catch (networkErr) {
    throw new Error('Network error — could not reach the CAS API. Check your internet connection.');
  }
  if (!res.ok) {
    const t = await res.text().catch(()=>'');
    // 405 from GitHub Pages means VITE_CAS_API_URL is not set
    if (res.status === 405 || t.includes('<html') || t.includes('Not Allowed')) {
      throw new Error(
        'CAS API not configured. Add VITE_CAS_API_URL=https://your-project.vercel.app ' +
        'to your GitHub repository → Settings → Secrets → Actions, then re-deploy.'
      );
    }
    throw new Error(t || `HTTP ${res.status}`);
  }
  return res.json();
}
