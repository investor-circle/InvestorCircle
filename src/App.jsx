import React, { useState, useMemo, useRef, useEffect } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import {
  Home,
  PieChart,
  Users,
  Lightbulb,
  Shield,
  Search,
  Bell,
  Settings,
  Menu,
  Lock,
  TrendingUp,
  X,
  Check,
  UserCog,
  Layers,
  ChevronRight,
  Sparkles,
  UserPlus,
  LogOut,
  Pencil,
  Database,
  Globe,
  Trophy,
  ExternalLink,
  Flame,
  Info,
  Bookmark
} from "lucide-react";
import { fetchLivePrices, isFinnhubConfigured } from "./services/priceService";
import { useAuth } from "./AuthContext";
import { track } from "./firebase";
import LoginPage from "./LoginPage";
import {
  getAllUsersAdmin as dbGetAllUsersAdmin
} from "./services/api/adminApi";
import {
  getClaimRequests as dbGetClaimRequests,
  getMyPendingClaimStatus as dbGetMyPendingClaimStatus,
  lookupClaimToken as dbLookupClaimToken
} from "./services/api/claimApi";
import {
  acceptConnection,
  getMyConnections,
  rejectConnection,
  sendConnectionRequest
} from "./services/api/connectionsApi";
import {
  getMyTrackedRecoIds as dbGetMyTrackedRecoIds,
  getReactionsBatch as dbGetReactionsBatch,
  trackReco as dbTrackReco,
  untrackReco as dbUntrackReco
} from "./services/api/engagementApi";
import {
  getMyTracking as dbGetMyTracking,
  getTrackingCounts as dbGetTrackingCounts
} from "./services/api/trackingApi";
import {
  getMyGroups,
  getCircleBySlug as dbGetCircleBySlug,
  requestJoinCircle as dbRequestJoinCircle
} from "./services/api/groupsApi";
import {
  getFeedConfigAndPrefs as dbGetFeedConfigAndPrefs,
  searchPeople as dbSearchPeople
} from "./services/api/lookupsApi";
import {
  removePushSubscription as dbRemovePushSubscription,
  savePushSubscription as dbSavePushSubscription,
  getMyNotifications,
  markAllNotifRead,
  markNotifRead
} from "./services/api/notificationsApi";
import {
  lookupUser as dbLookupUser,
  processReferral as dbProcessReferral
} from "./services/api/profileApi";
import {
  getNetworkEngagementFeed as dbGetNetworkEngagementFeed,
  getPublicFeed as dbGetPublicFeed,
  getMyMadeRecos,
  getMyReceivedRecos
} from "./services/api/recommendationsApi";
import {
  getSharingPrefs
} from "./services/api/sharingApi";
import { ProfileErrorBoundary } from "./components/common";
import { CONTACT_COLORS, DEFAULT_CLASSES, HOLDINGS } from "./constants/app";
// Admin screens are code-split into their own chunk: only admin-role users
// ever navigate here, so investors never pay for this bundle weight.
const adminModule = () => import("./features/admin/Admin");
const AdminAboutEditor = React.lazy(() => adminModule().then(m => ({ default: m.AdminAboutEditor })));
const AdminConfigs     = React.lazy(() => adminModule().then(m => ({ default: m.AdminConfigs })));
const AdminCreators    = React.lazy(() => adminModule().then(m => ({ default: m.AdminCreators })));
const AdminFeedConfig  = React.lazy(() => adminModule().then(m => ({ default: m.AdminFeedConfig })));
const AdminGroups      = React.lazy(() => adminModule().then(m => ({ default: m.AdminGroups })));
const AdminInstruments = React.lazy(() => adminModule().then(m => ({ default: m.AdminInstruments })));
const AdminSebi        = React.lazy(() => adminModule().then(m => ({ default: m.AdminSebi })));
const AdminSeedData    = React.lazy(() => adminModule().then(m => ({ default: m.AdminSeedData })));
const AdminUsers       = React.lazy(() => adminModule().then(m => ({ default: m.AdminUsers })));
import { ResetPasswordPage } from "./features/auth/ResetPasswordPage";
import { InviteModal, Network } from "./features/connections/Connections";
import { CirclePage } from "./features/groups/Groups";
import { HomeFeed, MarketIntelligencePage, SecurityIntelligencePage } from "./features/discovery/Discovery";
import { DiscoverModal, DiscoverPeoplePage, OnboardingGate } from "./features/onboarding/Onboarding";
import { AboutPage, ContactPage, PrivacyPolicyPage, SiteFooter } from "./features/marketing/Marketing";
import { NotificationPanel } from "./features/notifications/NotificationPanel";
import { PortfolioIntelligencePage } from "./features/portfolio/Portfolio";
import { ClaimProfilePage, ProfileEditModal, PublicProfilePage } from "./features/profile/Profile";
import { RecoPostPage, Recommendations } from "./features/recommendations/Recommendations";
import { Sharing } from "./features/sharing/Sharing";
import { useIsMobile } from "./hooks/index";
import { VAPID_PUBLIC_KEY, sendEmail, sendPush } from "./services/notify";
import { STYLES } from "./styles/globalStyles";
import { initialsOf } from "./utils/format";

/* ============================================================
   InvestorCircle — social space for investors.
   Palette: deep navy sidebar, indigo→violet→magenta gradient,
   light content; green/red only for gains/losses.

   Phase 5: App.jsx is the application shell — providers, top-level
   navigation/state orchestration, and page composition. Feature UI and
   business logic live under src/features/**; shared presentational atoms
   under src/components/common.jsx; formatting/calc helpers under
   src/utils/**; constants under src/constants/**; frontend API calls under
   src/services/api/** (still funnelled through src/db.js -> callApi()).
   ============================================================ */

/* ── URL routing for the major app sections (Phase 5 foundation) ──────────────
   Investor profile (#/investor/:username) and recommendation post
   (#/investor/:username/reco/:id) URLs are handled separately below via the
   pre-existing pageHash mechanism — deliberately left untouched.
   These maps give the main navigation sections real, shareable, refreshable
   URLs too, using the same hash-based scheme (see main.jsx for why). ────── */
const INVESTOR_PATH_TO_PAGE = {
  "/": "home",
  "/portfolio": "portfolio",
  "/market": "market_intel",
  "/security": "sec_intel",
  "/discover": "discover",
  "/connections": "network",
  "/recommendations": "recs",
  "/sharing": "sharing",
  "/about": "about",
  "/contact": "contact",
  "/privacy": "privacy",
  "/track-record": "trackrecord",
};
const INVESTOR_PAGE_TO_PATH = Object.fromEntries(
  Object.entries(INVESTOR_PATH_TO_PAGE).map(([path, page]) => [page, path])
);
const ADMIN_PATH_TO_PAGE = {
  "/admin/users": "users",
  "/admin/creators": "creators",
  "/admin/groups": "groups",
  "/admin/instruments": "instruments",
  "/admin/sebi": "sebi",
  "/admin/feed": "feed",
  "/admin/configs": "configs",
  "/admin/seed": "seed",
  "/admin/about": "about",
};
const ADMIN_PAGE_TO_PATH = Object.fromEntries(
  Object.entries(ADMIN_PATH_TO_PAGE).map(([path, page]) => [page, path])
);

