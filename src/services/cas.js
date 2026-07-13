/**
 * src/services/cas.js
 * ──────────────────────────────────────────────────────────────────────────────
 * Upload a CAS PDF to the Vercel Python function and get parsed holdings back.
 *
 * Returns { mf, equity, investor, warnings } where:
 *   mf      — array of mutual fund holding objects
 *   equity  — array of equity / demat holding objects
 *   investor — { name, email, pan } from the CAS header
 *   warnings — non-fatal notes (e.g. "no equity section found")
 *
 * All holding objects conform to the app's portfolio format:
 *   { id, sym, name, type, acct, acctName, sh, cost, price, isin }
 */

const CAS_API_URL = import.meta.env.VITE_CAS_API_URL
  ? `${import.meta.env.VITE_CAS_API_URL}/api/cas`
  : '/api/cas';

/**
 * Upload a CAS PDF file and return parsed holdings.
 *
 * @param {File}   file      — the PDF File object from <input type="file">
 * @param {string} password  — PDF password (often PAN lowercase or email prefix + DOB)
 * @returns {Promise<{ mf: [], equity: [], investor: {}, warnings: [] }>}
 */
export async function parseCasPdf(file, password = '') {
  const form = new FormData();
  form.append('file', file, file.name);
  form.append('password', password.trim());

  const resp = await fetch(CAS_API_URL, {
    method: 'POST',
    body: form,
    // Do NOT set Content-Type — browser must set it with the multipart boundary
  });

  if (!resp.ok) {
    let msg = `Server error ${resp.status}`;
    try { const d = await resp.json(); msg = d.error || msg; } catch (_) {}
    throw new Error(msg);
  }

  const data = await resp.json();
  if (!data.ok) throw new Error(data.error || 'CAS parsing failed.');

  return {
    mf:       data.mf      || [],
    equity:   data.equity  || [],
    investor: data.investor || {},
    warnings: data.warnings || [],
  };
}
