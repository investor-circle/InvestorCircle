# investorcircle-public

The SSR + hydration app for myInvestorCircle's public, indexable, shareable
surfaces: **Stock Insights** (`/security/:symbol`), **an idea**
(`/idea/:id`), and **search** (`/search`). This exists because the main app
(`/` and everything under it) is a client-side-only React SPA
(`react-router-dom`'s `HashRouter`, statically hosted) — a crawler or a
link-preview bot (WhatsApp, Slack, Twitter) never executes its JavaScript,
so nothing at a `#/...` URL can ever be indexed or produce a link preview,
no matter what the app itself shows a real visitor.

## Why a separate project, not a folder inside the main build

- **Independent deploys.** This app can ship, roll back, or fail a build
  without touching the main SPA's Vite build or the existing `api/`
  functions at all. A bad deploy here never takes down the app.
- **No new database credential exposure.** This app does **not** import
  `api/_lib/handlers/public-ideas.js` or hold a Neon connection string. It
  fetches from the main app's already-public `/api/data?resource=public-ideas`
  endpoint over plain HTTPS (see `lib/api.js`) — the same one-file rule
  CLAUDE.md documents ("public-ideas.js is the only place public idea data
  is queried") stays true; this app is just another caller of it, exactly
  like the main SPA is.
- **Different rendering model, cleanly separated.** Server components here
  run in Node with no `window`, fetch data before the first render, and
  hydrate on the client. The main app's `SecurityIntelligencePage` is pure
  client-rendered React with `useEffect` data fetching. Keeping these in
  separate projects means nobody has to hold both mental models in one file.

## What's intentionally NOT here

- **No authentication.** A visitor here is always anonymous — there is no
  Firebase session to check across origins. "Your Circle" (connections/
  tracked investors) is a signed-in-only concept and simply doesn't apply;
  every tab shows the Community view only. A prominent "Open in
  myInvestorCircle" link takes a visitor into the real app
  (`https://myinvestorcircle.com/#/security/:symbol`), where the full
  signed-in experience (Your Circle, ICI scores, AI Summary) lives.
- **No ICI investor scores.** `investor-ici-batch` requires a verified
  Firebase token server-side (`requireUid`) — correctly, since it's a
  per-viewer batch computation, not public data. Omitted here rather than
  weakened.
- **No AI Summary tab.** It's a client-only simulated feature in the main
  app with no real backend logic behind it and no SEO/share value — deferred
  rather than ported, to keep this app's first version scoped to what
  indexability and link-sharing actually need.
- **No homepage.** `/` stays the SPA for now (referral links, password-reset
  links, and the mobile app's Android intent filters all target the bare
  domain — SSR-ing it is a separate, deliberate decision, not bundled into
  this change).

## Local development

```
cd web-public
npm install
npm run dev
```

By default this fetches from the **production** public API
(`https://myinvestorcircle.com/api/data`) — read-only, unauthenticated,
already-public data, so this is safe to point at prod even from a laptop.
Override with `PUBLIC_API_BASE` in `.env.local` if you ever stand up a
staging copy of the main app's API.

## Deploying (one-time setup, in the Vercel dashboard)

1. **Add New Project** in Vercel, pointing at this same GitHub repo, with
   **Root Directory** set to `web-public`. Deploy it — Vercel auto-detects
   Next.js, no other config needed.
2. Note the production URL Vercel assigns it (e.g.
   `https://investorcircle-public.vercel.app`, if you name the project
   `investorcircle-public` as suggested in `package.json`'s `name`).
3. Back in the **main** project's `vercel.json`, update the three
   `destination` values under the `/security/:symbol`, `/idea/:id` and
   `/search` rewrites to that URL if it differs from the placeholder already
   there — the rewrite makes it invisible to visitors (the address bar still
   shows `myinvestorcircle.com/security/...`), it's proxying under the hood.
4. This only actually reaches real users once `myinvestorcircle.com`
   resolves to Vercel at all — see the note in the main `vercel.json` and
   `CLAUDE.md`'s deployment section. Until then this is reachable at its own
   `*.vercel.app` URL for testing, but not at the custom domain.
