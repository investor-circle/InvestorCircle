# InvestorCircle

A private, **closed-circle** social investing prototype — think a digitized investment club rather than an open broadcast network. Aggregates holdings across accounts, lets you share at granular privacy levels, and tracks recommendations from your real circle with auto-computed P&L.

> **Status:** prototype. All data is mock and in-memory — a page refresh resets state. Neon wiring is provided as a schema + client stub but is not connected by default.

## Quick start

```bash
npm install
npm run dev        # opens http://localhost:5173
```

Requires Node 18+.

## Deploy to GitHub Pages

Every push to `main` auto-deploys via GitHub Actions (`.github/workflows/deploy.yml`).

1. Push the repo to GitHub (see setup guide for step-by-step).
2. In repo **Settings → Pages → Source**, select the `gh-pages` branch.
3. Your app is live at `https://YOUR-USERNAME.github.io/investorcircle/`.

> `vite.config.js` already has `base: "/investorcircle/"` set. If your repo is named differently, update that value to match.

## Connect Neon (optional)

The app runs fully on mock data without this. When you're ready to persist:

1. Create a free project at [neon.tech](https://neon.tech) (no credit card, Mumbai region recommended).
2. Open the Neon **SQL editor** and run [`supabase/schema.sql`](supabase/schema.sql) — it's plain Postgres, no changes needed.
3. Put the connection string in the **Vercel** project as `DATABASE_URL` (server-only — never a `VITE_` variable, and never a GitHub Actions secret for the frontend build).
4. The browser never talks to Neon. Frontend code calls the authenticated
   endpoints in `api/` via `src/services/api/*.js` → `src/db.js`; those
   functions hold the credential. Add new queries there, not in `src/**`.

> **Do not add a database URL to the frontend build.** Anything named `VITE_*` is compiled into the JavaScript every visitor downloads, so a connection string passed to `npm run build` is published rather than configured. `src/supabaseClient.js` and `VITE_DATABASE_URL` were removed when data access moved behind the API — see CLAUDE.md, "Prohibition on browser-side Neon access".

## What's inside

- **Home** — activity feed + portfolio snapshot.
- **Portfolio** — multi-account aggregation, allocation ring, P&L, plus export (Excel/PDF), import (Excel/CSV/PDF), and Link via PAN.
- **Network** — Contacts and Groups, each showing recommendation count and P&L you earned acting on them; row-expand with breakdown; click P&L to pre-filter Recommendations.
- **Recommendations**
  - *Received*: **Recommended by** + distinct **Shared by** column, row-expand shows the recommender's thesis, Mark invested prompts for your entry price, reactions, forward/share.
  - *Made by me*: track acted/likes/dislikes, send exit signals, share to more contacts or groups.
- **Sharing & Privacy** — per-contact and per-group visibility with a live preview.
- **Admin** — users, groups, and app configuration.

## Project structure

```
investorcircle/
├─ .github/workflows/deploy.yml  ← auto-deploy to GitHub Pages on push
├─ index.html
├─ vite.config.js                ← base: "/investorcircle/" for GitHub Pages
├─ package.json
├─ .env.example                  ← copy to .env for Neon
├─ src/
│  ├─ App.jsx                    ← entire app + inline design system
│  ├─ main.jsx, index.css
│  ├─ exporters.js               ← Excel + PDF export
│  ├─ importers.js               ← Excel/CSV + PDF import
│  ├─ supabaseClient.js          ← Neon client stub (null until .env set)
│  └─ services/pan.js            ← mock PAN holdings service
└─ supabase/
   └─ schema.sql                 ← full Postgres schema (run in Neon SQL editor)
```

## Caveats

- **PDF import is best-effort.** Statement layouts vary; Excel/CSV is far more reliable.
- **PAN linking is mocked.** A real build uses India's Account Aggregator framework. Try `ABCDE1234F` or `AAAPZ1234C`.
- **P&L uses an assumed $1,000 notional** per acted recommendation for demo math.
- **Regulation:** sharing recommendations + performance sits near regulated "investment advice." The closed-circle, private-by-default design mitigates this — review before any public or monetised use.
- **Database access:** the browser holds no database credential. Every read and write goes through the authenticated serverless functions in `api/`, which derive the caller's identity from a verified Firebase ID token rather than trusting anything the client sends.

## License

Personal experiment — no licence granted. Add one before sharing publicly.

