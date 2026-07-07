import { defineConfig } from "vite";
import react            from "@vitejs/plugin-react";

/**
 * Vite plugin: intercepts imports of Node.js-only packages and replaces
 * them with empty stubs so the browser bundle builds cleanly.
 *
 * pg / pg-native / pg-pool are used ONLY in scripts/stamp-prices.js
 * (server-side batch). @neondatabase/serverless uses fetch() in the
 * browser and never calls pg at runtime.
 */
function stubNodeOnlyPackages() {
  const STUB_IDS = new Set(["pg", "pg-native", "pg-pool", "pg-cloudflare"]);
  const STUB_CODE = [
    "export default {};",
    "export const Client  = class Client  {};",
    "export const Pool    = class Pool    {};",
    "export const types   = {};",
  ].join("\n");

  return {
    name: "stub-node-only-packages",
    // Resolve: mark these IDs as virtual (\0 prefix is Rollup convention)
    resolveId(id) {
      if (STUB_IDS.has(id)) return "\0stub:" + id;
    },
    // Load: return the stub source for virtual modules
    load(id) {
      if (id.startsWith("\0stub:")) return STUB_CODE;
    },
  };
}

export default defineConfig({
  plugins: [
    react(),
    stubNodeOnlyPackages(),
  ],

  // Must match your GitHub repo name exactly — capital I and C.
  base: "/InvestorCircle/",

  server: { port: 5173, open: true },

  optimizeDeps: {
    include: ["xlsx", "jspdf", "jspdf-autotable"],
  },
});
