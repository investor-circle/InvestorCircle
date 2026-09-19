# investorcircle-public

The SSR + hydration app for myInvestorCircle's public, shareable surfaces:
**Stock Insights** (`/security/:symbol`), **an idea** (`/idea/:id`), **an
investor profile** (`/investor/:username` — see its own note below),
**search** (`/search`), and **the homepage** (`/`, for a signed-out/
anonymous visitor only — see "Homepage routing" below). This exists because
the rest of the main app is a client-side-only React SPA — a crawler or a
link-preview bot (WhatsApp, Slack, Twitter) never executes its JavaScript,
so nothing rendered only by that SPA can ever be indexed or produce a link
preview, no matter what the app itself shows a real visitor.

**`/investor/:username` is deliberately not indexable, unlike the other
routes here** — it exists purely so a shared profile link renders a correct
preview card (avatar, ICI score, idea/tracking counts) instead of the
generic site logo, and shows a much thinner page than the other routes
here (no sector breakdown, best/worst picks, or idea list — those stay
behind sign-in). `generateMetadata` sets `robots: noindex` and the main
project's `public/robots.txt` still disallows `/investor/` — see
`CLAUDE.md`'s "Member profiles are deliberately not *indexed*" for the full
reasoning.

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
  every tab shows the Community view only. A "Sign in to myInvestorCircle"
  link (Gate.jsx) is the only CTA into the real app — `/security/:symbol`,
  `/idea/:id` and `/investor/:username` are all real paths on the main
  app's own domain too (BrowserRouter, not HashRouter), but each is itself
  proxied to THIS app for a signed-out visitor (see the main project's
  vercel.json), so there is no separate URL a fresh link could point at for
  "the interactive version of this exact page" — only a signed-in user
  already running the main app can reach it, via client-side navigation
  (`/middleware.js`'s routing-token cookie check is what sends a signed-in
  visitor's own browser to the SPA instead of here — see CLAUDE.md). The
  idea page's "Open this idea in the app" link still works as a distinct
  destination since it points at the author's
  `/investor/:username/idea/:id` — the nested shape, which this project
  never proxies (only the bare `/investor/:username` does).
- **No ICI investor-SEARCH scores.** `investor-ici-batch` (the batched
  lookup Discovery/Connections use to rank many investors at once) still
  requires a verified Firebase token server-side (`requireUid`) —
  correctly, since ranking against a signed-in viewer's own circle isn't
  public data — and stays out of this app. A single public profile's own
  ICI score is different: `/investor/:username` computes and shows it,
  using `lib/ici.js`'s `computeIci` (a duplicate of `src/db.js`'s, same
  reasoning as `computeConsensus`) against the already-public summary
  fields `resource=public-profile` returns.
- **No AI Summary tab.** It's a client-only simulated feature in the main
  app with no real backend logic behind it and no SEO/share value — deferred
  rather than ported, to keep this app's first version scoped to what
  indexability and link-sharing actually need.

## Homepage routing (`/`)

Unlike `/security/:symbol`/`/idea/:id`/`/investor/:username`/`/search`, `/` is not unconditionally
proxied here — a signed-in returning user needs to land back in the SPA's
Home Feed, not this page. The main project's `/middleware.js` decides,
before its own `vercel.json` rewrite is ever reached: a valid `mic_route`
routing-hint cookie, or any of a short list of auth/deep-link query params
(`ref`, `next`, `signup`, `claim_token`, `oobCode`, `mode`) present on the
request, sends it to the SPA (`/index.html`) instead; everything else
(the common case — a new/anonymous visitor, a crawler, a link-preview bot)
reaches this page. `mic_route` is never authentication — see
`api/_lib/routingToken.js` and `/middleware.js`'s own header comments in
the main project for the full reasoning. This page itself stays exactly as
anonymous as every other route here — no Firebase, no session check, real
`<a href>` links (not a client-side redirect) for "Sign in"/"Create
account" (see `app/page.jsx`).

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
3. Back in the **main** project's `vercel.json`, update the `destination`
   values under the `/security/:symbol`, `/idea/:id`, `/investor/:username`
   and `/search` rewrites (plus each route's own `opengraph-image` sub-path
   rewrite) to that URL if it differs from the placeholder already there —
   the rewrite makes it invisible to visitors (the address bar still shows
   `myinvestorcircle.com/security/...`), it's proxying under the hood.
4. This only actually reaches real users once `myinvestorcircle.com`
   resolves to Vercel at all — see the note in the main `vercel.json` and
   `CLAUDE.md`'s deployment section. Until then this is reachable at its own
   `*.vercel.app` URL for testing, but not at the custom domain.
