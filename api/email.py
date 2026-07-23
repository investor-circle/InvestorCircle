"""
api/email.py — Vercel serverless email handler (Python)
Sends transactional emails via Resend (https://resend.com).

Setup:
  1. pip install resend  (already added to requirements.txt)
  2. Add RESEND_API_KEY to Vercel environment variables
  3. Add RESEND_API_KEY to GitHub Actions secrets (for CI/CD)
  4. Set FROM_EMAIL env var to your verified domain sender,
     e.g. hello@myinvestorcircle.com (must be verified in Resend dashboard)

Supported email types (pass as JSON body):
  - invite:             send a personal invite to a friend's email address
  - welcome_referred:   welcome email to new user who signed up via referral
  - referral_converted: notify referrer that their invite worked
  - connection_accepted: notify user their connection request was accepted
"""

import os
import json
import resend
from http.server import BaseHTTPRequestHandler

resend.api_key = os.environ.get("RESEND_API_KEY", "")
FROM_EMAIL     = os.environ.get("FROM_EMAIL", "hello@myinvestorcircle.com")
APP_URL        = "https://myinvestorcircle.com"
BRAND_COLOR    = "#6d5df5"

# ── Email templates ─────────────────────────────────────────────────────────────

def btn(text, url):
    return f'''<a href="{url}" style="display:inline-block;background:{BRAND_COLOR};color:#fff;
               padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;
               font-family:sans-serif;">{text}</a>'''

def layout(body_html):
    return f"""
    <div style="font-family:sans-serif;max-width:520px;margin:auto;padding:24px 16px;color:#1a1a2e;">
      <div style="text-align:center;margin-bottom:24px;">
        <span style="font-size:22px;font-weight:900;color:{BRAND_COLOR};">myInvestorCircle</span>
      </div>
      {body_html}
      <div style="margin-top:32px;padding-top:16px;border-top:1px solid #eee;
                  font-size:12px;color:#888;text-align:center;line-height:1.6;">
        myInvestorCircle · Your trusted network for investment ideas<br/>
        <a href="{APP_URL}" style="color:{BRAND_COLOR};">myinvestorcircle.com</a>
      </div>
    </div>"""


def tpl_invite(data):
    from_name   = data.get("from_name", "A friend")
    invite_link = data.get("invite_link", APP_URL)
    return {
        "subject": f"{from_name} invited you to myInvestorCircle 🚀",
        "html": layout(f"""
            <h2 style="margin:0 0 12px;">You're invited to myInvestorCircle! 🎉</h2>
            <p><strong>{from_name}</strong> is sharing stock recommendations with a trusted
            circle of investors — and wants you to join.</p>
            <p>myInvestorCircle is where serious retail investors exchange high-conviction ideas,
            track each other's calls, and build real investment networks.</p>
            <p style="margin:24px 0;">{btn('Join myInvestorCircle →', invite_link)}</p>
            <p style="font-size:13px;color:#888;">
              Or copy this link: <a href="{invite_link}" style="color:{BRAND_COLOR};">{invite_link}</a>
            </p>"""),
    }


def tpl_welcome_referred(data):
    referrer_name = data.get("referrer_name", "A fellow investor")
    referrer_username = data.get("referrer_username", "")
    return {
        "subject": f"Welcome to myInvestorCircle — {referrer_name} added you to their circle!",
        "html": layout(f"""
            <h2 style="margin:0 0 12px;">Welcome to myInvestorCircle! 👋</h2>
            <p>You joined through <strong>{referrer_name}</strong>'s invite — great choice!</p>
            <p>You've been automatically added to each other's investment circles. You can
            now see their recommendations, track their calls, and share ideas back.</p>
            <p style="margin:24px 0;">{btn('Explore your feed →', APP_URL)}</p>
            <p style="font-size:13px;color:#555;">
              Want to invite your own network? Go to <strong>Pulse → Invite Friends</strong>
              in the app to get your personal invite link.
            </p>"""),
    }


