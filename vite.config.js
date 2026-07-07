import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // base must match your GitHub repository name exactly.
  base: "/InvestorCircle/",

  server: { port: 5173, open: true },

  // Pre-bundle these browser-compatible packages
  optimizeDeps: {
    include: ["xlsx", "jspdf", "jspdf-autotable"],
    // Exclude Node.js-only packages — they must never enter the browser bundle.
    // pg is used only in scripts/stamp-prices.js (server-side batch).
    // @neondatabase/serverless uses its own HTTP transport in the browser.
    exclude: ["pg", "pg-native", "pg-pool"],
  },

  build: {
    rollupOptions: {
      // Tell Rollup not to bundle these Node.js-only packages.
      // @neondatabase/serverless is tree-shakeable and uses fetch() in the
      // browser — it never actually calls pg at runtime.
      external: ["pg", "pg-native", "pg-pool", "pg-cloudflare"],
    },
  },
});
