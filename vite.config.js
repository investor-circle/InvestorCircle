import { defineConfig } from "vite";
import react            from "@vitejs/plugin-react";

/**
 * Stub plugin: intercepts imports of Node.js-only packages and replaces
 * them with empty browser-safe stubs during the Rollup build phase.
 *
 * This is the safety net for when pg leaks into the browser bundle via
 * @neondatabase/serverless's optional peer dependency.
 */
function stubNodeOnlyPackages() {
  const STUB = new Set(["pg", "pg-native", "pg-pool", "pg-cloudflare"]);
  const CODE = [
    "export default {};",
    "export const Client = class Client {};",
    "export const Pool   = class Pool   {};",
    "export const types  = {};",
  ].join("\n");
  return {
    name: "stub-node-only-packages",
    enforce: "pre",
    resolveId(id) { if (STUB.has(id)) return "\0stub:" + id; },
    load(id)      { if (id.startsWith("\0stub:")) return CODE; },
  };
}

export default defineConfig({
  plugins: [react(), stubNodeOnlyPackages()],

  // Must match your GitHub repo name exactly — capital I and C.
  base: "/InvestorCircle/",

  server: { port: 5173, open: true },

  optimizeDeps: {
    // Pre-bundle these with esbuild (browser-safe packages).
    include: ["xlsx", "jspdf", "jspdf-autotable"],
    // Exclude these from esbuild pre-bundling so Rollup handles them
    // directly — this lets our stub plugin intercept pg cleanly instead
    // of esbuild producing a broken pre-bundle with http/zlib externalized.
    exclude: ["@neondatabase/serverless", "pg", "pg-native", "pg-pool"],
  },
});