def tpl_referral_converted(data):
    new_user_name = data.get("new_user_name", "Someone")
    return {
        "subject": f"🎉 {new_user_name} just joined myInvestorCircle through your invite!",
        "html": layout(f"""
            <h2 style="margin:0 0 12px;">Your invite worked! 🎉</h2>
            <p><strong>{new_user_name}</strong> just signed up to myInvestorCircle through your referral link.</p>
            <p>A connection request has been sent automatically — once accepted, you'll both
            be able to see each other's recommendations in your feed.</p>
            <p style="margin:24px 0;">{btn('View your circle →', APP_URL)}</p>"""),
    }


def tpl_connection_accepted(data):
    their_name = data.get("their_name", "Someone")
    their_username = data.get("their_username", "")
    profile_url = f"{APP_URL}/#/investor/{their_username}" if their_username else APP_URL
    return {
        "subject": f"{their_name} accepted your connection on myInvestorCircle",
        "html": layout(f"""
            <h2 style="margin:0 0 12px;">New connection! 🤝</h2>
            <p><strong>{their_name}</strong> accepted your connection request on myInvestorCircle.</p>
            <p>You can now see each other's public recommendations in your feed.</p>
            <p style="margin:24px 0;">{btn('View their profile →', profile_url)}</p>"""),
    }


def tpl_signup_welcome(data):
    first_name = data.get("first_name") or data.get("full_name", "there").split()[0]
    email      = data.get("to_email", "")
    return {
        "subject": f"Welcome to myInvestorCircle, {first_name}! 🎉",
        "html": layout(f"""
            <h2 style="margin:0 0 8px;">Welcome to myInvestorCircle! 👋</h2>
            <p style="color:#555;margin-bottom:20px;">
              Hi <strong>{first_name}</strong>, great to have you on board.
            </p>
            <p>
              Your account has been created and is ready to use.
              Start sharing investment ideas with your trusted circle and discover what
              other investors are recommending.
            </p>
            <p style="margin:24px 0;">{btn('Go to myInvestorCircle →', APP_URL)}</p>

            <div style="margin-top:28px;padding:16px 18px;background:#fff8ed;border:1px solid #f5c97a;
                        border-radius:10px;font-size:13px;color:#7a5a1a;line-height:1.6;">
              <strong>⚠ Didn't register?</strong><br/>
              This account was created using <strong>{email}</strong>.
              If you didn't sign up for myInvestorCircle, please reply to this email immediately
              so we can investigate and secure your address.
            </div>"""),
    }


def tpl_claim_submitted(data):
    creator_name  = data.get("creator_name", "Creator")
    profile_name  = data.get("profile_name", "")
    username      = data.get("username", "")
    return {
        "subject": "Profile claim submitted — pending review",
        "html": layout(f"""
            <h2 style="margin:0 0 12px;">Your claim is with the admin ⏳</h2>
            <p>Hi <strong>{creator_name}</strong>, your claim for <strong>@{username}</strong> has been submitted successfully.</p>
            <p><strong>Your request is now pending admin approval.</strong> Once approved, your historical recommendations and full ICI score will appear on your Track Record page.</p>
            <p>You will receive another email as soon as the admin approves your profile — usually within 24 hours.</p>
            <p style="margin:24px 0;">{btn('Visit myInvestorCircle →', APP_URL)}</p>
            <div style="margin-top:24px;padding:14px 16px;background:#f8f7fc;border:1px solid #e0ddf5;border-radius:10px;font-size:13px;color:#555;line-height:1.6;">
              <strong>Not expecting this email?</strong> If you didn't submit a claim on myInvestorCircle, please
              contact us at <a href="mailto:hello@myinvestorcircle.com" style="color:#6d5df5;">hello@myinvestorcircle.com</a> so we can revoke it.
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
            <h2 style="margin:0 0 12px;">New claim request 🔔</h2>
            <p><strong>{creator_name}</strong> (<a href="mailto:{claimer_email}">{claimer_email}</a>)
            has submitted a claim for the profile <strong>@{username}</strong> ({profile_name}).</p>
            <p style="margin:24px 0;">{btn('Review in Admin Panel →', admin_url)}</p>
            <p style="font-size:13px;color:#888;">Go to Admin → Creators → Pending approvals.</p>"""),
    }


