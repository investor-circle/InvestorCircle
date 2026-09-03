"""
Who may send which email, to whom, and under whose name.

SECURITY (2026-09): /api/email used to accept any of its branded templates, to
any address, from anyone on the internet. On a verified sending domain that is
a phishing and spam vector — an attacker could send a genuine-looking
"X wants to connect with you" from hello@myinvestorcircle.com to any inbox.

Two kinds of caller are now recognised, and nothing else gets through:

  * a signed-in member, proved by a Firebase ID token (browser and app), or
  * this app's own backend, proved by a shared secret header. Only
    handlers/engagement.js uses that, because it is a Node-to-Python boundary
    it cannot cross in-process the way it now does for push.

On top of that, each template declares:

  caller     "user"      — any signed-in member may trigger it
             "internal"  — only the backend (never a browser)
             "admin"     — a member whose email is in ADMIN_EMAILS
  to         "self"      — forced to the caller's own verified email
             "admin"     — forced to the team inbox
             "any"       — a chosen recipient. A real product need: these
                           notify another member, or invite someone new.
  identity   fields overwritten with the caller's VERIFIED name/email, so a
             request can never make an email claim to be from someone else.
             This is what stays true even where "to" has to be "any".

What this deliberately does NOT claim to do: for a "to: any" template it
cannot check that the recipient is really a connection of the sender, because
this function has no database access (it is Python; the schema lives behind
the Node API). A signed-in member can therefore still email another member a
notification that is real in form. Impersonation and anonymous abuse — the
parts that made this dangerous — are closed.

This module is deliberately free of dependencies and of environment reads, so
the rules can be tested directly (see email_policy_test.py). Token
verification, which needs the Firebase Admin SDK, stays in api/email.py.
"""

INTERNAL_SECRET_HEADER = "x-internal-secret"

POLICY = {
    # Sent by /api/profile/signup on a genuine first signup, so both clients
    # get it — the browser used to send this itself and mobile never did.
    "signup_welcome":         {"caller": "internal", "to": "any",   "identity": {}},
    # Both halves of a referral are raised by the server when it records the
    # attribution (handlers/lookups.js process-referral), for the same reason
    # as the connection pair: the browser used to send them, so a signup that
    # came through the mobile app was silently never credited to anyone.
    "welcome_referred":       {"caller": "internal", "to": "any",   "identity": {}},
    # Self-addressed, so there is nobody to deceive: the body's own name is
    # fine, and forcing it would show a fallback (an email local part) to the
    # very person whose name it is.
    "claim_submitted":        {"caller": "user",     "to": "self",  "identity": {}},
    "claim_admin_notify":     {"caller": "user",     "to": "admin",
                               "identity": {"creator_name": "name", "claimer_email": "email"}},
    "referral_converted":     {"caller": "internal", "to": "any",   "identity": {}},
    # Raised by the server when it records the connection (handlers/
    # connections.js), so that both clients get them — the browser used to
    # send these itself and the mobile app never learned to.
    "connection_request":     {"caller": "internal", "to": "any",   "identity": {}},
    "connection_accepted":    {"caller": "internal", "to": "any",   "identity": {}},
    "contact_recommendation": {"caller": "user",     "to": "any",   "identity": {"from_name": "name"}},
    "invite":                 {"caller": "user",     "to": "any",   "identity": {"from_name": "name"}},
    # Raised by the server when it records a comment; a client asking for one
    # would be claiming that someone commented on an idea.
    "reco_comment":           {"caller": "internal", "to": "any",   "identity": {}},
    "claim_approved":         {"caller": "admin",    "to": "any",   "identity": {}},
    "claim_rejected":         {"caller": "admin",    "to": "any",   "identity": {}},
}


def caller_name(token):
    """
    A display name we can stand behind: from the verified token, never from
    the request. Falls back to the email's local part rather than to anything
    the caller supplied — a body value here would reopen impersonation.
    """
    name = (token.get("name") or "").strip()
    if name:
        return name
    email = (token.get("email") or "").strip()
    return email.split("@")[0] if email else "A myInvestorCircle member"


def authorize(email_type, kind, token, body, admin_emails, admin_inbox, on_warning=None):
    """
    Apply the policy for one request.

    @param email_type  the template being asked for
    @param kind        "user" or "internal", from verified credentials
    @param token       decoded Firebase token for kind == "user", else None
    @param body        the request body; identity fields are overwritten in place
    @param admin_emails  set of lower-cased admin addresses, or None if
                         ADMIN_EMAILS is not configured
    @param admin_inbox   where "to": "admin" templates are forced to go
    @param on_warning    optional callable for operational warnings

    @returns (to_email, body) on success, or (None, error_string).
    """
    rule = POLICY.get(email_type)
    if not rule:
        return None, "Unknown email type: '%s'" % email_type

    if rule["caller"] == "internal" and kind != "internal":
        return None, "This notification is sent by the server, not by a client"

    if rule["caller"] == "admin" and kind != "internal":
        if admin_emails is None:
            # Not configured. Allowing a signed-in caller is still far better
            # than the anonymous access this replaces, so degrade rather than
            # break claim review — but say so, loudly, in the logs.
            if on_warning:
                on_warning("ADMIN_EMAILS not set — admin-only template allowed for any signed-in caller")
        elif ((token or {}).get("email") or "").lower() not in admin_emails:
            return None, "Admin access required"

    if rule["to"] == "admin":
        to_email = admin_inbox
    elif rule["to"] == "self":
        # An internal caller has no "self"; it must name the recipient.
        to_email = (token or {}).get("email") if kind == "user" else body.get("to_email")
    else:
        to_email = body.get("to_email")
    if not to_email:
        return None, "to_email is required"

    # Overwrite the sender-identity fields with verified values.
    if kind == "user" and rule["identity"]:
        verified = {"name": caller_name(token or {}), "email": (token or {}).get("email") or ""}
        for field, source in rule["identity"].items():
            body[field] = verified[source]

    return to_email, body
