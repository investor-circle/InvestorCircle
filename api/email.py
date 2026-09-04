"""
api/email.py — Vercel serverless email handler (Python 3.9)
Sends transactional emails via Resend (https://resend.com).

PREREQUISITES — all must be in place before any email sends:
  1. requirements.txt (repo root) must contain:  resend>=2.0.0
  2. Vercel Environment Variables:
       RESEND_API_KEY  — from resend.com/api-keys
       FROM_EMAIL      — e.g. hello@myinvestorcircle.com  (domain must be verified in Resend)
  3. myinvestorcircle.com must be verified in Resend dashboard → Domains

NOTE ON "SENT ITEMS": Resend sends through its own SMTP servers.
Emails will NOT appear in Gmail/Outlook sent folders for hello@myinvestorcircle.com.
Check delivery at: resend.com → Emails (and Logs for errors).
"""

import os
import sys
import json
import hmac
import resend
import firebase_admin
from firebase_admin import auth as fb_auth, credentials
from http.server import BaseHTTPRequestHandler

resend.api_key = os.environ.get("RESEND_API_KEY", "")
FROM_EMAIL     = os.environ.get("FROM_EMAIL", "hello@myinvestorcircle.com")
REPLY_TO       = FROM_EMAIL   # replies land back in the hello@ inbox
APP_URL        = "https://myinvestorcircle.com"
BRAND_COLOR    = "#6d5df5"

# Where claim notifications for the team go. Fixed here rather than taken from
# the request — see the policy table below.
ADMIN_INBOX    = "hello@myinvestorcircle.com"


# ── Firebase Admin: initialise once per cold start ────────────────────────────
# Same pattern as api/reset.py, which already verifies tokens this way.

_fb_app = None

def _get_fb_app():
    global _fb_app
    if _fb_app:
        return _fb_app
    try:
        _fb_app = firebase_admin.get_app()
        return _fb_app
    except ValueError:
        pass  # no app yet — initialise below

    sa_json = os.environ.get("FIREBASE_SERVICE_ACCOUNT_JSON", "").strip()
    if not sa_json:
        raise RuntimeError("FIREBASE_SERVICE_ACCOUNT_JSON env var is not set in Vercel")
    _fb_app = firebase_admin.initialize_app(credentials.Certificate(json.loads(sa_json)))
    return _fb_app


# ── Shared helpers ─────────────────────────────────────────────────────────────

def btn(text, url):
    return (
        f'<a href="{url}" style="display:inline-block;background:{BRAND_COLOR};color:#fff;'
        f'padding:12px 28px;border-radius:8px;text-decoration:none;font-weight:700;'
        f'font-family:sans-serif;font-size:14px;">{text}</a>'
    )

def layout(body_html):
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
      {body_html}
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


# ── Email templates ─────────────────────────────────────────────────────────────

def tpl_signup_welcome(data):
    first_name = data.get("first_name") or (data.get("full_name","there").split()[0])
    email      = data.get("to_email", "")
    return {
        "subject": f"Welcome to myInvestorCircle, {first_name}! 🎉",
        "html": layout(f"""
            <h2 style="margin:0 0 8px;font-size:20px;color:#1a1a2e;">Welcome aboard! 👋</h2>
            <p style="color:#555;margin:0 0 16px;">
              Hi <strong>{first_name}</strong>, great to have you on myInvestorCircle.
            </p>
            <p style="color:#444;margin:0 0 24px;">
              Your account is ready. Start sharing high-conviction investment ideas
              with your trusted circle — and discover what others are sharing.
            </p>
            <p style="margin:0 0 28px;text-align:center;">{btn("Go to myInvestorCircle →", APP_URL)}</p>
            <div style="background:#fff8ed;border:1px solid #f5c97a;border-radius:10px;
                        padding:14px 18px;font-size:13px;color:#7a5a1a;line-height:1.7;">
              <strong>⚠ Didn't register?</strong><br/>
              This account was created with <strong>{email}</strong>.
              If that wasn't you, reply to this email immediately so we can secure your address.
            </div>"""),
    }


