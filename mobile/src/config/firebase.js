// Firebase initialization for the myInvestorCircle mobile app.
//
// Same Firebase project as the web app (see ../../../src/firebase.js) — one
// user base, one Auth backend. The only difference here is persistence:
// the web SDK persists to localStorage by default, RN has no localStorage,
// so we point it at AsyncStorage explicitly.
import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeAuth, getReactNativePersistence, getAuth } from "firebase/auth";
import AsyncStorage from "@react-native-async-storage/async-storage";

const firebaseConfig = {
  apiKey: process.env.EXPO_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.EXPO_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.EXPO_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.EXPO_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.EXPO_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseApp = getApps().length ? getApp() : initializeApp(firebaseConfig);

// initializeAuth throws if called twice for the same app (e.g. Fast Refresh
// during dev) — fall back to getAuth() when that happens.
let _auth;
try {
  _auth = initializeAuth(firebaseApp, {
    persistence: getReactNativePersistence(AsyncStorage),
  });
} catch {
  _auth = getAuth(firebaseApp);
}
export const auth = _auth;
