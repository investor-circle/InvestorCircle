// Firebase initialization for InvestorCircle.
//
// Setup (one time — takes about 5 minutes):
//   1. Go to https://console.firebase.google.com
//   2. Click "Add project" → name it "investorcircle" → Create project
//   3. In the project, click the </> web icon → Register app → name it "investorcircle"
//   4. Firebase shows you a firebaseConfig object. Copy those 6 values.
//   5. In the Firebase console left sidebar → Build → Authentication →
//      Get started → Email/Password → Enable → Save
//   6. Still in Authentication → Users → Add user →
//      enter ankur.citm@gmail.com and your password → Add user
//   7. Add all 6 values to your .env file (see .env.example) and to
//      GitHub Secrets (Settings → Secrets → Actions) for the live site.

import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";

const firebaseConfig = {
  apiKey:            import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain:        import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId:         import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket:     import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId:             import.meta.env.VITE_FIREBASE_APP_ID,
  measurementId:     import.meta.env.VITE_FIREBASE_MEASUREMENT_ID, // G-XXXXXXXXXX
};

// Primary app — manages the currently signed-in user's session
export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);

// Secondary app instance — used by admin to create new user accounts
// without signing out the current admin session.
export const secondaryApp = initializeApp(firebaseConfig, "secondary");
export const secondaryAuth = getAuth(secondaryApp);

// Analytics — only initialised when measurementId is present (not in dev
// without it), and loaded via a dynamic import rather than a static one:
// firebase/analytics has no bearing on auth-state resolution or on
// rendering LandingPage/Home Feed, so it shouldn't be part of the eager
// vendor-firebase chunk every visitor downloads before first paint. This
// keeps the same "never crash the app for analytics" guarantee — a failed
// or slow-to-arrive analytics module just means `track()` no-ops a little
// longer, exactly as it already no-ops when measurementId is absent.
let _analyticsPromise = null;
function loadAnalytics() {
  if (!import.meta.env.VITE_FIREBASE_MEASUREMENT_ID) return null;
  if (!_analyticsPromise) {
    _analyticsPromise = import("firebase/analytics")
      .then(({ getAnalytics }) => getAnalytics(firebaseApp))
      .catch(() => null); // analytics unavailable in this environment
  }
  return _analyticsPromise;
}

/** Safe logEvent wrapper — no-ops silently if analytics is not available. */
export const track = (eventName, params = {}) => {
  const analyticsPromise = loadAnalytics();
  if (!analyticsPromise) return;
  analyticsPromise.then(async (analyticsInstance) => {
    if (!analyticsInstance) return;
    try {
      const { logEvent } = await import("firebase/analytics");
      logEvent(analyticsInstance, eventName, params);
    } catch { /* never crash for analytics */ }
  });
};
