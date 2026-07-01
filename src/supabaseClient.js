// Neon database client — stub for future persistence.
//
// The prototype runs entirely on in-memory mock data (see the useState seeds in
// App.jsx), so this module is not yet imported or called anywhere in the app.
//
// When you're ready to wire real persistence:
//   1. Run supabase/schema.sql in the Neon SQL editor (it's plain Postgres —
//      no changes needed to the file itself).
//   2. Copy .env.example to .env and paste your connection string from the
//      Neon dashboard: Project → Connection Details → Connection string.
//   3. Import `sql` here into the relevant page component and replace the
//      useState seed arrays with actual queries, e.g.:
//
//        import { sql } from "./supabaseClient";
//        const holdings = await sql`SELECT * FROM holdings WHERE owner_id = ${userId}`;
//
// Security note:
//   VITE_ prefix bakes the connection string into the browser bundle — anyone
//   can read it in DevTools. For a personal prototype that's acceptable, but
//   before storing real user data, move queries behind an API route (Vercel
//   function, Netlify function, etc.) so the connection string stays server-side.
//
// Usage after wiring:
//   import { sql, isNeonConfigured } from "./supabaseClient";
//   if (!isNeonConfigured) console.warn("Neon not configured — using mock data");

import { neon } from "@neondatabase/serverless";

const databaseUrl = import.meta.env.VITE_DATABASE_URL;

// `sql` is a tagged template literal you use like:
//   const rows = await sql`SELECT * FROM profiles LIMIT 10`;
// Returns null when VITE_DATABASE_URL is not set, so the app still
// boots cleanly on mock data with no .env file present.
export const sql = databaseUrl ? neon(databaseUrl) : null;

export const isNeonConfigured = Boolean(databaseUrl);
