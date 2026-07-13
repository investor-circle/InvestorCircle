"""
api/cas.py  —  Vercel Python Serverless Function
=================================================
Parse an uploaded CAS (Consolidated Account Statement) PDF using the
casparser library, plus best-effort equity extraction via pdfplumber.

POST /api/cas   multipart/form-data
  file      : the CAS PDF binary
  password  : PDF password (string, may be empty)

Returns:
  { "ok": true, "mf": [...], "equity": [...], "investor": {...}, "warnings": [...] }
  { "ok": false, "error": "..." }

Coverage:
  MF holdings   → casparser (CAMS / KFintech / CDSL CAS)
  Equity/Demat  → pdfplumber table extraction (CDSL CAS demat section)
"""

import cgi
import io
import json
import traceback
from http.server import BaseHTTPRequestHandler

import casparser
import pdfplumber


# ── MF extraction via casparser ───────────────────────────────────────────────

def _mf_from_cas(cas_data) -> list:
    holdings = []
    for fi, folio in enumerate(cas_data.folios or []):
        acct_name = f"CAS – {folio.folio or 'MF Folio'}"
        for si, s in enumerate(folio.schemes or []):
            try:
                nav = float(getattr(s.valuation, 'nav',  None) or 0)
                val = float(getattr(s.valuation, 'value', None) or 0)
                # prefer close_calculated (more accurate) then close, then derive
                units = float(
                    getattr(s, 'close_calculated', None) or
                    getattr(s, 'close', None) or
                    (val / nav if nav > 0 else 0)
                )
                if units <= 0:
                    continue
                isin = (getattr(s, 'isin', '') or '').strip()
                name = (getattr(s, 'scheme', '') or '').strip() or 'Unknown Fund'
                sym  = isin or name[:10].upper().replace(' ', '_')
                holdings.append({
                    'id':       f'cas_mf_{fi}_{si}',
                    'sym':      sym[:10],
                    'name':     name,
                    'type':     'Fund',
                    'acct':     'cas',
                    'acctName': acct_name,
                    'sh':       round(units, 4),
                    'cost':     round(nav, 4),
                    'price':    round(nav, 4),
                    'isin':     isin,
                })
            except Exception:
                continue
    return holdings


# ── Equity extraction via pdfplumber ─────────────────────────────────────────
# Reads the "Demat Holdings" section of a CDSL / NSDL CAS PDF.
# CDSL table columns vary but always include ISIN, security name, and quantity.

_EQUITY_COLS = {
    'isin':  ['isin'],
    'name':  ['security name', 'scrip name', 'name of security', 'instrument name'],
    'qty':   ['quantity', 'qty', 'no of units', 'balance units', 'closing balance'],
    'rate':  ['rate', 'market price', 'nav', 'ltp', 'closing price'],
    'value': ['market value', 'closing value', 'current value'],
}

def _find_col(headers: list, candidates: list) -> int | None:
    for c in candidates:
        for i, h in enumerate(headers):
            if c in h.lower():
                return i
    return None

def _num(v) -> float:
    try:
        return float(str(v or '').replace(',', '').replace('₹', '').strip())
    except Exception:
        return 0.0