def tpl_invite(data):
    from_name   = data.get("from_name", "A fellow investor")
    invite_link = data.get("invite_link", APP_URL)
    return {
        "subject": f"{from_name} invited you to myInvestorCircle 🚀",
        "html": layout(f"""
            <h2 style="margin:0 0 12px;font-size:20px;color:#1a1a2e;">You're invited! 🎉</h2>
            <p style="color:#444;margin:0 0 16px;">
              <strong>{from_name}</strong> is sharing investment ideas on myInvestorCircle
              and wants you to join their circle.
            </p>
            <p style="color:#444;margin:0 0 28px;">
              myInvestorCircle is where serious retail investors exchange high-conviction ideas,
              track each other's calls, and build real investment networks.
            </p>
            <p style="margin:0 0 20px;text-align:center;">{btn("Join myInvestorCircle →", invite_link)}</p>
            <p style="font-size:13px;color:#888;text-align:center;">
              Or copy: <a href="{invite_link}" style="color:{BRAND_COLOR};">{invite_link}</a>
            </p>"""),
    }


def tpl_welcome_referred(data):
    referrer_name     = data.get("referrer_name", "A fellow investor")
    referrer_username = data.get("referrer_username", "")
    return {
        "subject": f"Welcome to myInvestorCircle — {referrer_name} added you to their circle!",
        "html": layout(f"""
            <h2 style="margin:0 0 12px;font-size:20px;color:#1a1a2e;">Welcome! 👋</h2>
            <p style="color:#444;margin:0 0 16px;">
              You joined through <strong>{referrer_name}</strong>'s invite — great choice!
            </p>
            <p style="color:#444;margin:0 0 28px;">
              You've been automatically added to each other's investment circles.
              You can now see their ideas, track their calls, and share your own back.
            </p>
            <p style="margin:0 0 28px;text-align:center;">{btn("Explore your feed →", APP_URL)}</p>
            <p style="font-size:13px;color:#666;">
              Want to grow your circle? Go to <strong>Pulse → Invite Friends</strong>
              in the app to get your personal invite link.
            </p>"""),
    }


def tpl_referral_converted(data):
    new_user_name = data.get("new_user_name", "Someone")
    return {
        "subject": f"🎉 {new_user_name} just joined myInvestorCircle through your invite!",
        "html": layout(f"""
            <h2 style="margin:0 0 12px;font-size:20px;color:#1a1a2e;">Your invite worked! 🎉</h2>
            <p style="color:#444;margin:0 0 16px;">
              <strong>{new_user_name}</strong> just signed up through your referral link.
            </p>
            <p style="color:#444;margin:0 0 28px;">
              They've been added to your investment circle automatically.
            </p>
            <p style="text-align:center;">{btn("View your circle →", APP_URL)}</p>"""),
    }


def tpl_connection_request(data):
    from_name     = data.get("from_name", "Someone")
    from_username = data.get("from_username", "")
    profile_url   = f"{APP_URL}/#/investor/{from_username}" if from_username else APP_URL
    return {
        "subject": f"{from_name} wants to connect with you on myInvestorCircle 🤝",
        "html": layout(f"""
            <h2 style="margin:0 0 12px;font-size:20px;color:#1a1a2e;">New connection request 🤝</h2>
            <p style="color:#444;margin:0 0 16px;">
              <strong>{from_name}</strong> has sent you a connection request on myInvestorCircle.
            </p>
            <p style="color:#444;margin:0 0 24px;">
              Once you accept, you'll be able to see each other's ideas in your feed.
            </p>
            <p style="margin:0 0 24px;text-align:center;">{btn("Open the app to accept →", APP_URL)}</p>
            <p style="font-size:13px;color:#888;">
              Tap the 🔔 notification bell in the app to accept or decline.
              {"You can also <a href='" + profile_url + "' style='color:" + BRAND_COLOR + ";'>view their profile</a> before deciding." if from_username else ""}
            </p>"""),
    }


def tpl_connection_accepted(data):
    their_name     = data.get("their_name", "Someone")
    their_username = data.get("their_username", "")
    profile_url    = f"{APP_URL}/#/investor/{their_username}" if their_username else APP_URL
    return {
        "subject": f"{their_name} accepted your connection on myInvestorCircle 🤝",
        "html": layout(f"""
            <h2 style="margin:0 0 12px;font-size:20px;color:#1a1a2e;">New connection! 🤝</h2>
            <p style="color:#444;margin:0 0 16px;">
              <strong>{their_name}</strong> accepted your connection request on myInvestorCircle.
            </p>
            <p style="color:#444;margin:0 0 28px;">
              You can now see each other's public ideas in your feed.
            </p>
            <p style="text-align:center;">{btn("View their profile →", profile_url)}</p>"""),
    }


