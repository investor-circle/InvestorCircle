"""
Tests for the email-sending policy.

/api/email used to accept any of its branded templates, to any address, from
anyone on the internet — a phishing vector on a verified sending domain. These
pin the rules that closed that, and the honest limits of what they can check.

Dependency-free and self-running so it works wherever python3 does:
    python3 api/_lib/email_policy_test.py
"""

import sys
import os

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
from email_policy import POLICY, authorize, caller_name  # noqa: E402

INBOX = "hello@myinvestorcircle.com"
USER = {"uid": "u1", "email": "asha@example.com", "name": "Asha Rao"}
ADMINS = {"boss@example.com"}

failures = []


def check(name, fn):
    try:
        fn()
        print("  ok   %s" % name)
    except AssertionError as e:
        failures.append(name)
        print("  FAIL %s\n       %s" % (name, e))


def call(email_type, kind="user", token=None, body=None, admin_emails=ADMINS):
    return authorize(
        email_type,
        kind,
        USER if (token is None and kind == "user") else token,
        dict(body or {}),
        admin_emails=admin_emails,
        admin_inbox=INBOX,
    )


print("every template has a rule")


def _all_covered():
    # A template with no rule is refused outright, so a new one added to
    # email.py without a policy entry fails loudly rather than inheriting
    # someone else's permissions.
    to, err = call("some_new_template", body={"to_email": "x@y.z"})
    assert to is None and "Unknown email type" in err, err


def _registry_matches_email_py():
    """
    Every template email.py can render must have a rule, and vice versa.

    Without this, adding a template to TEMPLATES and forgetting POLICY makes it
    unreachable (safe but broken), and adding one to POLICY that does not exist
    is dead permission. Both are worth catching at the source rather than in
    production.
    """
    import re
    here = os.path.dirname(os.path.abspath(__file__))
    src = open(os.path.join(here, "..", "email.py"), encoding="utf8").read()
    block = re.search(r"TEMPLATES = \{(.*?)\}", src, re.S).group(1)
    rendered = set(re.findall(r'"([a-z_]+)":\s*tpl_', block))
    assert rendered == set(POLICY), (
        "TEMPLATES and POLICY disagree: only in TEMPLATES=%s, only in POLICY=%s"
        % (sorted(rendered - set(POLICY)), sorted(set(POLICY) - rendered))
    )


check("an unknown template is refused", _all_covered)
check("every renderable template has a policy rule", _registry_matches_email_py)


print("\nimpersonation")


def _forces_sender_name():
    to, body = call("contact_recommendation", body={"to_email": "bob@example.com", "from_name": "Support Team"})
    assert to == "bob@example.com", to
    assert body["from_name"] == "Asha Rao", body


def _forces_name_on_every_identity_template():
    for t, rule in POLICY.items():
        if not rule["identity"] or rule["caller"] != "user":
            continue
        lie = {f: "Support Team" for f in rule["identity"]}
        lie["to_email"] = "bob@example.com"
        to, body = call(t, body=lie)
        assert to, "%s refused: %s" % (t, body)
        for field, source in rule["identity"].items():
            expected = "Asha Rao" if source == "name" else USER["email"]
            assert body[field] == expected, "%s.%s = %r" % (t, field, body[field])


def _name_falls_back_without_using_the_body():
    # A token with no display name must NOT fall back to a caller-supplied
    # name — that is the hole this closes.
    assert caller_name({"email": "asha@example.com"}) == "asha"
    assert caller_name({}) == "A myInvestorCircle member"


check("a supplied from_name is replaced by the verified one", _forces_sender_name)
check("every identity field on every user template is forced", _forces_name_on_every_identity_template)
check("a nameless token falls back to the email, never the body", _name_falls_back_without_using_the_body)


print("\nrecipient control")


def _self_addressed_ignores_the_request():
    # Otherwise a signed-in user could send a welcome/claim email to anyone.
    for t in ("welcome_referred", "claim_submitted"):
        to, _ = call(t, body={"to_email": "victim@example.com"})
        assert to == USER["email"], "%s -> %s" % (t, to)


def _admin_notify_goes_to_the_team_inbox():
    to, body = call("claim_admin_notify", body={"to_email": "victim@example.com"})
    assert to == INBOX, to
    # And the claimer's email is the verified one, so a claim cannot be
    # attributed to somebody else.
    assert body["claimer_email"] == USER["email"], body


def _member_to_member_still_allowed():
    # This genuinely notifies another member; refusing it would break the
    # product. The sender's name is forced instead (see above).
    to, _ = call("contact_recommendation", body={"to_email": "bob@example.com"})
    assert to == "bob@example.com", to


def _missing_recipient_is_refused():
    to, err = call("contact_recommendation", body={})
    assert to is None and "to_email" in err, err


check("self-addressed templates ignore a supplied recipient", _self_addressed_ignores_the_request)
check("claim_admin_notify is forced to the team inbox", _admin_notify_goes_to_the_team_inbox)
check("a member may still notify another member", _member_to_member_still_allowed)
check("a template needing a recipient is refused without one", _missing_recipient_is_refused)


print("\ncaller class")


def _internal_only_template_refuses_a_client():
    # reco_comment, and now both connection notifications: the server raises
    # these from the row it just wrote, so a client asking for one would be
    # claiming a connection or a comment that may not exist.
    for t in ("reco_comment", "connection_request", "connection_accepted", "signup_welcome"):
        to, err = call(t, body={"to_email": "bob@example.com"})
        assert to is None and "server" in err, "%s: %s" % (t, err)
        to, _ = call(t, kind="internal", token=None, body={"to_email": "bob@example.com"})
        assert to == "bob@example.com", t


def _admin_template_refuses_a_normal_member():
    to, err = call("claim_approved", body={"to_email": "bob@example.com"})
    assert to is None and "Admin" in err, err


def _admin_template_allows_an_admin():
    to, _ = authorize(
        "claim_approved", "user", {"uid": "a", "email": "BOSS@example.com", "name": "Boss"},
        {"to_email": "bob@example.com"}, admin_emails=ADMINS, admin_inbox=INBOX,
    )
    assert to == "bob@example.com", to  # comparison is case-insensitive


def _admin_template_degrades_when_unconfigured():
    # ADMIN_EMAILS unset: allow a signed-in caller rather than break claim
    # review, and warn. Still far better than the anonymous access it replaces.
    warned = []
    to, _ = authorize(
        "claim_approved", "user", USER, {"to_email": "bob@example.com"},
        admin_emails=None, admin_inbox=INBOX, on_warning=warned.append,
    )
    assert to == "bob@example.com", to
    assert warned, "expected a warning when ADMIN_EMAILS is unset"


def _internal_caller_bypasses_the_admin_check():
    # The backend has no email to match against an admin list.
    to, _ = call("claim_approved", kind="internal", token=None, body={"to_email": "bob@example.com"})
    assert to == "bob@example.com", to


check("an internal-only template refuses a client", _internal_only_template_refuses_a_client)
check("an admin template refuses a normal member", _admin_template_refuses_a_normal_member)
check("an admin template allows an admin, case-insensitively", _admin_template_allows_an_admin)
check("an admin template degrades, with a warning, when unconfigured", _admin_template_degrades_when_unconfigured)
check("the backend is not held to the admin list", _internal_caller_bypasses_the_admin_check)


print("")
if failures:
    print("%d failed: %s" % (len(failures), ", ".join(failures)))
    sys.exit(1)
print("all email policy checks passed")
