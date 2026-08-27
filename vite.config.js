import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // base must match your GitHub repository name exactly.
  // e.g. if your repo is github.com/you/investorcircle → "/investorcircle/"
  // For a custom domain or root deploy, set to "/" instead.
  // base: "/InvestorCircle/",
  base: "/",

  server: { port: 5173, open: true },

  optimizeDeps: { include: ["xlsx"] },

  build: {
    rollupOptions: {
      output: {
        // Split third-party code that almost never changes between our own
        // deploys into its own chunk(s), separate from app code. Two
        // effects, both purely at the build/network level — no app logic
        // touched: (1) the browser can fetch the vendor chunk and the app
        // chunk over separate HTTP/2 streams in parallel instead of
        // waiting on one monolithic bundle; (2) on a repeat visit after an
        // app-only deploy, the vendor chunk's content hash is unchanged, so
        // the browser serves it from cache instead of re-downloading it.
        manualChunks: {
          "vendor-react": ["react", "react-dom", "react-router-dom"],
          "vendor-firebase": ["firebase/app", "firebase/auth", "firebase/analytics"],
        },
      },
    },
  },
});
