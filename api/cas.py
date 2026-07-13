"""
api/cas.py  —  Vercel Python Serverless Function
=================================================
Parse an uploaded CAS PDF using casparser 1.3.0 and pdfplumber.

POST /api/cas   multipart/form-data
  file      : the CAS PDF binary
  password  : PDF password string (may be empty)

Returns:
  { "ok": true, "mf": [...], "equity": [...], "investor": {...}, "warnings": [...] }
  { "ok": false, "error": "..." }

casparser 1.3.0 returns one of two types depending on the CAS format:
  CASData      — CAMS / KFintech MF CAS  →  .folios (MF holdings)
  NSDLCASData  — NSDL / CDSL demat CAS  →  .accounts[].equities + .accounts[].mutual_funds

pdfplumber is kept as a fallback for equity tables that casparser may miss.
"""

import cgi
import io
import json
import traceback
from http.server import BaseHTTPRequestHandler

import casparser
import casparser.types as ct
import pdfplumber


# ── MF extraction — CASData path (CAMS/KFintech) ────────────────────────────

def _mf_from_casdata(cas) -> list:
    """Extract MF holdings from CASData.folios."""
    holdings = []
    pan = None
    for fi, folio in enumerate(getattr(cas, 'folios', []) or []):
        if not pan:
            pan = getattr(folio, 'PAN', None)
        acct = f"CAS – {folio.folio or folio.amc or 'MF'}"
        for si, s in enumerate(folio.schemes or []):
            try:
                units = float(s.close_calculated or s.close or 0)
                if units <= 0:
                    continue
                nav   = float(s.valuation.nav   or 0)
                cost  = float(s.valuation.cost  or nav)   # real cost if available
                value = float(s.valuation.value or 0)
                isin  = (s.isin or '').strip()
                name  = (s.scheme or '').strip() or 'Unknown Fund'
                sym   = isin[:12] if isin else name[:10].upper().replace(' ', '_')
                holdings.append({
                    'id':       f'cas_mf_{fi}_{si}',
                    'sym':      sym[:12],
                    'name':     name,
                    'type':     'Fund',
                    'acct':     'cas',
                    'acctName': acct,
                    'sh':       round(units, 4),
                    'cost':     round(cost,  4),
                    'price':    round(nav,   4),
                    'isin':     isin,
                })
            except Exception:
                continue
    return holdings, pan


# ── MF + Equity extraction — NSDLCASData path (NSDL/CDSL demat) ─────────────

def _from_nsdlcasdata(cas) -> tuple:
    """Extract equity and MF from NSDLCASData.accounts."""
    mf_list, eq_list = [], []
    for ai, acct in enumerate(getattr(cas, 'accounts', []) or []):
        acct_label = f"CAS – {acct.name or 'Demat'}"

        # Equity holdings
        for ei, eq in enumerate(getattr(acct, 'equities', []) or []):
            try:
                qty   = float(eq.num_shares or 0)
                if qty <= 0:
                    continue
                price = float(eq.price or 0)
                isin  = (eq.isin or '').strip()
                name  = (eq.name or isin or 'Equity').strip()
                sym   = (eq.symbol or isin or name[:10]).strip()[:10].upper()
                eq_list.append({
                    'id':       f'cas_eq_{ai}_{ei}',
                    'sym':      sym,
                    'name':     name,
                    'type':     'ETF' if any(k in name.upper() for k in ('ETF','BEES','NIFTY','FUND')) else 'Stock',
                    'acct':     'cas',
                    'acctName': acct_label,
                    'sh':       round(qty,   4),
                    'cost':     round(price, 4),
                    'price':    round(price, 4),
                    'isin':     isin,
                    'exchange': getattr(eq, 'exchange', '') or '',
                })
            except Exception:
                continue

        # MF held in demat form
        for mi, mf in enumerate(getattr(acct, 'mutual_funds', []) or []):
            try:
                bal  = float(mf.balance or 0)
                if bal <= 0:
                    continue
                nav  = float(mf.nav      or 0)
                cost = float(mf.avg_cost or nav)
                isin = (mf.isin or '').strip()
                name = (mf.name or isin or 'Fund').strip()
                sym  = isin[:12] if isin else name[:10].upper().replace(' ','_')
                mf_list.append({
                    'id':       f'cas_dmf_{ai}_{mi}',
                    'sym':      sym,
                    'name':     name,
                    'type':     'Fund',
                    'acct':     'cas',
                    'acctName': acct_label,
                    'sh':       round(bal,  4),
                    'cost':     round(cost, 4),
                    'price':    round(nav,  4),
                    'isin':     isin,
                })
            except Exception:
                continue

    return mf_list, eq_list


# ── pdfplumber fallback equity extraction ────────────────────────────────────

_EQ_COLS = {
    'isin':  ['isin'],
    'name':  ['security name', 'scrip name', 'name of security', 'instrument'],
    'qty':   ['quantity', 'qty', 'no of units', 'balance units', 'closing balance'],
    'rate':  ['rate', 'market price', 'nav', 'ltp', 'closing price'],
    'value': ['market value', 'closing value', 'current value'],
}

def _find_col(hdrs, keys):
    for k in keys:
        for i, h in enumerate(hdrs):
            if k in h.lower():
                return i
    return None