def tpl_reco_comment(data):
    commenter_name = data.get("commenter_name", "Someone")
    ticker         = data.get("ticker",         "")
    asset_name     = data.get("asset_name",     "")
    comment        = data.get("comment",        "")
    reco_url       = data.get("reco_url",       APP_URL)
    return {
        "subject": f"{commenter_name} commented on your {ticker} idea",
        "html": layout(f"""
            <h2 style="margin:0 0 12px;font-size:20px;color:#1a1a2e;">New comment 💬</h2>
            <p style="color:#444;margin:0 0 12px;">
              <strong>{commenter_name}</strong> just commented on your
              <strong>{ticker}{(" — " + asset_name) if asset_name else ""}</strong> idea:
            </p>
            <div style="background:#f8f8fc;border-left:3px solid {BRAND_COLOR};border-radius:0 10px 10px 0;
                        padding:14px 18px;margin:0 0 24px;font-size:14px;
                        color:#333;line-height:1.7;font-style:italic;">
              "{comment}"
            </div>
            <p style="text-align:center;">{btn("View &amp; reply →", reco_url)}</p>"""),
    }


def tpl_contact_recommendation(data):
    from_name     = data.get("from_name",     "Someone in your circle")
    from_username = data.get("from_username", "")
    ticker        = data.get("ticker",        "")
    asset_name    = data.get("asset_name",    "")
    reco_type     = data.get("reco_type",     "Buy")
    entry_price   = data.get("entry_price",   "")
    conviction    = data.get("conviction",    "")
    reco_url      = data.get("reco_url",      APP_URL)
    profile_url   = f"{APP_URL}/#/investor/{from_username}" if from_username else APP_URL

    meta_parts = []
    if entry_price: meta_parts.append(f"<span>Entry: <strong>{entry_price}</strong></span>")
    if conviction:  meta_parts.append(f"<span>Conviction: <strong>{conviction}</strong></span>")
    meta_html = (
        f'<div style="display:flex;gap:20px;flex-wrap:wrap;margin:10px 0 16px;font-size:13px;color:#555;">'
        + "".join(meta_parts) + "</div>"
    ) if meta_parts else ""

    type_color = "#22863a" if reco_type.lower() == "buy" else "#c0392b"

    return {
        "subject": f"{from_name} just posted a {reco_type} idea — {ticker}",
        "html": layout(f"""
            <h2 style="margin:0 0 4px;font-size:20px;color:#1a1a2e;">New idea 💡</h2>
            <p style="color:#888;margin:0 0 20px;font-size:13px;">
              <a href="{profile_url}" style="color:{BRAND_COLOR};font-weight:700;text-decoration:none;">{from_name}</a>
              just shared a new idea.
            </p>
            <div style="background:#f8f8fc;border:1px solid #e8e8f2;border-radius:12px;padding:18px 20px;margin-bottom:20px;">
              <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;">
                <span style="background:{type_color};color:#fff;font-size:11px;font-weight:700;
                             padding:3px 9px;border-radius:5px;">{reco_type.upper()}</span>
                <span style="font-size:20px;font-weight:900;">{ticker}</span>
              </div>
              {f'<div style="font-size:14px;color:#555;margin-bottom:4px;">{asset_name}</div>' if asset_name else ""}
              {meta_html}
              {btn("View full idea →", reco_url)}
            </div>
            <p style="font-size:13px;color:#888;line-height:1.6;">
              You're receiving this because {from_name} is in your myInvestorCircle network.
            </p>"""),
    }


