import { defineConfig }      from "vite";
import react                 from "@vitejs/plugin-react";
import { fileURLToPath, URL } from "url";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Must match your GitHub repo name exactly (capital I and C).
  base: "/InvestorCircle/",

  server: { port: 5173, open: true },

  resolve: {
    alias: {
      // pg is Node.js-only (used only in scripts/stamp-prices.js).
      // Replace every import of 'pg' in the browser bundle with an empty stub
      // so Vite doesn't try to bundle Node.js internals (net, tls, dns, etc.).
      pg: fileURLToPath(new URL("./src/pg-stub.js", import.meta.url)),
    },
  },

  optimizeDeps: {
    include: ["xlsx", "jspdf", "jspdf-autotable"],
    exclude: ["pg"],
  },
});