export default function App() {
  const { user, role, setRole, userIsAdmin, logout, authLoading, profile, updateProfile, patchProfile } = useAuth();
  const ME = useMemo(() => {
    if (!user) return { id:"", name:"", firstName:"", lastName:"", username:"", initials:"", email:"" };
    const firstName = profile?.first_name || user.email?.split("@")[0] || "User";
    const lastName  = profile?.last_name  || "";
    const name = `${firstName} ${lastName}`.trim();
    return { id:user.uid, name, firstName, lastName, username:profile?.username||"", initials:initialsOf(name), email:user.email||"", avatarUrl:profile?.avatar_url||"" };
  }, [user?.uid, profile?.first_name, profile?.last_name, profile?.username, profile?.avatar_url]);

  // ── Page navigation ─────────────────────────────────────────────────────────
  const navigate = useNavigate();
  const routeLocation = useLocation();
  const [investorPage, setInvestorPage] = useState(() => {
    const p = window.location.hash.replace(/^#/, "").split("?")[0] || "/";
    return INVESTOR_PATH_TO_PAGE[p] || "home";
  });
  const [adminPage,    setAdminPage]    = useState(() => {
    const p = window.location.hash.replace(/^#/, "").split("?")[0] || "/";
    return ADMIN_PATH_TO_PAGE[p] || "users";
  });
  const [recoInit,     setRecoInit]     = useState(null);

  // View-mode for dual-role users. Starts false so admin users default to investor
  // view. Toggled explicitly via the "Switch role" buttons in the profile dropdown.
  const [viewAsAdmin, setViewAsAdmin] = useState(false);
  const isInv = !userIsAdmin || !viewAsAdmin;

  // Keep investorPage/adminPage in sync with the URL: covers browser
  // back/forward, a directly-opened/refreshed section URL, and links typed
  // or pasted in by hand. Profile/reco URLs (#/investor/...) are handled by
  // the separate pageHash mechanism and intentionally excluded here.
  // NOTE: this must run unconditionally on every render (before any of the
  // early `if (...) return` guards below) — React requires hooks to be
  // called in the same order on every render, and authLoading/claim/reset/
  // !user are all guards that change across the component's lifetime.
  useEffect(() => {
    const p = routeLocation.pathname;
    if (p.startsWith('/investor/')) return;
    if (isInv && INVESTOR_PATH_TO_PAGE[p] && INVESTOR_PATH_TO_PAGE[p] !== investorPage) {
      setInvestorPage(INVESTOR_PATH_TO_PAGE[p]);
    } else if (!isInv && ADMIN_PATH_TO_PAGE[p] && ADMIN_PATH_TO_PAGE[p] !== adminPage) {
      setAdminPage(ADMIN_PATH_TO_PAGE[p]);
    }
  }, [routeLocation.pathname, isInv]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── App-level state ─────────────────────────────────────────────────────────
  const [connections,   setConnections]   = useState([]); // all connections (all statuses)
  const [groups,        setGroups]        = useState([]); // shared groups from ic_groups
  const [recsReceived,  setRecsReceived]  = useState([]); // from recommendation_deliveries
  const [recsMade,      setRecsMade]      = useState([]); // from ic_recommendations
  const [sharing,       setSharing]       = useState({});
  const [notifications, setNotifications] = useState([]);
  const [tracked,       setTracked]       = useState(new Set()); // Set of reco IDs the user has tracked
  const [trackedCreatorIds, setTrackedCreatorIds] = useState(new Set()); // Set of investor/creator IDs the user tracks (Pulse "What You Missed" relevance signal)
  // Track-an-investor relationship (distinct from the recommendation-tracking
  // Set above): lightweight counts only — the Network page's Tracking me /
  // I'm tracking tabs fetch their own paginated lists lazily, never the full
  // list, so a creator with thousands of trackers doesn't load them all here.
  const [trackingCounts,  setTrackingCounts]  = useState({ trackersCount: 0, trackingCount: 0 });
  const [networkInitTab,  setNetworkInitTab]  = useState(null); // one-shot: which Network tab to open next (e.g. from a notification)
  // Feed configuration
  const [feedConfigOptions,       setFeedConfigOptions]       = useState([]); // admin-defined options
  const [userFeedPrefs,           setUserFeedPrefs]           = useState({}); // {key: boolean} user overrides
  const [effectiveFeedConfig,     setEffectiveFeedConfig]     = useState({}); // merged effective config
  const [networkEngagementRecos,  setNetworkEngagementRecos]  = useState([]); // extended feed recos
  const [publicFeedRecos,         setPublicFeedRecos]         = useState([]); // public recommendations from all users
  // True until the home-feed data load has been attempted at least once — lets
  // HomeFeed tell "still loading" apart from "genuinely no recommendations yet".
  const [feedLoading, setFeedLoading] = useState(true);
  // Global search — shared across all pages via top nav bar
  const [globalSearch, setGlobalSearch] = useState('');
  const [notifOpen,     setNotifOpen]     = useState(false);
  const [profileOpen,   setProfileOpen]   = useState(false);
  const [navOpen,         setNavOpen]         = useState(false);
  const [profileEditOpen, setProfileEditOpen] = useState(false); // auto-opens edit modal on Track Record page
  const isMobile = useIsMobile();
  const [connectConfirm, setConnectConfirm] = useState(null); // { name, username } after auto-connect

  // ── Hash routing — for public profile URLs (#/investor/username) ─────────────
  const [pageHash, setPageHash] = useState(window.location.hash);
  useEffect(() => {
    const h = () => setPageHash(window.location.hash);
    window.addEventListener("hashchange", h);
    return () => window.removeEventListener("hashchange", h);
  }, []);

  // Circle URLs (#/circle/...) still get their history entry replaced with
  // the clean base URL once loaded — unlike investor profiles below, a
  // Circle's shareable link is the dedicated Circle page's own Share
  // button (copy link / WhatsApp), not the address bar, so there's no
  // product reason to keep it visible there. Stripping it also fixes a
  // real bug: without stripping, window.location.hash stays set to this
  // exact value after Close, so re-opening the SAME circle later sets an
  // identical hash — which the browser does not fire a hashchange event
  // for — leaving the page stuck until a full reload. Stripping it here
  // means the next "Open" always assigns a hash that differs from the
  // (now-empty) current one. We keep pageHash in React state so the page
  // still renders correctly regardless.
  //
  // Investor profile URLs (#/investor/...) are DELIBERATELY left in the
  // address bar — the whole point of a public profile is that its link is
  // directly shareable, so the browser URL must show the real
  // #/investor/username (or .../reco/id) link no matter how the user got
  // there (search, Discovery, a Circle's member list, a notification,
  // etc.). To avoid reintroducing the identical-hash-is-a-no-op bug this
  // pattern has elsewhere, every exit from a profile page clears
  // window.location.hash directly (not just React state) — see the
  // onBack/onRequestConnect handlers below — so the address bar and
  // pageHash never drift out of sync.
  useEffect(() => {
    if (pageHash.startsWith('#/circle/')) {
      window.history.replaceState(
        { _micProfileHash: pageHash },
        '',
        window.location.pathname + window.location.search
      );
    }
  }, [pageHash]);

  // AUTO-REDIRECT: Redirect users in ADMIN VIEW away from stale profile URLs.
  //
  // Investor-view users (including dual-role users defaulting to investor view)
  // must NEVER be redirected — reco share links and profile links must work for them
  // exactly as they do for regular investors.
  //
  // Only admin-view users are redirected away from profile hashes that came from
  // an external source (e.g., browser session-restore, autocomplete), since those
  // are genuinely stale and they should land on the admin panel instead.
  const _profileCameFromThisSite = (() => {
    try { return document.referrer.includes(window.location.hostname); }
    catch { return false; }
  })();

  useEffect(() => {
    if (authLoading || !user) return;               // wait for auth; only logged-in
    if (!pageHash.startsWith('#/investor/')) return;
    if (_profileCameFromThisSite) return;           // intentional same-site nav — allow
    if (!userIsAdmin || !viewAsAdmin) return;        // investor-view users — always allow
    window.location.hash = '';                      // admin-view + stale URL → go to admin panel (also keeps the address bar in sync with pageHash — see the profile-URL note above)
  }, [authLoading, user?.uid, userIsAdmin, viewAsAdmin]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Post-login/signup: auto-send connection request if user came from a public profile ─
  useEffect(() => {
    if (!user) return;
    const pending = sessionStorage.getItem("pending_connect_username");
    if (!pending) return;
    sessionStorage.removeItem("pending_connect_username");
    dbLookupUser('username', pending)
      .then(row => {
        if (!row || row.id === user.uid) return;
        const targetId = row.id;
        const targetName = row.first_name
          ? `${row.first_name} ${row.last_name || ""}`.trim()
          : row.full_name || `@${pending}`;
        return sendConnectionRequest(user.uid, targetId).then(() => {
          setConnectConfirm({ name: targetName, username: pending });
          setTimeout(() => setConnectConfirm(null), 10000); // auto-dismiss after 10s
        });
      })
      .catch(console.warn);
  }, [user?.uid]);

  // ── Post-login/signup: auto-resume a Circle join request if the user came
  // from a public Circle page and had to sign in first (mirrors the
  // pending_connect_username pattern above) ──
  useEffect(() => {
    if (!user) return;
    const pendingSlug = sessionStorage.getItem("pending_join_circle_slug");
    if (!pendingSlug) return;
    sessionStorage.removeItem("pending_join_circle_slug");
    const pendingInvite = sessionStorage.getItem("pending_join_circle_invite");
    sessionStorage.removeItem("pending_join_circle_invite");
    dbGetCircleBySlug(pendingSlug)
      .then(circle => {
        if (!circle || circle.is_owner || circle.is_member) return;
        return dbRequestJoinCircle(circle.id, pendingInvite || null).then(() => {
          window.location.hash = `#/circle/${pendingSlug}`;
        });
      })
      .catch(console.warn);
  }, [user?.uid]);
  const [holdings,      setHoldings]      = useState(HOLDINGS);

  // PRIVACY CRITICAL: clear holdings whenever the authenticated user changes.
  // Without this, if User A's holdings are in state and User B signs in
  // (same browser tab), User B would see User A's portfolio data.
  useEffect(() => {
    setHoldings([]);
  }, [user?.uid]); // runs on every user change, including logout → login switches

  // ── Track previous UID so we skip the initial mount in the security reset ──
  const prevUidRef = useRef(undefined);

  // SECURITY: when the authenticated user actually CHANGES (different UID, or logout),
  // clear all user-specific state to prevent data leaking between accounts in the same tab.
  // We skip the initial mount (prevUid === undefined) because state is already empty then
  // and we don't want to stomp on data the data-load effect is about to populate.
  useEffect(() => {
    const currentUid = user?.uid ?? null;
    const prevUid    = prevUidRef.current;
    prevUidRef.current = currentUid;

    // Skip initial mount — React always fires effects on first render; we only want
    // to reset when the user identity genuinely switches mid-session.
    if (prevUid === undefined) return;
    // Also skip redundant fires with the same UID (React batching edge cases)
    if (prevUid === currentUid) return;

    // User changed — wipe all user-specific state.
    // NOTE: contacts is a useMemo derived from connections, so clearing
    // connections automatically clears contacts — no setContacts exists.
    setConnections([]);
    setGroups([]);
    setRecsReceived([]);
    setRecsMade([]);
    setNotifications([]);
    setSharing({});
    setUsers([]);
    setPublicFeedRecos([]);
    setNetworkEngagementRecos([]);
    setTracked(new Set());
    setTrackedCreatorIds(new Set());
    setClaimRequests([]);
    setHasPendingClaim(false);
    setSecurityTicker(null);
    setFeedLoading(true);      // next user's data hasn't loaded yet either
    setInvestorPage('home');   // new user always starts at home
    setAdminPage('users');

    if (!user) {
      // Logout: also clear the profile hash so the next page-load starts clean.
      // We read the current hash directly (not from stale closure) to be reliable.
      const currentHash = window.location.hash || pageHash;
      if (currentHash.startsWith('#/investor/')) {
        setPageHash('');
        window.history.replaceState({}, '', window.location.pathname + window.location.search);
      }
      sessionStorage.removeItem('pending_connect_username');
      sessionStorage.removeItem('pending_join_circle_slug');
      sessionStorage.removeItem('pending_join_circle_invite');
      localStorage.removeItem('mic_claim_token');
    }
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps
  const [assetClasses,  setAssetClasses]  = useState(DEFAULT_CLASSES);
  const [users,         setUsers]         = useState([]);
  const [configs,       setConfigs]       = useState({
    enableRecommendations:true, allowCryptoAccounts:true, publicFeed:true,
    requireAccountApproval:true, allowAmountSharing:true, defaultDisclosure:"names",
    maxGroupMembers:8, groupCreationPolicy:"all",
  });
  const [providers, setProviders] = useState(["Fidelity","Vanguard","Robinhood","Coinbase","Schwab","E*TRADE"]);
  const [priceRefresh, setPriceRefresh] = useState({ busy:false, lastAt:null, errors:[] });
  const [pendingInvites, setPendingInvites] = useState([]);

  // Derived: confirmed contacts only (accepted connections, shaped for UI backward compat)
  const contacts = useMemo(() =>
    connections
      .filter(c => c.status === "accepted")
      .map((c, i) => ({
        id:           c.user_id,
        connectionId: c.connection_id,
        name:         c.name,
        email:        c.email,
        initials:     initialsOf(c.name),
        color:        CONTACT_COLORS[i % CONTACT_COLORS.length],
        title:        "InvestorCircle member",
        shared:       { level:"none", holdings:[] },
      })),
    [connections]
  );
  const unreadCount = useMemo(() => notifications.filter(n => !n.is_read).length, [notifications]);

  // Clear global search when navigating to a different page
  useEffect(() => { setGlobalSearch(''); }, [investorPage, adminPage]);

  // Profile dropdown: close on click outside using native mousedown
  const profileRef = useRef(null);
  useEffect(() => {
    if (!profileOpen) return;
    const handler = (e) => {
      if (profileRef.current && !profileRef.current.contains(e.target)) {
        setProfileOpen(false);
      }
    };
    // Use mousedown so it fires before React's onClick
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [profileOpen]);

  // Close profile dropdown on outside click
  useEffect(() => {
    if (!profileOpen) return;
    const close = (e) => {
      if (!e.target.closest('.avatar-pill') && !e.target.closest('[data-profile-dropdown]')) {
        setProfileOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [profileOpen]);

  // Toggle tracking (bookmark) for a recommendation
  const toggleTrack = async (recoId) => {
    if (tracked.has(recoId)) {
      setTracked(s => { const n = new Set(s); n.delete(recoId); return n; });
      if (user?.uid) dbUntrackReco(recoId).catch(console.warn);
    } else {
      setTracked(s => new Set([...s, recoId]));
      if (user?.uid) dbTrackReco(recoId).catch(console.warn);
    }
  };

  const refreshPrices = async () => {
    if (!isFinnhubConfigured) return;                          // boolean, not a function
    setPriceRefresh({ busy:true, lastAt:null, errors:[] });
    try {
      const { results, errors } = await fetchLivePrices(holdings); // takes full holdings array
      setHoldings(hs => hs.map(h =>
        results[h.sym]?.price != null ? {...h, price:results[h.sym].price} : h
      ));
      setPriceRefresh({ busy:false, lastAt:new Date(), errors });
    } catch(e) {
      setPriceRefresh({ busy:false, lastAt:null, errors:[e.message] });
    }
  };

  // ── Capture referral + claim tokens from URL on first load ──────────────────
  // claim_token and oobCode are both read synchronously in useState initialisers
  // below so their pages render on the first paint without a flash.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const ref = params.get('ref');
    // claim_token and oobCode already read synchronously — just clean the URL
    if (ref) localStorage.setItem('mic_ref', ref.toLowerCase().trim());
    if (ref || params.get('claim_token') || params.get('oobCode')) {
      const clean = window.location.pathname + window.location.hash;
      window.history.replaceState({}, '', clean);
    }
  }, []);

  // ── Password reset: oobCode from ?mode=resetPassword&oobCode=... ─────────────
  // Read synchronously so ResetPasswordPage renders on the first paint.
  const [resetOobCode, setResetOobCode] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const mode   = params.get('mode');
    const code   = params.get('oobCode');
    return (mode === 'resetPassword' && code) ? code : null;
  });

  // ── Claim state: token + profile for unclaimed-creator claim flow ─────────────
  // Reads URL params synchronously so the token is available on first render —
  // avoids the race where the useEffect fires after the initial render shows LoginPage.
  const [claimToken, setClaimToken] = useState(() => {
    const params = new URLSearchParams(window.location.search);
    const ct = params.get('claim_token');
    if (ct) { localStorage.setItem('mic_claim_token', ct); return ct; }
    return localStorage.getItem('mic_claim_token') || null;
  });
  const [claimProfile,  setClaimProfile]  = useState(null);
  const [claimRequests, setClaimRequests] = useState([]);
  const [hasPendingClaim, setHasPendingClaim] = useState(false); // creator claimed but not yet approved

  // Resolve claimToken → profile from DB.
  // IMPORTANT: if a user is already logged in, wipe any leftover token immediately.
  // Without this, a stale mic_claim_token in localStorage causes ClaimProfilePage
  // to flash for ~300ms on every page load while Firebase auth is still resolving.
  useEffect(() => {
    if (user) {
      // Any logged-in user: clear stale claim token from localStorage right away.
      if (claimToken) {
        localStorage.removeItem('mic_claim_token');
        setClaimToken(null);
        setClaimProfile(null);
      }
      return;
    }
    if (!claimToken) return;
    dbLookupClaimToken(claimToken)
      .then(profile => {
        if (profile) setClaimProfile(profile);
        else { localStorage.removeItem('mic_claim_token'); setClaimToken(null); }
      })
      .catch(() => {});
  }, [claimToken, user?.uid]);

  // ── Admin: load pending claim requests ───────────────────────────────────────
  const loadClaimRequests = async () => {
    try {
      const rows = await dbGetClaimRequests();
      setClaimRequests(rows);
    } catch(e) { console.warn('loadClaimRequests:', e?.message); }
  };

  // ── Process referral after a new user signs up ───────────────────────────────
  // Called once from the login effect when we detect a stored referral code.
  const processReferral = async (newUserId) => {
    const refUsername = localStorage.getItem('mic_ref');
    if (!refUsername) return;
    try {
      const result = await dbProcessReferral(refUsername);
      if (!result.referred) { localStorage.removeItem('mic_ref'); return; }

      const referrer = { full_name: result.referrerName, username: result.referrerUsername, email: result.referrerEmail };

      // Send referral emails (fire and forget)
      const newUserEmail = user?.email || '';
      const newUserName  = user?.displayName || 'New member';
      sendEmail('welcome_referred', {
        to_email:          newUserEmail,
        referrer_name:     referrer.full_name,
        referrer_username: referrer.username || '',
      });
      if (referrer.email) {
        sendEmail('referral_converted', {
          to_email:      referrer.email,
          new_user_name: newUserName,
        });
      }

      // Refresh connection list so the new user immediately sees the referrer in their circle
      const conns = await getMyConnections(newUserId);
      setConnections(conns);

      localStorage.removeItem('mic_ref');
    } catch(e) { console.warn('processReferral:', e?.message||e); }
  };

  // ── Push notification: register SW + manage subscription ───────────────────
  // State is user-specific. We track opt-in/opt-out per UID in localStorage.
  // Browser Notification.permission is shared for the origin — we deliberately
  // do NOT use it as the "on" signal, because it reflects whoever previously
  // granted it, not whether THIS user opted in.
  const [pushPermission, setPushPermission] = useState('default');
  // One-time proactive opt-in toast — shown once per session after login
  // if the user hasn't enabled or dismissed push notifications yet.
  const [showPushToast, setShowPushToast] = useState(false);

  const getPushState = (uid) => {
    if (typeof Notification === 'undefined' || !uid) return 'default';
    if (localStorage.getItem(`mic_push_off_${uid}`) === '1') return 'disabled';
    if (localStorage.getItem(`mic_push_on_${uid}`)  === '1' &&
        Notification.permission === 'granted') return 'granted';
    return 'default'; // this user hasn't opted in yet
  };

  // Re-evaluate permission state whenever the logged-in user changes
  useEffect(() => {
    const state = getPushState(user?.uid);
    setPushPermission(state);
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Proactive push opt-in toast — show once per session, 6 s after login,
  // only if: VAPID is configured, browser supports notifications, and the
  // browser-level permission hasn't already been granted or denied.
  // We check Notification.permission directly (the browser's source of truth)
  // rather than getPushState, because getPushState requires a localStorage key
  // that may be absent after a cache clear or on a new device.
  useEffect(() => {
    if (!user?.uid || !VAPID_PUBLIC_KEY || !('Notification' in window)) return;
    if (Notification.permission !== 'default') return; // already granted or denied
    if (sessionStorage.getItem(`mic_push_prompted_${user.uid}`) === '1') return; // shown this session
    const t = setTimeout(() => {
      if (Notification.permission !== 'default') return; // re-check at fire time
      setShowPushToast(true);
    }, 6000);
    return () => clearTimeout(t);
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  // Handle deep-link navigation messages sent by the service worker when a
  // push notification is clicked and the app tab is already open.
  // sw.js sends: { type: 'MIC_NAVIGATE', url: 'https://myinvestorcircle.com/#/investor/...' }
  useEffect(() => {
    if (!('serviceWorker' in navigator)) return;
    const onMessage = (event) => {
      if (event.data?.type !== 'MIC_NAVIGATE') return;
      try {
        const url = new URL(event.data.url);
        if (url.hash) window.location.hash = url.hash;  // e.g. #/investor/ankur/reco/42
      } catch { /* malformed URL — ignore */ }
    };
    navigator.serviceWorker.addEventListener('message', onMessage);
    return () => navigator.serviceWorker.removeEventListener('message', onMessage);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Register service worker and re-subscribe if this user has previously opted in
  useEffect(() => {
    if (!('serviceWorker' in navigator) || !VAPID_PUBLIC_KEY || !user?.uid) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/' })
      .then(reg => {
        // Only subscribe if THIS user explicitly opted in (mic_push_on_{uid} = '1')
        if (getPushState(user.uid) === 'granted') {
          subscribePush(reg).catch(() => {});
        }
      })
      .catch(e => console.warn('[SW] registration failed:', e?.message));
  }, [user?.uid]); // eslint-disable-line react-hooks/exhaustive-deps

  /** Convert VAPID public key to Uint8Array for PushManager */
  const urlBase64ToUint8Array = (base64String) => {
    const padding  = '='.repeat((4 - base64String.length % 4) % 4);
    const base64   = (base64String + padding).replace(/-/g, '+').replace(/_/g, '/');
    const raw      = window.atob(base64);
    return Uint8Array.from([...raw].map(c => c.charCodeAt(0)));
  };

  /** Subscribe to push and persist the subscription to Neon. */
  const subscribePush = async (reg) => {
    if (!VAPID_PUBLIC_KEY || !user?.uid) return;
    try {
      const existing = await reg.pushManager.getSubscription();
      const sub = existing || await reg.pushManager.subscribe({
        userVisibleOnly:      true,
        applicationServerKey: urlBase64ToUint8Array(VAPID_PUBLIC_KEY),
      });
      const { endpoint, keys: { p256dh, auth } } = sub.toJSON();
      await dbSavePushSubscription(endpoint, p256dh, auth);
      console.log('[push] subscription saved');
    } catch (e) {
      console.warn('[push] subscribe failed:', e?.message);
    }
  };

  /** Request permission — only call this on explicit user gesture. */
  const requestPushPermission = async () => {
    if (!('Notification' in window) || !user?.uid) return;
    setShowPushToast(false); // dismiss toast regardless of outcome
    if (user?.uid) sessionStorage.setItem(`mic_push_prompted_${user.uid}`, '1');
    const result = await Notification.requestPermission();
    if (result === 'granted') {
      track('push_enabled');
      // Record that THIS user explicitly opted in
      localStorage.setItem(`mic_push_on_${user.uid}`,  '1');
      localStorage.removeItem(`mic_push_off_${user.uid}`);
      setPushPermission('granted');
      const reg = await navigator.serviceWorker.ready;
      await subscribePush(reg);
    } else {
      setPushPermission(result); // 'denied'
    }
  };

  /** Unsubscribe and remove subscription from DB. */
  const unsubscribePush = () => {
    if (!user?.uid) return;
    // Update UI immediately
    localStorage.setItem(`mic_push_off_${user.uid}`, '1');
    localStorage.removeItem(`mic_push_on_${user.uid}`);
    setPushPermission('disabled');
    // Async cleanup — delete from DB and browser
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.ready
        .then(async reg => {
          const sub = await reg.pushManager.getSubscription();
          if (sub) {
            const { endpoint } = sub.toJSON();
            await sub.unsubscribe();
            if (user?.uid) {
              dbRemovePushSubscription(endpoint).catch(() => {});
            }
          }
        })
        .catch(e => console.warn('[push] unsubscribe cleanup error:', e?.message));
    }
  };
  const handlePeopleConnect = async (targetId) => {
    if (!user) return;
    try {
      await sendConnectionRequest(user.uid, targetId);
      track('connection_sent');
      dbLookupUser('id', targetId)
        .then(row => {
          if (row?.email) sendEmail('connection_request', {
            to_email:      row.email,
            from_name:     ME?.name || user.displayName || 'Someone',
            from_username: ME?.username || '',
          });
          sendPush(targetId, {
            title: '🤝 New connection request',
            body:  `${ME?.name || 'Someone'} wants to connect with you`,
            url:   ME?.username
              ? `https://myinvestorcircle.com/#/investor/${ME.username}`
              : 'https://myinvestorcircle.com',
            tag:   'connection_request',
          });
        }).catch(() => {});
      const conns = await getMyConnections(user.uid);
      setConnections(conns);
    } catch(e) { console.warn('handlePeopleConnect:', e?.message||e); }
  };

  // ── Invite modal state ────────────────────────────────────────────────────────
  const [showInvite, setShowInvite] = useState(false);
  const [showDiscover, setShowDiscover] = useState(false);
  const [showMobileSearch, setShowMobileSearch] = useState(false);
  const [searchPeople,     setSearchPeople]     = useState([]);

  // Debounced people search — drives both topbar dropdown and mobile search overlay
  useEffect(() => {
    const q = globalSearch.trim();
    if (!q || q.length < 2 || !ME?.id) { setSearchPeople([]); return; }
    const timer = setTimeout(async () => {
      try {
        const rows = await dbSearchPeople(q);
        setSearchPeople(rows);
      } catch(e) { console.warn('topbar people search:', e?.message||e); }
    }, 280);
    return () => clearTimeout(timer);
  }, [globalSearch, ME?.id]);
  const referralCount = useMemo(()=>
    connections.filter(c=>c.referred_by_me || c.source==='referral').length
  ,[connections]);

  // ── Load all shared data from Neon on login ─────────────────────────────────
  useEffect(() => {
    if (!user) return;
    const load = async () => {
      // Kick off every fetch that doesn't depend on another fetch's result
      // immediately, in parallel with the batch below, instead of waiting
      // for that batch to resolve first — none of these three need conns/
      // recv/etc., so serializing them after the first batch was just
      // adding two avoidable round-trips to the home feed's load time.
      const trackedPromise    = dbGetMyTrackedRecoIds();
      const feedCfgPromise    = dbGetFeedConfigAndPrefs();
      const publicFeedPromise = dbGetPublicFeed();
      try {
        const [conns, grps, recv, made, notifs, shr] = await Promise.all([
          getMyConnections(user.uid),
          getMyGroups(user.uid),
          getMyReceivedRecos(user.uid),
          getMyMadeRecos(user.uid),
          getMyNotifications(user.uid),
          getSharingPrefs(user.uid),
        ]);
        setConnections(conns);
        setGroups(grps);
        setRecsReceived(recv);
        setRecsMade(made);
        setNotifications(notifs);
        setSharing(shr);
        // Hydrate reactions from recommendation_reactions — fire-and-forget, never breaks main load
        if (recv.length > 0) {
          const ids = recv.map(r => String(r.id));
          dbGetReactionsBatch(ids)
            .then(rxMap => {
              if (!Object.keys(rxMap).length) return;
              setRecsReceived(rs => rs.map(r => rxMap[String(r.id)] ? {...r, reaction: rxMap[String(r.id)]} : r));
            }).catch(()=>{});
        }
        // Process any stored referral code (fires only when localStorage has one)
        processReferral(user.uid);
        // Load pending creator claim requests — admin-only server-side; skip
        // the call entirely for non-admins instead of eating an expected 403.
        if (userIsAdmin) loadClaimRequests();
        // Check if this user is a creator awaiting admin approval for their claimed profile
        dbGetMyPendingClaimStatus().then(setHasPendingClaim).catch(()=>{});
        // Network tab badge counts — cheap indexed COUNTs, never the full tracker/tracking lists
        dbGetTrackingCounts().then(setTrackingCounts).catch(()=>{});
        // Creators this user tracks — small, indexed, unpaginated list (same
        // "legacy: small use sites only" call TrackingMeSection-style pages
        // use). Nothing downstream depends on it, so it's fired and forgotten
        // here rather than added to the awaited batch below; Pulse's "What
        // You Missed" widget uses it as a relevance signal once it resolves.
        dbGetMyTracking().then(rows => setTrackedCreatorIds(new Set((rows||[]).map(p=>p.id)))).catch(()=>{});
        // Both were already kicked off above, in parallel with the batch
        // that just resolved — just await them now.
        const [trackedResult, feedCfgResult] = await Promise.allSettled([
          trackedPromise,
          feedCfgPromise,
        ]);
        if (trackedResult.status === 'fulfilled') setTracked(new Set(trackedResult.value));

        let effective = {};
        if (feedCfgResult.status === 'fulfilled') {
          const { options: opts, prefs } = feedCfgResult.value;
          setFeedConfigOptions(opts);
          const userPrefsMap = Object.fromEntries(prefs.map(p=>[p.config_key, p.enabled]));
          setUserFeedPrefs(userPrefsMap);
          opts.forEach(o => {
            if (!o.admin_enabled)  { effective[o.key] = false; return; }
            if (o.always_on)       { effective[o.key] = true;  return; }
            effective[o.key] = (o.config_key in userPrefsMap) ? userPrefsMap[o.config_key]
                             : (o.key in userPrefsMap)         ? userPrefsMap[o.key]
                             : o.default_on;
          });
          setEffectiveFeedConfig(effective);
        } else {
          // table may not exist pre-migration — use safe defaults
          effective = { src_direct:true, src_group:true, src_network_engagement:true, src_public:true,
                        rank_engagement:true, rank_price_movement:true, rank_untracked_first:true };
          setEffectiveFeedConfig(effective);
        }

        // Load network-engaged recos and public recos in parallel — the public
        // feed doesn't depend on the network-engagement fetch (only on the feed
        // config resolved above), so these two independent round-trips no
        // longer need to be serialized either.
        const networkEngagementLoad = (async () => {
          // Load network-engaged recos (recos liked/commented by connections not in my direct feed)
          if (!effective.src_network_engagement) return;
          try {
            const activeConns = conns.filter(c=>c.status==='active').map(c=>c.id);
            if (activeConns.length > 0) {
              const engRecos = await dbGetNetworkEngagementFeed(activeConns);
              const engMapped = engRecos.map(r=>({
                ...r, assetName:r.asset_name, priceAt:r.reco_price, price:r.current_price,
                byName:r.by_name, from:r.from_id, feedSource:'network_engagement',
                reaction:'none', hidden:false, invested:false, deliveryId:null,
                commentCount: r.comment_count || 0,
                targetPrice: r.target_price ? Number(r.target_price) : null,
                stopLoss:    r.stop_loss    ? Number(r.stop_loss)    : null,
                recType:     r.recommendation_type || 'Buy',
              }));
              setNetworkEngagementRecos(engMapped);
              // Hydrate existing reactions separately — safe if table doesn't exist yet
              if (engMapped.length > 0) {
                const ids = engMapped.map(r=>String(r.id));
                dbGetReactionsBatch(ids)
                  .then(rxMap => {
                    if (!Object.keys(rxMap).length) return;
                    setNetworkEngagementRecos(rs=>rs.map(x=>rxMap[String(x.id)]?{...x,reaction:rxMap[String(x.id)]}:x));
                  }).catch(()=>{});
              }
            }
          } catch(_) {}
        })();

        const publicFeedLoad = (async () => {
          // Load public recommendations — visible to all users when is_public = true.
          // Excludes the user's own recos and ones already in their direct feed.
          // (publicFeedPromise was already kicked off above, in parallel with
          // the first batch, so this is usually just awaiting an
          // already-in-flight or already-resolved request.)
          try {
            const pubRows = await publicFeedPromise;
            const pubMapped = pubRows.map(r => ({
              ...r,
              assetName:    r.asset_name,
              priceAt:      r.reco_price,
              price:        r.current_price,
              targetPrice:  r.target_price,
              stopLoss:     r.stop_loss,
              byName:       r.by_name,
              from:         r.from_id,
              feedSource:   'public',
              reaction:     'none',
              hidden:       false,
              invested:     false,
              deliveryId:   null,
              isPublic:     true,
              likes:        r.likes_count  || 0,
              commentCount: r.comment_count || 0,
              // Recent-window engagement for Pulse's "Trending on MIC"
              // ranking. Left undefined (not 0) when the API predates these
              // columns, so src/utils/trending.js can tell "no recent
              // activity" apart from "no velocity data" and degrade
              // honestly instead of claiming a recency it can't support.
              recentLikes:    r.recent_likes,
              recentComments: r.recent_comments,
              lastActivityAt: r.last_activity_at,
            }));
            setPublicFeedRecos(pubMapped);
            // Hydrate existing reactions separately — safe if recommendation_reactions doesn't exist yet
            if (pubMapped.length > 0) {
              const ids = pubMapped.map(r=>String(r.id));
              dbGetReactionsBatch(ids)
                .then(rxMap => {
                  if (!Object.keys(rxMap).length) return;
                  setPublicFeedRecos(rs=>rs.map(x=>rxMap[String(x.id)]?{...x,reaction:rxMap[String(x.id)]}:x));
                }).catch(()=>{});
            }
          } catch(e) { console.warn('Public feed load failed:', e?.message||e); }
        })();

        await Promise.allSettled([networkEngagementLoad, publicFeedLoad]);
      } catch(e) { console.warn("Data load failed:", e.message); }
      finally { setFeedLoading(false); }
      // Load registered users for admin panel (admin only — non-admins skip this
      // call entirely rather than receiving a 403 from the server).
      if (!userIsAdmin) return;
      try {
        const profiles = await dbGetAllUsersAdmin();
        if (profiles.length) setUsers(profiles.map(p => ({
          id: p.id, name: p.full_name, email: p.email,
          username:     p.username     || null,
          isUnclaimedCreator: p.is_unclaimed === true,
          claimStatus:  p.claim_status || null,
          role: p.is_admin ? "Admin" : "Investor", status: "Active", accounts: 0,
          joined: new Date(p.created_at).toLocaleDateString("en-US",{month:"short",year:"numeric"}),
        })));
      } catch(_) {}
    };
    load();
  }, [user?.uid, userIsAdmin]);

  // Poll notifications every 30 seconds to surface new connection requests etc.
  useEffect(() => {
    if (!user) return;
    const iv = setInterval(async () => {
      try { setNotifications(await getMyNotifications(user.uid)); } catch(_) {}
    }, 30000);
    return () => clearInterval(iv);
  }, [user?.uid]);

  // securityTicker must be here — before ANY conditional return — Rules of Hooks
  const [securityTicker, setSecurityTicker] = useState(null);

  // ── Circle route — no auth required (shareable, works from an invite link) ──
  // Matches: #/circle/slug  (optionally ?invite=<code> appended by an invite link)
  const circleMatch = pageHash.match(/^#\/circle\/([a-z0-9-]+)/i);
  if (circleMatch && !authLoading) {
    const circleSlug = circleMatch[1];
    const circleQuery = new URLSearchParams(pageHash.split('?')[1] || '');
    return (
      <div className="app"><style>{STYLES}</style>
        <ProfileErrorBoundary>
          <div className="content" style={{maxWidth:900,margin:'0 auto',padding:isMobile?'16px 12px':'28px 24px'}}>
            <CirclePage
              slug={circleSlug}
              inviteCode={circleQuery.get('invite')}
              highlightIdeaId={circleQuery.get('highlight')}
              autoOpenRequests={circleQuery.get('requests')==='1'}
              viewerUser={user}
              onBack={()=>setPageHash('')}
              onNavigateProfile={(uname)=>{ if(uname) window.location.hash = `#/investor/${uname}`; }}
            />
          </div>
        </ProfileErrorBoundary>
      </div>
    );
  }

  // ── Public profile route — no auth required ────────────────────────────────
  // Matches: #/investor/username  OR  #/investor/username/reco/recoId
  const publicMatch = pageHash.match(/^#\/investor\/([a-z0-9_]+)(?:\/reco\/([a-zA-Z0-9-]+))?/i);
  if (publicMatch && !authLoading) {
    const pubUsername = publicMatch[1];
    const pubRecoId   = publicMatch[2] || null;

    // ── Dedicated Reco Post page ─────────────────────────────────────
    if (pubRecoId) {
      return (
        <div className="app"><style>{STYLES}</style>
          <RecoPostPage
            username={pubUsername}
            recoId={pubRecoId}
            viewerUser={user}
            ME={ME}
            onBack={()=>{ window.location.hash = ''; }}
            onNavigateProfile={()=>{ window.location.hash = `#/investor/${pubUsername}`; }}
          />
        </div>
      );
    }

    // ── Full public profile page ──────────────────────────────────────
    return (
      <div className="app"><style>{STYLES}</style>
        <ProfileErrorBoundary>
          <PublicProfilePage
            username={pubUsername}
            recoId={pubRecoId}
            viewerUser={user}
            viewerConnections={connections}
            viewerIsAdmin={userIsAdmin}
            mode="standalone"
            onBack={()=>{ window.location.hash = ''; }}
            onRequestConnect={async(targetId)=>{
              if (!user) {
                sessionStorage.setItem("pending_connect_username", pubUsername);
                window.location.hash = '';
                return;
              }
              await sendConnectionRequest(user.uid, targetId);
              dbLookupUser('username', pubUsername.toLowerCase())
                .then(row => {
                  if (row?.email) sendEmail('connection_request', {
                    to_email:      row.email,
                    from_name:     ME?.name || user.displayName || 'Someone',
                    from_username: ME?.username || '',
                  });
                }).catch(() => {});
              const c = await getMyConnections(user.uid);
              setConnections(c);
            }}
          />
        </ProfileErrorBoundary>
      </div>
    );
  }

  // ── Auth gate ───────────────────────────────────────────────────────────────
  if (authLoading) return (
    <div style={{minHeight:"100vh",background:"#0a0b18",display:"flex",alignItems:"center",justifyContent:"center"}}>
      <div style={{color:"#8a8daa",fontFamily:"'Plus Jakarta Sans',sans-serif",fontSize:15}}>Loading…</div>
    </div>
  );
  // ── Creator claim flow: show claim page ONLY after auth has resolved ─────────
  // Without !authLoading, a stale mic_claim_token shows ClaimProfilePage for
  // ~300ms on every load while Firebase auth is still resolving (user is briefly
  // null). Adding !authLoading ensures we only show this after we know the user
  // is genuinely not logged in.
  if (!authLoading && !user && claimToken && claimProfile) {
    return (
      <div className="app">
        <style>{STYLES}</style>
        <ClaimProfilePage
          profile={claimProfile}
          token={claimToken}
          onBack={() => { setClaimToken(null); setClaimProfile(null); localStorage.removeItem('mic_claim_token'); }}
        />
      </div>
    );
  }

  // ── Password reset page ─────────────────────────────────────────────────────
  if (resetOobCode) return (
    <ResetPasswordPage
      oobCode={resetOobCode}
      onDone={() => setResetOobCode(null)}
    />
  );

  if (!user) return <LoginPage />;


  // Non-admin users are ALWAYS investors.
  // Admin users are in investor view by default (viewAsAdmin starts false),
  // and must explicitly switch to admin view via the profile dropdown.
  // (isInv itself is computed earlier, above the auth-gate early returns —
  // see the useEffect that keeps investorPage/adminPage synced with the URL.)
  const newRecs = recsReceived.filter(r=>!r.invested && !r.hidden).length;
  // page + setPage — setPage also closes the mobile nav drawer for investors
  const openSecurity = (ticker, name, tab) => { setSecurityTicker({ ticker, name, tab }); setPage('sec_intel'); };
  const page    = isInv ? investorPage : adminPage;
  const setPage = isInv
    ? (p) => { setInvestorPage(p); setNavOpen(false); track('page_view', { page_name: p });
               if (INVESTOR_PAGE_TO_PATH[p]) navigate(INVESTOR_PAGE_TO_PATH[p]); }
    : (p) => { setAdminPage(p); track('page_view', { page_name: p });
               if (ADMIN_PAGE_TO_PATH[p]) navigate(ADMIN_PAGE_TO_PATH[p]); };

  const canCreateGroups = configs.groupCreationPolicy==="all";

  const navSections = isInv ? [
    { label:"DISCOVER", items: [
      { id:"home",         label:"Ideas",           icon:Lightbulb,  iconColor:"#fbbf24", iconBg:"rgba(251,191,36,.13)" },
      { id:"discover",     label:"Investors",       icon:Sparkles,   iconColor:"#c084fc", iconBg:"rgba(192,132,252,.15)" },
      { id:"market_intel", label:"Market Insights", icon:TrendingUp, iconColor:"#4ade80", iconBg:"rgba(74,222,128,.13)" },
      { id:"sec_intel",    label:"Stock Insights",  icon:Shield,     iconColor:"#34d399", iconBg:"rgba(52,211,153,.13)" },
    ]},
    { label:"MY CIRCLE", items: [
      ...(configs.enableRecommendations ? [{ id:"recs", label:"My Ideas", icon:Bookmark, iconColor:"#fbbf24", iconBg:"rgba(251,191,36,.13)", badge:newRecs }] : []),
      { id:"network",     label:"Network & Circles", icon:Users,  iconColor:"#60a5fa", iconBg:"rgba(96,165,250,.13)" },
      { id:"trackrecord", label:"Track Record",      icon:Trophy, iconColor:"#fbbf24", iconBg:"rgba(251,191,36,.13)" },
      { id:"portfolio",   label:"Portfolio",         icon:PieChart,iconColor:"#fb923c", iconBg:"rgba(251,146,60,.13)" },
    ]},
    { label:"ACCOUNT & SUPPORT", items: [
      { id:"sharing",  label:"Privacy & Sharing", icon:Lock,        iconColor:"#f472b6", iconBg:"rgba(244,114,182,.13)" },
      { id:"about",    label:"About MIC",         icon:Info,        iconColor:"#a78bfa", iconBg:"rgba(167,139,250,.13)" },
      { id:"contact",  label:"Contact Us",        icon:ExternalLink,iconColor:"#a78bfa", iconBg:"rgba(167,139,250,.13)" },
    ]},
  ] : null;

  const nav = isInv ? [] : [
    { id:"users",       label:"Users",             icon:UserCog },
    { id:"creators",    label:"Creators",           icon:UserPlus },
    { id:"groups",      label:"Groups",            icon:Layers },
    { id:"instruments", label:"Instruments",        icon:Database },
    { id:"sebi",        label:"SEBI Approvals",    icon:Shield },
    { id:"feed",        label:"Feed Settings",     icon:Flame },
    { id:"configs",     label:"App Configuration", icon:Settings },
    { id:"seed",        label:"Seed Data",         icon:Sparkles },
    { id:"about",       label:"About Us Content",  icon:Info },
  ];

  // Stats for sidebar footer — no Accounts for investors
  const stats = isInv
    ? [["Connections", contacts.length], ["Groups", groups.length]]
    : [["Users", users.length], ["Active", users.filter(u=>u.status==="Active").length], ["Groups", groups.length]];

  return (
    <div className="app">
      <style>{STYLES}</style>

      {/* ── Proactive push opt-in toast ─────────────────────────────────────── */}
      {showPushToast && (
        <div style={{
          position:'fixed', bottom:24, left:'50%', transform:'translateX(-50%)',
          zIndex:9999, background:'var(--surface)', border:'1px solid var(--line)',
          borderRadius:14, boxShadow:'0 8px 32px rgba(0,0,0,0.18)',
          padding:'14px 18px', display:'flex', alignItems:'center', gap:12,
          maxWidth:420, width:'calc(100vw - 32px)',
          animation:'slideUp 0.3s cubic-bezier(0.4,0,0.2,1)',
        }}>
          <span style={{fontSize:22, flexShrink:0}}>🔔</span>
          <div style={{flex:1, minWidth:0}}>
            <div style={{fontWeight:700, fontSize:13, marginBottom:2}}>Stay in the loop</div>
            <div style={{fontSize:12, color:'var(--muted)', lineHeight:1.4}}>
              Enable push notifications so you never miss a recommendation from your circle.
            </div>
          </div>
          <div style={{display:'flex', flexDirection:'column', gap:6, flexShrink:0}}>
            <button className="btn btn-pri btn-sm" style={{whiteSpace:'nowrap'}}
              onClick={() => { requestPushPermission(); }}>
              Enable
            </button>
            <button style={{background:'none', border:'none', cursor:'pointer', fontSize:11, color:'var(--muted)', textAlign:'center'}}
              onClick={() => {
                setShowPushToast(false);
                if (user?.uid) sessionStorage.setItem(`mic_push_prompted_${user.uid}`, '1');
              }}>
              Not now
            </button>
          </div>
        </div>
      )}

      <div className="shell">
        {/* Mobile nav backdrop — click to close drawer */}
        <div className={"nav-backdrop"+(navOpen?" open":"")} onClick={()=>setNavOpen(false)}/>
        <div
          className={"sidebar"+(navOpen?" nav-open":"")}
          style={isMobile ? {
            position:'fixed', top:0, left:0, zIndex:500,
            width:'256px', height:'100vh',
            overflowY:'auto', overflowX:'hidden',
            transform: navOpen ? 'translateX(0)' : 'translateX(-100%)',
            transition: 'transform 0.28s cubic-bezier(0.4,0,0.2,1)',
            boxShadow: navOpen ? '16px 0 48px rgba(0,0,0,.55)' : 'none',
          } : {}}
        >
          {/* Brand — click to go home (investor) */}
          <div className="brand"
            onClick={isInv ? ()=>setPage('home') : undefined}
            style={isInv ? {cursor:'pointer'} : {}}
          >
            <img src="/mic-logo.png" alt="mic" style={{width:42,height:42,flexShrink:0}}/>
            <div><div className="nm">myInvestorCircle</div><div className="tag">Social Investing</div></div>
          </div>

          {!isInv && <div className="side-label">Admin</div>}

          {/* Nav items — fill remaining space */}
          <div style={{flex:1,minHeight:0,overflowY:'auto',marginRight:-4,paddingRight:4}}>
            {isInv ? navSections.map((sec,si)=>(
              <div key={si}>
                {sec.label && <div className="side-section">{sec.label}</div>}
                {sec.items.map(n=>(
                  <div key={n.id} className={"nav-item"+(page===n.id?" active":"")} onClick={()=>{setPage(n.id);if(isMobile)setNavOpen(false);}}>
                    <div className="nav-icon" style={{background:n.iconBg}}>
                      <n.icon size={17} color={n.iconColor}/>
                    </div>
                    <div className="nav-txt">
                      <div className="nav-lbl">{n.label}</div>
                      {n.sub && <div className="nav-sub">{n.sub}</div>}
                    </div>
                    {n.badge>0 && <span className="nav-badge">{n.badge}</span>}
                  </div>
                ))}
              </div>
            )) : nav.map(n=>(
              <div key={n.id} className={"nav-item"+(page===n.id?" active":"")} onClick={()=>setPage(n.id)}>
                <n.icon size={19}/> {n.label}{n.badge>0 && <span className="nav-badge">{n.badge}</span>}
              </div>
            ))}
          </div>

          {/* Footer — Connections bar for investors, stats for admin */}
          {isInv ? (
            <div className="side-conn">
              <div className="side-conn-row" onClick={()=>{setPage('network');if(isMobile)setNavOpen(false);}}>
                <div className="nav-icon" style={{width:34,height:34,borderRadius:9,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,background:"rgba(96,165,250,.13)"}}>
                  <Users size={17} color="#60a5fa"/>
                </div>
                <div style={{display:'flex',flexDirection:'column',minWidth:0,flex:1}}>
                  <span style={{fontSize:13.5,fontWeight:600,lineHeight:1.2,color:'var(--side-text)'}}>Connections</span>
                  <span style={{fontSize:10.5,color:'var(--side-dim)',marginTop:1}}>People in your network</span>
                </div>
                <div style={{marginLeft:'auto',display:'flex',alignItems:'center',gap:6,flexShrink:0}}>
                  {contacts.length>0 && <span className="side-conn-badge">{contacts.length}</span>}
                  <ChevronRight size={14} color="var(--side-dim)"/>
                </div>
              </div>
            </div>
          ) : (
            <div className="side-foot">
              {stats.map(([l,v])=><div key={l} className="side-stat"><span>{l}</span><b>{v}</b></div>)}
            </div>
          )}
        </div>

        <div className="main">
          <div className="topbar">
            {/* Left control cluster: permanent Home icon + hamburger (mobile) — kept tight
                together so Home always sits right next to the menu control, regardless of
                route (see Phase: nav redesign — Home no longer occupies a full sidebar row,
                and the mobile brand logo's job is now done by this explicit Home icon so the
                cluster stays compact instead of stacking a logo + hamburger + icon). */}
            <div style={{display:'flex',alignItems:'center',gap:isMobile?4:8,flexShrink:0}}>
              {/* Permanent Home icon — always visible, desktop and mobile, works from any page */}
              {isInv && (
                <button
                  className={"icon-btn"+(page==='home'?" active":"")}
                  onClick={()=>setPage('home')}
                  title="Home"
                  aria-label="Home"
                >
                  <Home size={18}/>
                </button>
              )}
              {/* Hamburger — mobile only, opens nav drawer */}
              {isInv && (
                <button
                  className="hamburger"
                  style={{display: isMobile ? 'inline-flex' : 'none'}}
                  onClick={()=>setNavOpen(v=>!v)}
                  aria-label="Toggle menu"
                >
                  {navOpen ? <X size={20}/> : <Menu size={20}/>}
                </button>
              )}
            </div>

            {/* ── Desktop search with live people dropdown ── */}
            <div className="searchbox search-hide-mobile" style={{width:300,maxWidth:'40vw',position:'relative',flexShrink:0}}>
              <Search size={16} color="var(--muted)"/>
              <input
                value={globalSearch}
                onChange={e=>setGlobalSearch(e.target.value)}
                onFocus={()=>{}}
                placeholder="Search investors, tickers…"
              />
              {globalSearch && (
                <button onClick={()=>{setGlobalSearch('');setSearchPeople([]);}} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',padding:0,display:'flex'}}>
                  <X size={14}/>
                </button>
              )}
              {/* People search results dropdown */}
              {globalSearch.trim().length >= 2 && searchPeople.length > 0 && (
                <div style={{position:'absolute',top:'calc(100% + 8px)',left:0,right:0,zIndex:400,background:'var(--surface)',border:'1px solid var(--line)',borderRadius:12,boxShadow:'0 8px 32px rgba(0,0,0,.14)',overflow:'hidden'}}>
                  <div style={{padding:'7px 14px 3px',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--muted)'}}>Investors</div>
                  {searchPeople.map((u,i)=>{
                    const isConn = connections.some(c=>c.id===u.id&&c.status==='active');
                    const isPend = connections.some(c=>c.id===u.id&&c.status!=='active');
                    const isSebi = u.sebi_approval_status==='approved'||['sebi_ra','sebi_ria'].includes(u.registration_status||'');
                    return (
                      <div key={u.id} style={{display:'flex',alignItems:'center',gap:10,padding:'8px 14px',cursor:'pointer',borderTop:i>0?'1px solid var(--line)':'none',transition:'background .1s'}}
                        onMouseEnter={e=>e.currentTarget.style.background='var(--surface-2)'}
                        onMouseLeave={e=>e.currentTarget.style.background=''}
                        onClick={()=>{ if(u.username){ window.location.hash=`#/investor/${u.username}`; setGlobalSearch(''); setSearchPeople([]); } }}>
                        <div className="av" style={{width:30,height:30,fontSize:11,flexShrink:0,background:'var(--grad)'}}>{initialsOf(u.full_name||u.username||'?')}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:700,fontSize:13,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{u.full_name||u.username}</div>
                          {u.username&&<div style={{fontSize:11,color:'var(--muted)'}}>@{u.username}</div>}
                        </div>
                        {isSebi&&<span style={{fontSize:10,fontWeight:700,padding:'1px 6px',borderRadius:4,background:'var(--gain-soft)',color:'var(--gain)',flexShrink:0}}>SEBI</span>}
                        {isConn ? <span style={{fontSize:11,fontWeight:700,color:'var(--gain)',flexShrink:0}}>Connected</span>
                         : isPend ? <span style={{fontSize:11,color:'var(--muted)',flexShrink:0}}>Pending</span>
                         : <button className="btn btn-pri btn-sm" style={{fontSize:11,padding:'3px 10px',flexShrink:0}}
                             onClick={e=>{e.stopPropagation();handlePeopleConnect(u.id);}}>
                             Connect
                           </button>}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            <div className="tb-right">
              {/* ── Mobile search icon ── */}
              {isInv && (
                <button
                  className="icon-btn"
                  style={{display: isMobile ? 'inline-flex' : 'none'}}
                  onClick={()=>{ setShowMobileSearch(v=>!v); if(showMobileSearch) { setGlobalSearch(''); setSearchPeople([]); } }}
                  aria-label="Search"
                  title="Search"
                >
                  {showMobileSearch ? <X size={18}/> : <Search size={18}/>}
                </button>
              )}

              {/* ── Discover people — permanent, deliberately eye-catching entry point
                   into DiscoverModal (same modal used for onboarding) ── */}
              {isInv && (
                <button
                  className="icon-btn discover-icon-btn"
                  onClick={()=>setShowDiscover(true)}
                  title="Discover investors to Track or Connect with"
                  aria-label="Discover investors"
                >
                  <Sparkles size={18}/>
                </button>
              )}

              {/* ── Invite button (desktop: text+icon; mobile: icon only) ── */}
              {isInv && (
                isMobile
                  ? <button className="icon-btn" onClick={()=>setShowInvite(true)} title="Invite friends" aria-label="Invite friends">
                      <UserPlus size={18}/>
                    </button>
                  : <button
                      className="btn btn-pri btn-sm"
                      onClick={()=>setShowInvite(true)}
                      style={{marginRight:4,padding:'6px 14px',fontSize:13}}
                    >
                      <UserPlus size={14}/> Invite
                    </button>
              )}

              {/* Notification bell */}
              <div style={{position:"relative"}}>
                <button className="icon-btn" onClick={()=>setNotifOpen(v=>!v)}>
                  <Bell size={18}/>
                  {unreadCount>0 && <span style={{position:"absolute",top:0,right:0,background:"var(--accent)",color:"#fff",borderRadius:"50%",fontSize:10,fontWeight:800,width:16,height:16,display:"flex",alignItems:"center",justifyContent:"center",lineHeight:1}}>{unreadCount>9?"9+":unreadCount}</span>}
                </button>
                {notifOpen && <NotificationPanel
                  notifications={notifications}
                  myId={ME.id}
                  onAccept={async (n) => {
                    const [, reqInfo] = await Promise.all([
                      acceptConnection(n.reference_id, ME.id),
                      dbLookupUser('id', n.from_user_id).catch(() => null),
                    ]);
                    track('connection_accepted');
                    if (reqInfo?.email) {
                      sendEmail('connection_accepted', { to_email:reqInfo.email, their_name:ME.name, their_username:ME.username });
                    }
                    // Push notification to the person whose request was just accepted
                    sendPush(n.from_user_id, {
                      title: '🤝 Connection accepted',
                      body:  `${ME?.name || 'Someone'} accepted your connection request`,
                      url:   ME?.username
                        ? `https://myinvestorcircle.com/#/investor/${ME.username}`
                        : 'https://myinvestorcircle.com',
                      tag:   'connection_accepted',
                    });
                    await markNotifRead(n.id, ME.id);
                    const [conns, notifs] = await Promise.all([getMyConnections(ME.id), getMyNotifications(ME.id)]);
                    setConnections(conns); setNotifications(notifs);
                  }}
                  onReject={async (n) => {
                    await rejectConnection(n.reference_id, ME.id);
                    await markNotifRead(n.id, ME.id);
                    const [conns, notifs] = await Promise.all([getMyConnections(ME.id), getMyNotifications(ME.id)]);
                    setConnections(conns); setNotifications(notifs);
                  }}
                  onRead={async (n) => {
                    await markNotifRead(n.id, ME.id);
                    setNotifications(ns => ns.map(x => x.id===n.id ? {...x,is_read:true} : x));
                  }}
                  onReadAll={async () => {
                    await markAllNotifRead(ME.id);
                    setNotifications(ns => ns.map(x => ({...x,is_read:true})));
                  }}
                  onClose={()=>setNotifOpen(false)}
                  pushPermission={pushPermission}
                  onEnablePush={requestPushPermission}
                  onDisablePush={unsubscribePush}
                  onNavigate={async (n) => {
                    // Mark as read
                    if (!n.is_read) {
                      await markNotifRead(n.id, ME.id).catch(()=>{});
                      setNotifications(ns => ns.map(x => x.id===n.id ? {...x,is_read:true} : x));
                    }
                    setNotifOpen(false);

                    const recoTypes = ['contact_like','contact_comment','network_like','network_comment','contact_recommendation'];

                    if (recoTypes.includes(n.type)) {
                      const recoId   = n.metadata?.recoId   || null;
                      const username = n.metadata?.recommenderUsername || null;

                      if (recoId && username) {
                        // Best case: go directly to the specific reco
                        window.location.hash = `#/investor/${username}/reco/${recoId}`;
                      } else if (n.from_user_id) {
                        // Look up username from from_user_id, then navigate
                        dbLookupUser('id', n.from_user_id)
                          .then(row => {
                            if (!row?.username) return;
                            window.location.hash = recoId
                              ? `#/investor/${row.username}/reco/${recoId}`
                              : `#/investor/${row.username}`;
                          }).catch(()=>{});
                      } else if (username) {
                        window.location.hash = `#/investor/${username}`;
                      }
                      return;
                    }

                    // All connection notification types → requester's public profile
                    const connTypes = ['connection_request','connection_accepted','connection_rejected'];
                    if (connTypes.includes(n.type) && n.from_user_id) {
                      dbLookupUser('id', n.from_user_id)
                        .then(row => { if (row?.username) window.location.hash = `#/investor/${row.username}`; })
                        .catch(()=>{});
                      return;
                    }

                    // Tracking notifications (individual or bundled) → Network → Tracking me,
                    // newest trackers first — never a specific record, so no lookup needed.
                    if (n.type === 'tracking_new') {
                      setNetworkInitTab('trackers');
                      setPage('network');
                      return;
                    }

                    // An idea shared to a Circle → that Circle's page, with the
                    // idea scrolled to and highlighted (metadata carries the
                    // slug directly — set once, server-side, at delivery time).
                    if (n.type === 'circle_idea' && n.metadata?.groupSlug) {
                      const highlight = n.metadata?.recoId ? `?highlight=${encodeURIComponent(n.metadata.recoId)}` : '';
                      window.location.hash = `#/circle/${n.metadata.groupSlug}${highlight}`;
                      return;
                    }

                    // Someone requested to join a Circle you own → the Circle
                    // page, with the Join requests panel opened straight away.
                    if (n.type === 'circle_join_request' && n.metadata?.groupSlug) {
                      window.location.hash = `#/circle/${n.metadata.groupSlug}?requests=1`;
                    }
                  }}
                />}
              </div>
              <div ref={profileRef} style={{position:"relative"}}>
                <button
                  onClick={()=>{ setProfileOpen(v=>!v); setNotifOpen(false); }}
                  style={{background:"none",border:"none",padding:0,cursor:"pointer"}}
                  title="Profile & settings"
                >
                  <div className="avatar-pill">
                    <div className="gava" style={isInv && ME.avatarUrl ? { backgroundImage:`url(${ME.avatarUrl})`, backgroundSize:"cover", backgroundPosition:"center", color:"transparent" } : undefined}>{isInv ? ME.initials : "AD"}</div>
                    <div className="tb-name-role" style={{paddingRight:6}}>
                      <div style={{fontSize:13,fontWeight:700,lineHeight:1.2}}>
                        {isInv ? ME.name : "Admin"}
                      </div>
                      <div style={{fontSize:11,color:"var(--muted)"}}>
                        {isInv ? "Investor" : "Administrator"}
                      </div>
                    </div>
                  </div>
                </button>

                {profileOpen && (
                  <div style={{position:"absolute",top:"calc(100% + 8px)",right:0,width:"min(260px,calc(100vw - 24px))",background:"var(--surface)",border:"1px solid var(--line)",borderRadius:16,boxShadow:"0 12px 40px rgba(0,0,0,.18)",zIndex:600,overflow:"hidden"}}>
                    {/* Profile header */}
                    <div style={{padding:"16px 16px 12px",borderBottom:"1px solid var(--line)"}}>
                      <div style={{display:"flex",alignItems:"center",gap:10}}>
                        <div className="av" style={ME.avatarUrl ? {width:40,height:40,fontSize:15,flexShrink:0,backgroundImage:`url(${ME.avatarUrl})`,backgroundSize:"cover",backgroundPosition:"center"} : {width:40,height:40,background:"var(--grad)",fontSize:15,flexShrink:0}}>{!ME.avatarUrl && ME.initials}</div>
                        <div style={{minWidth:0}}>
                          <div style={{fontWeight:700,fontSize:13,whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ME.name}</div>
                          <div style={{fontSize:11,color:"var(--muted)",whiteSpace:"nowrap",overflow:"hidden",textOverflow:"ellipsis"}}>{ME.email}</div>
                        </div>
                      </div>
                    </div>
                    {/* Role switch — only for admin users */}
                    {userIsAdmin && (
                      <div style={{padding:"10px 14px",borderBottom:"1px solid var(--line)"}}>
                        <div style={{fontSize:11,fontWeight:700,color:"var(--muted)",textTransform:"uppercase",letterSpacing:".5px",marginBottom:8}}>Switch role</div>
                        {["investor","admin"].map(r=>(
                          <button key={r}
                            onMouseDown={e=>{
                              e.preventDefault();
                              e.stopPropagation();
                              setViewAsAdmin(r==='admin');
                              setRole(r);            // keep AuthContext in sync
                              setProfileOpen(false);
                            }}
                            style={{width:"100%",display:"flex",alignItems:"center",gap:9,padding:"8px 10px",borderRadius:10,border:"none",cursor:"pointer",marginBottom:4,fontFamily:"var(--font)",fontSize:13,fontWeight:600,textAlign:"left",
                              background: (r==="investor"&&isInv)||(r==="admin"&&!isInv) ? "var(--accent-soft)" : "transparent",
                              color:      (r==="investor"&&isInv)||(r==="admin"&&!isInv) ? "var(--accent-ink)" : "var(--ink)",
                            }}>
                            {r==="investor" ? <Users size={15}/> : <Settings size={15}/>}
                            {r==="investor" ? "Investor view" : "Admin view"}
                            {((r==="investor"&&isInv)||(r==="admin"&&!isInv)) && <Check size={13} style={{marginLeft:"auto"}}/>}
                          </button>
                        ))}
                      </div>
                    )}
                    {/* Edit profile — investors only */}
                    {isInv && (
                      <div style={{padding:"8px 14px",borderBottom:"1px solid var(--line)"}}>
                        <button
                          onMouseDown={e=>{ e.preventDefault(); e.stopPropagation(); setProfileOpen(false); setProfileEditOpen(true); }}
                          style={{width:"100%",display:"flex",alignItems:"center",gap:9,padding:"8px 10px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:"var(--font)",fontSize:13,fontWeight:600,background:"transparent",color:"var(--ink)",textAlign:"left"}}>
                          <UserCog size={15}/> Edit profile
                        </button>
                      </div>
                    )}
                    {/* Sign out */}
                    <div style={{padding:"8px 14px"}}>
                      <button
                        onMouseDown={e=>{ e.preventDefault(); e.stopPropagation(); setProfileOpen(false); logout(); }}
                        style={{width:"100%",display:"flex",alignItems:"center",gap:9,padding:"8px 10px",borderRadius:10,border:"none",cursor:"pointer",fontFamily:"var(--font)",fontSize:13,fontWeight:600,background:"transparent",color:"var(--loss)",textAlign:"left"}}>
                        <LogOut size={15}/> Sign out
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* ── Mobile search overlay — fixed below topbar, toggled by search icon ── */}
          {isInv && isMobile && showMobileSearch && (
            <div style={{position:'fixed',top:64,left:0,right:0,zIndex:300,background:'var(--surface)',borderBottom:'1px solid var(--line)',boxShadow:'0 4px 20px rgba(0,0,0,.1)',padding:'10px 14px'}}>
              {/* Search input */}
              <div style={{display:'flex',alignItems:'center',gap:8,background:'var(--surface-2)',border:'1px solid var(--line)',borderRadius:12,padding:'9px 14px'}}>
                <Search size={15} color="var(--muted)" style={{flexShrink:0}}/>
                <input
                  autoFocus
                  value={globalSearch}
                  onChange={e=>setGlobalSearch(e.target.value)}
                  placeholder="Search investors, tickers…"
                  style={{flex:1,border:'none',background:'none',fontSize:14,fontFamily:'var(--font)',color:'var(--ink)',outline:'none'}}
                />
                {globalSearch && (
                  <button onClick={()=>{setGlobalSearch('');setSearchPeople([]);}} style={{background:'none',border:'none',cursor:'pointer',color:'var(--muted)',padding:0,display:'flex'}}>
                    <X size={14}/>
                  </button>
                )}
              </div>
              {/* People results */}
              {searchPeople.length > 0 && (
                <div style={{marginTop:8,background:'var(--surface)',border:'1px solid var(--line)',borderRadius:12,overflow:'hidden'}}>
                  <div style={{padding:'6px 14px 2px',fontSize:10,fontWeight:700,textTransform:'uppercase',letterSpacing:'.07em',color:'var(--muted)'}}>Investors</div>
                  {searchPeople.map((u,i)=>{
                    const isConn = connections.some(c=>c.id===u.id&&c.status==='active');
                    const isPend = connections.some(c=>c.id===u.id&&c.status!=='active');
                    return (
                      <div key={u.id} style={{display:'flex',alignItems:'center',gap:10,padding:'9px 14px',borderTop:i>0?'1px solid var(--line)':'none'}}
                        onClick={()=>{ if(u.username){ window.location.hash=`#/investor/${u.username}`; setGlobalSearch(''); setSearchPeople([]); setShowMobileSearch(false); } }}>
                        <div className="av" style={{width:32,height:32,fontSize:11,flexShrink:0,background:'var(--grad)'}}>{initialsOf(u.full_name||u.username||'?')}</div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontWeight:700,fontSize:13}}>{u.full_name||u.username}</div>
                          {u.username&&<div style={{fontSize:11,color:'var(--muted)'}}>@{u.username}</div>}
                        </div>
                        {isConn ? <span style={{fontSize:11,fontWeight:700,color:'var(--gain)',flexShrink:0}}>Connected</span>
                         : isPend ? <span style={{fontSize:11,color:'var(--muted)',flexShrink:0}}>Pending</span>
                         : <button className="btn btn-pri btn-sm" style={{fontSize:11,padding:'3px 10px',flexShrink:0}}
                             onClick={e=>{e.stopPropagation();handlePeopleConnect(u.id);}}>
                             Connect
                           </button>}
                      </div>
                    );
                  })}
                </div>
              )}
              {globalSearch.trim().length >= 2 && searchPeople.length === 0 && (
                <div style={{padding:'12px 14px',textAlign:'center',fontSize:13,color:'var(--muted)'}}>No investors found for "{globalSearch.trim()}"</div>
              )}
            </div>
          )}

          <div className="content">
            {/* Connection-request confirmation banner — shown after signup from a public profile */}
            {connectConfirm && isInv && (
              <div style={{
                display:"flex",alignItems:"flex-start",gap:12,
                background:"var(--gain-soft)",border:"1px solid var(--gain)",
                borderRadius:14,padding:"14px 16px",marginBottom:20,
              }}>
                <div style={{width:36,height:36,borderRadius:10,background:"var(--gain)",display:"flex",alignItems:"center",justifyContent:"center",flexShrink:0}}>
                  <Check size={18} color="#fff"/>
                </div>
                <div style={{flex:1}}>
                  <div style={{fontWeight:700,fontSize:14,marginBottom:3}}>
                    Connection request sent to {connectConfirm.name}!
                  </div>
                  <div className="muted small">
                    They'll receive a notification and can accept your request. Once accepted, you can share recommendations with each other.
                  </div>
                </div>
                <button className="icon-btn" onClick={()=>setConnectConfirm(null)} title="Dismiss"><X size={16}/></button>
              </div>
            )}
            {isInv && page==="home"      && <HomeFeed isMobile={isMobile} setPage={setPage} setRecoInit={setRecoInit} recsReceived={recsReceived} setRecsReceived={setRecsReceived} configs={configs} holdings={holdings} contacts={contacts} me={ME} assetClasses={assetClasses} setAssetClasses={setAssetClasses} groups={groups} setRecsMade={setRecsMade} tracked={tracked} toggleTrack={toggleTrack} effectiveFeedConfig={effectiveFeedConfig} networkEngagementRecos={networkEngagementRecos} setNetworkEngagementRecos={setNetworkEngagementRecos} publicFeedRecos={publicFeedRecos} setPublicFeedRecos={setPublicFeedRecos} feedConfigOptions={feedConfigOptions} userFeedPrefs={userFeedPrefs} setUserFeedPrefs={setUserFeedPrefs} globalSearch={globalSearch} connections={connections} onPeopleConnect={handlePeopleConnect} onShowInvite={()=>setShowInvite(true)} onOpenSecurity={openSecurity} feedLoading={feedLoading} trackedCreatorIds={trackedCreatorIds} setTrackedCreatorIds={setTrackedCreatorIds}/>}
            {isInv && showInvite && <InviteModal username={ME?.username} referralCount={referralCount} onClose={()=>setShowInvite(false)}/>}
            {isInv && showDiscover && <DiscoverModal ME={ME} onClose={()=>setShowDiscover(false)} onDiscoverMore={()=>{ setShowDiscover(false); setPage('discover'); }}/>}
            {isInv && page==="portfolio"    && <PortfolioIntelligencePage holdings={holdings} setHoldings={setHoldings} contacts={contacts} me={ME} refreshPrices={refreshPrices} priceRefresh={priceRefresh} onOpenSecurity={openSecurity} setPage={setPage}/>}
            {isInv && page==="market_intel" && <MarketIntelligencePage contacts={contacts} me={ME} onOpenSecurity={openSecurity}/>}
            {isInv && page==="sec_intel"    && <SecurityIntelligencePage securityTicker={securityTicker} contacts={contacts} me={ME} onOpenSecurity={openSecurity}/>}
            {isInv && page==="discover"     && <DiscoverPeoplePage ME={ME}/>}
            {isInv && page==="network"   && <Network
                connections={connections} setConnections={setConnections}
                groups={groups} setGroups={setGroups}
                sharing={sharing} setSharing={setSharing}
                configs={configs} canCreateGroups={canCreateGroups}
                pendingInvites={pendingInvites} setPendingInvites={setPendingInvites}
                recsReceived={recsReceived} me={ME}
                onOpenRecos={(f)=>{ setRecoInit(f); setInvestorPage("recs"); }}
                initTab={networkInitTab} onInitTabConsumed={()=>setNetworkInitTab(null)}
                trackingCounts={trackingCounts} onTrackingCountsChange={setTrackingCounts}/>}
            {isInv && page==="recs"      && <Recommendations
                recsReceived={recsReceived} setRecsReceived={setRecsReceived}
                recsMade={recsMade} setRecsMade={setRecsMade}
                contacts={contacts} groups={groups}
                assetClasses={assetClasses} setAssetClasses={setAssetClasses}
                initFilter={recoInit} holdings={holdings} me={ME}
                tracked={tracked} toggleTrack={toggleTrack}
                globalSearch={globalSearch}
                onReload={async()=>{ setRecsReceived(await getMyReceivedRecos(ME.id)); setRecsMade(await getMyMadeRecos(ME.id)); }}/>}
            {isInv && page==="sharing"     && <Sharing sharing={sharing} setSharing={setSharing} configs={configs} holdings={holdings} contacts={contacts} groups={groups} myId={ME.id} feedConfigOptions={feedConfigOptions} userFeedPrefs={userFeedPrefs} setUserFeedPrefs={setUserFeedPrefs} effectiveFeedConfig={effectiveFeedConfig} setEffectiveFeedConfig={setEffectiveFeedConfig}/>}
            {isInv && page==="about"        && <AboutPage/>}
            {isInv && page==="contact"      && <ContactPage setPage={setPage}/>}
            {isInv && page==="privacy"      && <PrivacyPolicyPage/>}
            {isInv && page==="trackrecord" && (
              ME.username
                ? <ProfileErrorBoundary key={ME.username}>
                    <PublicProfilePage
                      username={ME.username}
                      viewerUser={user}
                      viewerConnections={connections}
                      viewerIsAdmin={userIsAdmin}
                      mode="embedded"
                      isOwnProfile
                      patchProfile={patchProfile}
                      onRequestConnect={()=>{}}
                      onBack={()=>setPage("home")}
                    />
                  </ProfileErrorBoundary>
                : hasPendingClaim
                  ? <div style={{maxWidth:520}}>
                      <div className="page-head"><div>
                        <div className="eyebrow">Track Record</div>
                        <div className="page-title">Your public profile</div>
                      </div></div>
                      <div className="card" style={{borderColor:'rgba(109,93,245,.3)',background:'rgba(109,93,245,.04)'}}>
                        <div className="card-body" style={{textAlign:'center',padding:'36px 28px'}}>
                          <div style={{fontSize:36,marginBottom:14}}>⏳</div>
                          <div style={{fontWeight:800,fontSize:17,marginBottom:10,color:'var(--accent-ink)'}}>Awaiting admin approval</div>
                          <div style={{fontSize:14,color:'var(--muted)',lineHeight:1.7,marginBottom:20}}>
                            You've claimed your profile and your request is with the myInvestorCircle team.
                            Once approved, your full track record and ICI score — including all your historical recommendations — will appear here.
                          </div>
                          <div className="note" style={{fontSize:12,textAlign:'left',background:'var(--surface-2)'}}>
                            You'll receive a confirmation email at your registered address as soon as the admin approves your profile. This usually happens within 24 hours.
                          </div>
                        </div>
                      </div>
                    </div>
                  : <div style={{maxWidth:520}}>
                    <div className="page-head"><div>
                      <div className="eyebrow">Track Record</div>
                      <div className="page-title">Your public profile</div>
                    </div></div>
                    <div className="card"><div className="card-body" style={{textAlign:"center",padding:"40px 32px"}}>
                      <Globe size={36} color="var(--muted)" style={{marginBottom:14}}/>
                      <div style={{fontWeight:700,fontSize:15,marginBottom:8}}>Set a username first</div>
                      <div className="muted small" style={{marginBottom:20}}>
                        Your public profile URL uses your username (e.g. app/#/investor/yourname).
                        Set one in your profile to enable the Track Record page.
                      </div>
                      <button className="btn btn-pri" onClick={()=>setProfileEditOpen(true)}>
                        <Pencil size={15}/> Set username in profile
                      </button>
                    </div></div>
                  </div>
            )}
            {!isInv && (
              <React.Suspense fallback={<div className="empty">Loading admin panel…</div>}>
                {page==="users"       && <AdminUsers users={users} setUsers={setUsers} contacts={contacts} setContacts={()=>{}}/>}
                {page==="creators"    && <AdminCreators ME={ME} claimRequests={claimRequests} onClaimAction={loadClaimRequests}/>}
                {page==="groups"      && <AdminGroups groups={groups} setGroups={setGroups} contacts={contacts} me={ME}/>}
                {page==="instruments" && <AdminInstruments/>}
                {page==="sebi"        && <AdminSebi/>}
                {page==="feed"        && <AdminFeedConfig feedConfigOptions={feedConfigOptions} setFeedConfigOptions={setFeedConfigOptions} setEffectiveFeedConfig={setEffectiveFeedConfig} userFeedPrefs={userFeedPrefs}/>}
                {page==="configs"     && <AdminConfigs configs={configs} setConfigs={setConfigs} providers={providers} setProviders={setProviders}/>}
                {page==="seed"        && <AdminSeedData/>}
                {page==="about"       && <AdminAboutEditor/>}
              </React.Suspense>
            )}
            {/* ── Site-wide footer — investors only ── */}
            {isInv && <SiteFooter page={page} setPage={setPage}/>}
          </div>
        </div>
      </div>
      {/* ── Edit profile modal — rendered as a portal, accessible from any page ── */}
      {profileEditOpen && isInv && (
        <ProfileEditModal
          profile={profile}
          userId={user?.uid}
          username={ME.username}
          patchProfile={patchProfile}
          updateProfile={updateProfile}
          onClose={()=>setProfileEditOpen(false)}
        />
      )}
      {/* ── Mandatory username+consent gate, then a one-time Discover modal —
          both portal overlays gated purely on server-persisted profile state,
          so a user who drops off mid-setup resumes exactly where they left
          off on next login. See features/onboarding/Onboarding.jsx. ── */}
      {isInv && <OnboardingGate user={user} profile={profile} ME={ME} patchProfile={patchProfile} setPage={setPage}/>}
    </div>
  );
}
