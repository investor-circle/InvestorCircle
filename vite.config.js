import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],

  // Must match your GitHub Pages repo name exactly.
  base: "/InvestorCircle/",

  server: { port: 5173, open: true },

  optimizeDeps: { include: ["xlsx", "jspdf", "jspdf-autotable"] },
});
