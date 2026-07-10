import { defineConfig } from "vite";
import react            from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    react(),

    // Safety-net stub for pg.
    // With browser conditions fixed below, @neondatabase/serverless will use
    // its browser build (fetch-based, no pg). This plugin is a fallback for
    // any path that still tries to import pg.
    {
      name: "stub-pg",
      enforce: "pre",
      resolveId: (id) => id === "pg" ? "\0pg" : undefined,
      load:      (id) => id === "\0pg"
        ? "export default {}; export const Client=class{}; export const Pool=class{}; export const types={};"
        : undefined,
    },
  ],

  resolve: {
    // ROOT FIX: @neondatabase/serverless has nested conditional exports:
    //   "browser": { "import": "./dist/browser.mjs" }  ← clean, no pg
    //   "import":  "./dist/index.mjs"                  ← Node.js build, imports pg!
    //
    // Vite's DEFAULT condition order is ['import', 'module', 'browser', 'default'].
    // With 'import' first, it matches the TOP-LEVEL "import" key and picks the
    // Node.js build. Putting 'browser' FIRST makes it match the nested
    // browser.import and pick the clean browser build instead.
    conditions: ["browser", "import", "module", "default"],
  },

  optimizeDeps: {
    include: ["xlsx", "jspdf", "jspdf-autotable"],
    // Same condition ordering for esbuild's dep-optimization phase.
    esbuildOptions: {
      conditions: ["browser", "import", "module", "default"],
    },
  },

  base: "/InvestorCircle/",

  server: { port: 5173, open: true },
});
