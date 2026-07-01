import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // base must match your GitHub repository name exactly.
  // e.g. if your repo is github.com/you/investorcircle → "/investorcircle/"
  // For a custom domain or root deploy, set to "/" instead.
  base: "/investorcircle/",

  server: { port: 5173, open: true },

  // pdfjs-dist ships an ESM worker loaded with `?url` in src/importers.js.
  optimizeDeps: { include: ["xlsx", "jspdf", "jspdf-autotable"] },
});
