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
import { getAnalytics, logEvent as _logEvent } from "firebase/analytics";

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

// Analytics — only initialised when measurementId is present (not in dev without it).
// Use the exported `track` helper rather than calling logEvent directly.
let _analytics = null;
try {
  if (import.meta.env.VITE_FIREBASE_MEASUREMENT_ID) {
    _analytics = getAnalytics(firebaseApp);
  }
} catch { /* analytics unavailable in this environment */ }

export const analytics = _analytics;

/** Safe logEvent wrapper — no-ops silently if analytics is not initialised. */
export const track = (eventName, params = {}) => {
  if (!_analytics) return;
  try { _logEvent(_analytics, eventName, params); } catch { /* never crash for analytics */ }
};
