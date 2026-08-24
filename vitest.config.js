import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Separate from vite.config.js (kept minimal/production-focused) so the
// build config never has to know about test-only concerns. Firebase env
// vars are dummied here (not real secrets) because src/firebase.js reads
// them at import time and several component tests transitively import it.
export default defineConfig({
  plugins: [react()],
  define: {
    "import.meta.env.VITE_FIREBASE_API_KEY": JSON.stringify("test-api-key"),
    "import.meta.env.VITE_FIREBASE_AUTH_DOMAIN": JSON.stringify("test.firebaseapp.com"),
    "import.meta.env.VITE_FIREBASE_PROJECT_ID": JSON.stringify("test-project"),
    "import.meta.env.VITE_FIREBASE_APP_ID": JSON.stringify("1:1:web:test"),
  },
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.{js,jsx}"],
  },
});
