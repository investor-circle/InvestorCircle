import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),

    // pg is a Node.js-only package used in scripts/stamp-prices.js (server batch).
    // @neondatabase/serverless imports it as an optional peer dep but uses fetch()
    // in the browser — pg is never called at runtime. This stub silences the
    // "Rollup failed to resolve import pg" build error without adding any runtime code.
    {
      name: "stub-pg",
      enforce: "pre",
      resolveId: (id) => id === "pg" ? "\0pg" : undefined,
      load:      (id) => id === "\0pg"
        ? "export default {}; export const Client=class{}; export const Pool=class{}; export const types={};"
        : undefined,
    },
  ],

  base: "/InvestorCircle/",

  server: { port: 5173, open: true },

  optimizeDeps: { include: ["xlsx", "jspdf", "jspdf-autotable"] },
});
