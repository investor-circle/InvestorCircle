import React from "react";
import { SOCIAL_LINKS } from "../../constants/app";
import LandingPageContent from "./LandingPageContent";

/**
 * The public landing page — what a signed-out visitor gets at "/".
 *
 * This is now a thin SPA-specific wrapper around LandingPageContent (see
 * that file's own header comment for why the split exists — it's shared
 * with web-public/app/page.jsx, a completely different, server-rendered
 * runtime). All the actual copy/layout/CSS lives there; this file's only
 * job is wiring "Sign in"/"Create account" to this app's own local-state
 * switch (no page reload) via render-prop functions, exactly as before.
 *
 * Self-contained rendering-wise, same as before: it renders outside the
 * `.app` wrapper (see the auth gate in App.jsx), so the global STYLES
 * string is not in scope — LandingPageContent's own <style> tag supplies
 * everything it needs.
 */
export default function LandingPage({ onSignIn, onCreateAccount }) {
  return (
    <LandingPageContent
      signInCTA={(props) => <button onClick={onSignIn} {...props}/>}
      createAccountCTA={(props) => <button onClick={onCreateAccount} {...props}/>}
      socialLinks={SOCIAL_LINKS}
    />
  );
}
