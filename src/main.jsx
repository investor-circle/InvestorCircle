import React from "react";
import { createRoot } from "react-dom/client";
import { HashRouter } from "react-router-dom";
import { AuthProvider } from "./AuthContext";
import App from "./App.jsx";
import "./index.css";

// HashRouter (not BrowserRouter): the app deploys as a static SPA to GitHub
// Pages with no server-side rewrite/404 fallback, so only the hash portion
// of the URL is guaranteed to survive a hard refresh or a directly-opened
// link. This is also the existing convention (#/investor/username deep
// links predate this router).
createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <HashRouter>
      <AuthProvider>
        <App />
      </AuthProvider>
    </HashRouter>
  </React.StrictMode>
);