def tpl_claim_submitted(data):
    creator_name = data.get("creator_name", "Creator")
    username     = data.get("username", "")
    return {
        "subject": "Profile claim submitted — pending review",
        "html": layout(f"""
            <h2 style="margin:0 0 12px;font-size:20px;color:#1a1a2e;">Claim received ⏳</h2>
            <p style="color:#444;margin:0 0 16px;">
              Hi <strong>{creator_name}</strong>, your claim for
              <strong>@{username}</strong> has been submitted successfully.
            </p>
            <p style="color:#444;margin:0 0 24px;">
              Once approved, your historical ideas and full ICI score
              will appear on your Track Record page. We typically review within 24 hours.
            </p>
            <p style="margin:0 0 28px;text-align:center;">{btn("Visit myInvestorCircle →", APP_URL)}</p>
            <div style="background:#f8f7fc;border:1px solid #e0ddf5;border-radius:10px;
                        padding:14px 16px;font-size:13px;color:#555;line-height:1.7;">
              <strong>Not expecting this?</strong>
              Reply to this email immediately and we'll revoke the claim.
            </div>"""),
    }


def tpl_claim_admin_notify(data):
    creator_name  = data.get("creator_name", "Someone")
    claimer_email = data.get("claimer_email", "")
    profile_name  = data.get("profile_name", "")
    username      = data.get("username", "")
    admin_url     = f"{APP_URL}/#/admin/creators"
    return {
        "subject": f"New profile claim: @{username} — action required",
        "html": layout(f"""
            <h2 style="margin:0 0 12px;font-size:20px;color:#1a1a2e;">New claim request 🔔</h2>
            <p style="color:#444;margin:0 0 8px;">
              <strong>{creator_name}</strong>
              (<a href="mailto:{claimer_email}" style="color:{BRAND_COLOR};">{claimer_email}</a>)
              has claimed the profile <strong>@{username}</strong>
              {("(" + profile_name + ")") if profile_name else ""}.
            </p>
            <p style="margin:0 0 28px;text-align:center;">{btn("Review in Admin Panel →", admin_url)}</p>
            <p style="font-size:13px;color:#888;">Admin → Creators → Pending approvals</p>"""),
    }


def tpl_claim_approved(data):
    creator_name = data.get("creator_name", "Creator")
    username     = data.get("username", "")
    profile_url  = f"{APP_URL}/#/investor/{username}"
    return {
        "subject": f"Your profile @{username} is live! 🎉",
        "html": layout(f"""
            <h2 style="margin:0 0 12px;font-size:20px;color:#1a1a2e;">You're live! 🎉</h2>
            <p style="color:#444;margin:0 0 16px;">
              Hi <strong>{creator_name}</strong>, your profile <strong>@{username}</strong>
              has been approved.
            </p>
            <p style="color:#444;margin:0 0 24px;">
              Your historical ideas and ICI score are now visible on your
              public Track Record page. Share it with your audience!
            </p>
            <p style="margin:0 0 20px;text-align:center;">{btn("View your Track Record →", profile_url)}</p>
            <p style="font-size:13px;color:#888;text-align:center;">
              Public link: <a href="{profile_url}" style="color:{BRAND_COLOR};">{profile_url}</a>
            </p>"""),
    }


def tpl_claim_rejected(data):
    creator_name = data.get("creator_name", "Creator")
    admin_note   = data.get("admin_note", "")
    return {
        "subject": "Profile claim update — action may be needed",
        "html": layout(f"""
            <h2 style="margin:0 0 12px;font-size:20px;color:#1a1a2e;">Claim update</h2>
            <p style="color:#444;margin:0 0 16px;">
              Hi <strong>{creator_name}</strong>, your profile claim could not be approved
              at this time.
              {"<br/><strong>Reason: </strong>" + admin_note if admin_note else ""}
            </p>
            <p style="color:#444;margin:0 0 0;">
              Reply to this email if you have questions or believe this is an error.
            </p>"""),
    }


# ── Template registry ──────────────────────────────────────────────────────────

TEMPLATES = {
    "signup_welcome":         tpl_signup_welcome,
    "invite":                 tpl_invite,
    "welcome_referred":       tpl_welcome_referred,
    "referral_converted":     tpl_referral_converted,
    "connection_request":     tpl_connection_request,
    "connection_accepted":    tpl_connection_accepted,
    "reco_comment":           tpl_reco_comment,
    "contact_recommendation": tpl_contact_recommendation,
    "claim_submitted":        tpl_claim_submitted,
    "claim_admin_notify":     tpl_claim_admin_notify,
    "claim_approved":         tpl_claim_approved,
    "claim_rejected":         tpl_claim_rejected,
}