def tpl_claim_approved(data):
    creator_name = data.get("creator_name", "Creator")
    username     = data.get("username", "")
    profile_url  = f"{APP_URL}/#/investor/{username}"
    return {
        "subject": f"Your profile @{username} is live! 🎉",
        "html": layout(f"""
            <h2 style="margin:0 0 12px;">You're live! 🎉</h2>
            <p>Hi <strong>{creator_name}</strong>,</p>
            <p>Your profile <strong>@{username}</strong> has been approved by the myInvestorCircle admin. Your profile is now public.</p>
            <p><strong>You can now see your historical recommendations and track record page.</strong> All your seeded recommendations and ICI score are live and visible to the community.</p>
            <p style="margin:24px 0;">{btn('View your Track Record →', profile_url)}</p>
            <p style="font-size:13px;color:#888;">
              Share your profile with your audience:<br/>
              <a href="{profile_url}">{profile_url}</a>
            </p>
            <p style="font-size:13px;color:#888;">Questions? Reach us at <a href="mailto:hello@myinvestorcircle.com">hello@myinvestorcircle.com</a></p>"""),
    }


def tpl_claim_rejected(data):
    creator_name = data.get("creator_name", "Creator")
    admin_note   = data.get("admin_note", "")
    return {
        "subject": "Profile claim update — action may be needed",
        "html": layout(f"""
            <h2 style="margin:0 0 12px;">Claim update</h2>
            <p>Hi <strong>{creator_name}</strong>,</p>
            <p>Your profile claim could not be approved at this time.
            {"<br/><strong>Admin note:</strong> " + admin_note if admin_note else ""}
            </p>
            <p>Please contact us at <a href="mailto:hello@myinvestorcircle.com">hello@myinvestorcircle.com</a>
            if you have questions or if you believe this is an error.</p>"""),
    }


TEMPLATES = {
    "signup_welcome":       tpl_signup_welcome,
    "invite":               tpl_invite,
    "welcome_referred":     tpl_welcome_referred,
    "referral_converted":   tpl_referral_converted,
    "connection_accepted":  tpl_connection_accepted,
    "claim_submitted":      tpl_claim_submitted,
    "claim_admin_notify":   tpl_claim_admin_notify,
    "claim_approved":       tpl_claim_approved,
    "claim_rejected":       tpl_claim_rejected,
}


# ── Vercel handler ───────────────────────────────────────────────────────────────

class handler(BaseHTTPRequestHandler):

    def do_POST(self):
        try:
            length = int(self.headers.get("Content-Length", 0))
            body   = json.loads(self.rfile.read(length)) if length else {}

            email_type = body.get("type", "")
            to_email   = body.get("to_email", "")

            if not to_email:
                self._respond(400, {"error": "to_email is required"})
                return

            if email_type not in TEMPLATES:
                self._respond(400, {"error": f"Unknown type: {email_type}"})
                return

            if not resend.api_key:
                self._respond(500, {"error": "RESEND_API_KEY not configured"})
                return

            tpl = TEMPLATES[email_type](body)
            resend.Emails.send({
                "from":    FROM_EMAIL,
                "to":      [to_email],
                "subject": tpl["subject"],
                "html":    tpl["html"],
            })

            self._respond(200, {"ok": True})

        except Exception as e:
            self._respond(500, {"error": str(e)})

    def _respond(self, status, data):
        self.send_response(status)
        self.send_header("Content-Type", "application/json")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(json.dumps(data).encode())

    def do_OPTIONS(self):
        self.send_response(204)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def log_message(self, *args):
        pass  # suppress Vercel logs spam
