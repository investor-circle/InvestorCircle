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
};

// Primary app — manages the currently signed-in user's session
export const firebaseApp = initializeApp(firebaseConfig);
export const auth = getAuth(firebaseApp);

// Secondary app instance — used by admin to create new user accounts
// without signing out the current admin session.
// (Firebase's createUserWithEmailAndPassword normally signs IN as the new user,
// which would log the admin out. Using a separate app instance prevents this.)
export const secondaryApp = initializeApp(firebaseConfig, "secondary");
export const secondaryAuth = getAuth(secondaryApp);
