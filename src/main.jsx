import React from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { AuthProvider } from "./AuthContext";
import App from "./App.jsx";
import "./index.css";

// BrowserRouter (not HashRouter): the app is now assured to deploy behind
// Vercel (see vercel.json's catch-all rewrite to /index.html), which can
// give every route a real path with a server-side SPA-fallback rewrite —
// something GitHub Pages, the original host, could not do, which is why
// HashRouter was chosen originally. Real paths mean in-app URLs (e.g.
// /security/RELIANCE, /connections) are shareable and don't carry the
// dated-looking # that a fragment-based router requires.
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <BrowserRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </BrowserRouter>
  </React.StrictMode>
);