# ── Who may send what, and to whom ─────────────────────────────────────────────
# The rules themselves live in api/_lib/email_policy.py — dependency-free, so
# they can be unit tested without resend or the Firebase SDK installed. What
# stays here is the part that genuinely needs those: verifying the credential.

sys.path.insert(0, os.path.join(os.path.dirname(__file__), "_lib"))
from email_policy import INTERNAL_SECRET_HEADER, POLICY, authorize  # noqa: E402


def _internal_secret():
    """The configured backend secret, or None. Mirrors api/_lib/internalAuth.js."""
    return (os.environ.get("INTERNAL_API_SECRET", "") or "").strip() or None


def _admin_emails():
    """
    Lower-cased admin addresses from ADMIN_EMAILS (comma-separated), or None
    when unset. None means "cannot tell" — see email_policy.authorize.
    """
    raw = (os.environ.get("ADMIN_EMAILS", "") or "").strip()
    if not raw:
        return None
    return {e.strip().lower() for e in raw.split(",") if e.strip()}


def _verify_caller(headers):
    """
    Identify the caller.

    @returns ("internal", None) | ("user", decoded_token) | (None, reason)
    """
    presented = headers.get(INTERNAL_SECRET_HEADER, "")
    if presented:
        secret = _internal_secret()
        # compare_digest, not ==, so a wrong secret cannot be recovered by
        # timing the response.
        if secret and hmac.compare_digest(presented, secret):
            return "internal", None
        return None, "bad internal secret"

    auth_header = headers.get("Authorization", "") or headers.get("authorization", "")
    if not auth_header.startswith("Bearer "):
        return None, "missing token"
    try:
        return "user", fb_auth.verify_id_token(auth_header[7:], app=_get_fb_app())
    except Exception as e:
        print(f"[email] token verification failed: {e}", file=sys.stderr)
        return None, "invalid token"


# ── Vercel serverless handler ──────────────────────────────────────────────────

class handler(BaseHTTPRequestHandler):

    def do_POST(self):
        email_type = ""
        to_email   = ""
        try:
            length     = int(self.headers.get("Content-Length", 0))
            body       = json.loads(self.rfile.read(length)) if length else {}
            email_type = body.get("type", "")

            # Who is calling? A signed-in member, or our own backend.
            kind, token_or_reason = _verify_caller(self.headers)
            if not kind:
                print(f"[email] refused type={email_type} reason={token_or_reason}", file=sys.stderr)
                return self._respond(401, {"error": "Authentication required"})
            token = token_or_reason if kind == "user" else None

            if email_type not in TEMPLATES:
                return self._respond(400, {"error": f"Unknown email type: '{email_type}'"})

            # What may this caller send, to whom, and under whose name?
            to_email, body = authorize(
                email_type, kind, token, body,
                admin_emails=_admin_emails(),
                admin_inbox=ADMIN_INBOX,
                on_warning=lambda m: print(f"[email] {m}", file=sys.stderr),
            )
            if not to_email:
                return self._respond(403, {"error": body})

            if not resend.api_key:
                print("[email] ERROR: RESEND_API_KEY env var is not set in Vercel", file=sys.stderr)
                return self._respond(500, {"error": "RESEND_API_KEY not configured"})

            tpl    = TEMPLATES[email_type](body)
            result = resend.Emails.send({
                "from":     FROM_EMAIL,
                "to":       [to_email],
                "reply_to": REPLY_TO,
                "subject":  tpl["subject"],
                "html":     tpl["html"],
            })
            print(f"[email] OK  type={email_type}  to={to_email}  id={getattr(result,'id',result)}", file=sys.stderr)
            self._respond(200, {"ok": True, "id": getattr(result, "id", None)})

        except Exception as e:
            print(f"[email] ERR  type={email_type}  to={to_email}  err={e}", file=sys.stderr)
            self._respond(500, {"error": str(e)})

    def _respond(self, status, data):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header("Content-Type",   "application/json")
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()
        self.wfile.write(body)

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin",  "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type, Authorization")
        self.end_headers()

    def log_message(self, *args):
        pass  # suppress default BaseHTTPRequestHandler access logs