def _num(v):
    try: return float(str(v or '').replace(',', '').replace('₹', '').strip())
    except: return 0.0

def _equity_pdfplumber(pdf_bytes: bytes, password: str) -> list:
    holdings = []
    try:
        with pdfplumber.open(io.BytesIO(pdf_bytes), password=password or '') as pdf:
            for pg in pdf.pages:
                text = (pg.extract_text() or '').upper()
                if not any(k in text for k in ('ISIN', 'DEMAT', 'EQUITY', 'SCRIP')):
                    continue
                for tbl in (pg.extract_tables() or []):
                    if not tbl or len(tbl) < 2:
                        continue
                    hdrs = [str(h or '').strip() for h in tbl[0]]
                    ci_isin = _find_col(hdrs, _EQ_COLS['isin'])
                    ci_name = _find_col(hdrs, _EQ_COLS['name'])
                    ci_qty  = _find_col(hdrs, _EQ_COLS['qty'])
                    ci_rate = _find_col(hdrs, _EQ_COLS['rate'])
                    if ci_isin is None and ci_qty is None:
                        continue
                    for ri, row in enumerate(tbl[1:]):
                        if not row:
                            continue
                        try:
                            g = lambda ci: str(row[ci] or '').strip() if ci is not None and ci < len(row) else ''
                            isin = g(ci_isin)
                            name = g(ci_name)
                            qty  = _num(g(ci_qty))
                            rate = _num(g(ci_rate))
                            if qty <= 0 or (not isin and not name):
                                continue
                            if isin and not (len(isin) == 12 and isin[:2].isalpha()):
                                isin = ''
                            sym = isin or (name or 'EQ')[:10].upper().replace(' ','')
                            holdings.append({
                                'id':       f'cas_pdfb_{len(holdings)}',
                                'sym':      sym[:12],
                                'name':     name or isin or 'Equity Holding',
                                'type':     'ETF' if 'ETF' in (name or '').upper() else 'Stock',
                                'acct':     'cas',
                                'acctName': 'CAS – Demat Holdings',
                                'sh':       round(qty,  4),
                                'cost':     round(rate, 4),
                                'price':    round(rate, 4),
                                'isin':     isin,
                            })
                        except Exception:
                            continue
    except Exception:
        pass
    return holdings


# ── Main parse dispatcher ────────────────────────────────────────────────────

_PWD_VARIANTS = lambda p: [p, '', p.lower(), p.upper(), p[:8], (p or '').replace(' ','')]

def parse_cas(pdf_bytes: bytes, password: str) -> dict:
    warnings = []
    mf, equity, investor, pan = [], [], {}, None

    # Try each password variant
    cas = None
    last_err = 'Unknown error'
    for pwd in _PWD_VARIANTS(password):
        try:
            cas = casparser.read_cas_pdf(io.BytesIO(pdf_bytes), pwd)
            break
        except Exception as e:
            last_err = str(e)

    if cas is None:
        warnings.append(f'casparser could not read the PDF ({last_err}). '
                        'Check your password. Try PAN in lowercase for CDSL, '
                        'or first 4 chars of email + DDMMYYYY for CAMS.')
    else:
        # Dispatch on return type
        if isinstance(cas, ct.NSDLCASData):
            mf_d, equity = _from_nsdlcasdata(cas)
            mf += mf_d
        else:
            # CASData — CAMS/KFintech MF CAS
            mf_holdings, pan = _mf_from_casdata(cas)
            mf += mf_holdings

        # Investor info (same structure on both types)
        ii = getattr(cas, 'investor_info', None)
        if ii:
            investor = {
                'name':   getattr(ii, 'name',   '') or '',
                'email':  getattr(ii, 'email',  '') or '',
                'mobile': getattr(ii, 'mobile', '') or '',
                'pan':    pan or '',
            }

        for w in (getattr(cas, 'parse_warnings', []) or []):
            if w:
                warnings.append(str(w))

    # pdfplumber fallback — only add equity if casparser found none
    if not equity:
        equity = _equity_pdfplumber(pdf_bytes, password)
        if equity:
            warnings.append('Equity holdings extracted via fallback PDF parser — '
                            'please review before importing.')
        else:
            warnings.append('No equity/demat holdings found. '
                            'If you expected equity, this may be a CAMS MF-only statement.')

    return {
        'ok':       True,
        'mf':       mf,
        'equity':   equity,
        'investor': investor,
        'warnings': [w for w in warnings if w],
    }


# ── HTTP handler ─────────────────────────────────────────────────────────────

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
            environ = {
                'REQUEST_METHOD': 'POST',
                'CONTENT_TYPE':   content_type,
                'CONTENT_LENGTH': str(content_length),
            }
            form      = cgi.FieldStorage(fp=self.rfile, headers=self.headers, environ=environ)
            pdf_bytes = form['file'].file.read()
            password  = form.getvalue('password', '') or ''
            result    = parse_cas(pdf_bytes, password)
            status    = 200
        except KeyError:
            result = {'ok': False, 'error': 'No PDF received. Send file as "file" field in multipart/form-data.'}
            status = 400
        except Exception:
            traceback.print_exc()
            result = {'ok': False, 'error': 'Unexpected server error. Check Vercel function logs.'}
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
