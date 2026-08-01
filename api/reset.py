"""
api/reset.py — Vercel serverless function for password reset (Option B — custom branded email)

Flow:
  1. Frontend POSTs { email } here (does NOT call Firebase directly)
  2. This function uses Firebase Admin SDK to generate the reset oobCode
  3. Builds a custom reset URL pointing back to myinvestorcircle.com
  4. Sends a branded email via Resend with that URL
  5. User clicks link → lands on app → App.jsx detects ?mode=resetPassword&oobCode=...
     → shows ResetPasswordPage → calls confirmPasswordReset(auth, oobCode, newPassword)

Security notes:
  • Always returns HTTP 200 regardless of whether the email exists in Firebase.
    This prevents email enumeration attacks.
  • The oobCode is generated and owned by Firebase — it expires in 1 hour
    and is single-use. This function cannot reset a password itself.
  • FIREBASE_SERVICE_ACCOUNT_JSON must be stored as a Vercel env var (never in git).

Vercel env vars required:
  FIREBASE_SERVICE_ACCOUNT_JSON  — full JSON of a Firebase service account key
                                   (Firebase Console → Project Settings → Service Accounts
                                    → Generate new private key)
  RESEND_API_KEY                 — from resend.com/api-keys
  FROM_EMAIL                     — e.g. hello@myinvestorcircle.com
"""

import os
import sys
import json
from urllib.parse import urlparse, parse_qs
from http.server import BaseHTTPRequestHandler

import resend
import firebase_admin
from firebase_admin import auth as fb_auth, credentials


# ── Firebase Admin: initialise once per cold start ────────────────────────────

_fb_app = None

def _get_fb_app():
    global _fb_app
    if _fb_app:
        return _fb_app
    # Guard against duplicate initialisation (Vercel may reuse the process)
    try:
        _fb_app = firebase_admin.get_app()
        return _fb_app
    except ValueError:
        pass  # no app yet — initialise below

    sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
    if not sa_json:
        raise RuntimeError("FIREBASE_SERVICE_ACCOUNT_JSON env var is not set in Vercel")

    sa_dict = json.loads(sa_json)
    cred    = credentials.Certificate(sa_dict)
    _fb_app = firebase_admin.initialize_app(cred)
    return _fb_app


# ── Config ────────────────────────────────────────────────────────────────────

APP_URL     = "https://myinvestorcircle.com"
BRAND_COLOR = "#6d5df5"
FROM_EMAIL  = os.environ.get("FROM_EMAIL", "hello@myinvestorcircle.com")


# ── Branded email HTML ────────────────────────────────────────────────────────

def _reset_email_html(reset_url: str) -> str:
    """Branded password-reset email — matches the style of email.py."""
    btn_html = (
        f'<a href="{reset_url}" style="display:inline-block;background:{BRAND_COLOR};'
        f'color:#fff;padding:12px 28px;border-radius:8px;text-decoration:none;'
        f'font-weight:700;font-family:sans-serif;font-size:14px;">'
        f'Reset my password →</a>'
    )
    return f"""<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/></head>
<body style="margin:0;padding:0;background:#f5f5fb;">
<div style="font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;
            max-width:560px;margin:32px auto;padding:0 16px 32px;">
  <div style="background:#fff;border-radius:16px;overflow:hidden;
              box-shadow:0 2px 12px rgba(0,0,0,.07);">
    <div style="background:{BRAND_COLOR};padding:24px 32px;text-align:center;">
      <span style="font-size:22px;font-weight:900;color:#fff;letter-spacing:-.5px;">
        myInvestorCircle
      </span>
    </div>
    <div style="padding:28px 32px;">
      <h2 style="margin:0 0 8px;font-size:20px;color:#1a1a2e;">Reset your password 🔐</h2>
      <p style="color:#555;margin:0 0 16px;">
        We received a request to reset the password for your myInvestorCircle account.
      </p>
      <p style="color:#444;margin:0 0 24px;">
        Click the button below to choose a new password. This link is valid for
        <strong>1 hour</strong> and can only be used once.
      </p>
      <p style="margin:0 0 28px;text-align:center;">{btn_html}</p>
      <p style="font-size:13px;color:#888;text-align:center;margin:0 0 24px;">
        Or copy this link:<br/>
        <a href="{reset_url}" style="color:{BRAND_COLOR};word-break:break-all;">{reset_url}</a>
      </p>
      <div style="background:#fff8ed;border:1px solid #f5c97a;border-radius:10px;
                  padding:14px 18px;font-size:13px;color:#7a5a1a;line-height:1.7;">
        <strong>⚠ Didn't request this?</strong><br/>
        You can safely ignore this email — your password will not change unless you
        click the link above. If you're concerned, reply to this email immediately.
      </div>
    </div>
    <div style="padding:16px 32px;border-top:1px solid #eee;
                font-size:12px;color:#999;text-align:center;line-height:1.7;">
      myInvestorCircle · Your trusted network for investment ideas<br/>
      <a href="{APP_URL}" style="color:{BRAND_COLOR};text-decoration:none;">myinvestorcircle.com</a>
      &nbsp;·&nbsp;
      <a href="mailto:{FROM_EMAIL}" style="color:{BRAND_COLOR};text-decoration:none;">{FROM_EMAIL}</a>
    </div>
  </div>
</div>
</body>
</html>"""


# ── Vercel handler ────────────────────────────────────────────────────────────

class handler(BaseHTTPRequestHandler):

    def do_POST(self):
        email = ""
        try:
            length = int(self.headers.get("Content-Length", 0))
            body   = json.loads(self.rfile.read(length)) if length else {}
            email  = (body.get("email") or "").strip().lower()

            if not email:
                return self._respond(400, {"error": "email is required"})

            _get_fb_app()

            # Generate Firebase password reset link.
            # If the email doesn't exist, Firebase raises UserNotFoundError —
            # we silently swallow it and return 200 to prevent email enumeration.
            try:
                firebase_link = fb_auth.generate_password_reset_link(email)
            except fb_auth.UserNotFoundError:
                print(f"[reset] email not found (suppressed): {email}", file=sys.stderr)
                return self._respond(200, {"ok": True})

            # Extract the oobCode from the Firebase-generated link and build
            # a custom URL that points back to the app.
            query    = parse_qs(urlparse(firebase_link).query)
            oob_code = query.get("oobCode", [""])[0]
            if not oob_code:
                raise ValueError("Firebase returned a reset link with no oobCode")

            reset_url = f"{APP_URL}?mode=resetPassword&oobCode={oob_code}"

            # Send the branded email
            resend.api_key = os.environ.get("RESEND_API_KEY", "")
            if not resend.api_key:
                raise RuntimeError("RESEND_API_KEY env var is not set in Vercel")

            result = resend.Emails.send({
                "from":     FROM_EMAIL,
                "to":       [email],
                "reply_to": FROM_EMAIL,
                "subject":  "Reset your myInvestorCircle password",
                "html":     _reset_email_html(reset_url),
            })
            print(f"[reset] OK  to={email}  id={getattr(result,'id',result)}", file=sys.stderr)
            self._respond(200, {"ok": True})

        except Exception as e:
            print(f"[reset] ERR  to={email}  err={e}", file=sys.stderr)
            self._respond(500, {"error": str(e)})

    def _respond(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type",   "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, *args):
        pass  # suppress default access log noise