def _equity_from_pdf(pdf_bytes: bytes, password: str) -> list:
    holdings = []
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes),
                             password=password or '') as pdf:
            for pg in pdf.pages:
                text = (pg.extract_text() or '').upper()
                # Only look at pages that seem to contain demat / equity data
                if not any(k in text for k in ('ISIN', 'DEMAT', 'EQUITY', 'SCRIP')):
                    continue
                for table in (pg.extract_tables() or []):
                    if not table or len(table) < 2:
                        continue
                    raw_hdr = table[0] or []
                    hdrs = [str(h or '').strip() for h in raw_hdr]

                    ci_isin = _find_col(hdrs, _EQUITY_COLS['isin'])
                    ci_name = _find_col(hdrs, _EQUITY_COLS['name'])
                    ci_qty  = _find_col(hdrs, _EQUITY_COLS['qty'])
                    ci_rate = _find_col(hdrs, _EQUITY_COLS['rate'])
                    ci_val  = _find_col(hdrs, _EQUITY_COLS['value'])

                    if ci_isin is None and ci_qty is None:
                        continue  # not an equity table

                    for ri, row in enumerate(table[1:]):
                        if not row:
                            continue
                        try:
                            get = lambda ci: str(row[ci] or '').strip() if ci is not None and ci < len(row) else ''
                            isin  = get(ci_isin)
                            name  = get(ci_name)
                            qty   = _num(get(ci_qty))
                            rate  = _num(get(ci_rate))
                            val   = _num(get(ci_val))

                            if qty <= 0:
                                continue
                            if not isin and not name:
                                continue
                            # Skip obviously non-ISIN values in the ISIN column
                            if isin and not (isin.startswith('IN') and len(isin) == 12):
                                isin = ''
                            if not rate and val and qty:
                                rate = round(val / qty, 4)

                            sym = isin or (name or 'EQ')[:10].upper().replace(' ', '')
                            holdings.append({
                                'id':       f'cas_eq_{len(holdings)}',
                                'sym':      sym[:10],
                                'name':     name or isin or 'Equity Holding',
                                'type':     'ETF' if 'ETF' in (name or '').upper() or 'BEES' in (name or '').upper() else 'Stock',
                                'acct':     'cas',
                                'acctName': 'CAS – Demat Holdings',
                                'sh':       round(qty, 4),
                                'cost':     round(rate, 4),
                                'price':    round(rate, 4),
                                'isin':     isin,
                            })
                        except Exception:
                            continue
    except Exception:
        pass  # pdfplumber failure is non-fatal; we still return MF data
    return holdings


# ── HTTP handler ──────────────────────────────────────────────────────────────

class handler(BaseHTTPRequestHandler):

    def _cors(self):
        self.send_header('Access-Control-Allow-Origin',  '*')
        self.send_header('Access-Control-Allow-Methods', 'POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')

    def do_OPTIONS(self):
        self.send_response(204)
        self._cors()
        self.end_headers()

    def do_POST(self):
        content_length = int(self.headers.get('Content-Length', 0))
        content_type   = self.headers.get('Content-Type', '')

        try:
            # ── Parse multipart form data ──────────────────────────────────
            environ = {
                'REQUEST_METHOD':  'POST',
                'CONTENT_TYPE':    content_type,
                'CONTENT_LENGTH':  str(content_length),
            }
            form = cgi.FieldStorage(
                fp=self.rfile,
                headers=self.headers,
                environ=environ,
            )
            pdf_item = form['file']
            pdf_bytes = pdf_item.file.read()
            password  = form.getvalue('password', '') or ''

            # ── Parse with casparser ───────────────────────────────────────
            warnings = []
            mf_holdings = []
            investor = {}

            for pwd in [password, '', password.lower(), password.upper()]:
                try:
                    cas = casparser.read(io.BytesIO(pdf_bytes), pwd)
                    mf_holdings = _mf_from_cas(cas)
                    investor = {
                        'name':  getattr(getattr(cas, 'investor_info', None), 'name',  '') or '',
                        'email': getattr(getattr(cas, 'investor_info', None), 'email', '') or '',
                        'pan':   getattr(getattr(cas, 'investor_info', None), 'pan',   '') or '',
                    }
                    break
                except Exception as e:
                    last_err = str(e)
                    continue
            else:
                warnings.append(f'MF parsing failed ({last_err}). '
                                'Check your password and ensure this is a CAMS/KFintech CAS.')

            # ── Extract equity via pdfplumber ──────────────────────────────
            eq_holdings = _equity_from_pdf(pdf_bytes, password)
            if not eq_holdings:
                warnings.append('No equity/demat holdings detected. '
                                'This is expected for a CAMS-only MF statement.')

            result = {
                'ok':       True,
                'mf':       mf_holdings,
                'equity':   eq_holdings,
                'investor': investor,
                'warnings': warnings,
            }
            status = 200

        except KeyError:
            result = {'ok': False, 'error': 'No file received. Send the PDF as "file" field in multipart form.'}
            status = 400
        except Exception:
            traceback.print_exc()
            result = {'ok': False, 'error': 'Unexpected error parsing the CAS. See Vercel function logs.'}
            status = 500

        payload = json.dumps(result).encode()
        self.send_response(status)
        self._cors()
        self.send_header('Content-Type',   'application/json')
        self.send_header('Content-Length', str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, fmt, *args):
        pass
