# Aplikacja Rodzinna

Family web app used from a browser on multiple devices, deployed to Cloudflare (Workers static assets).

## Stack

- Vite + React + TypeScript (strict), `react-router-dom`
- Supabase: Auth (Google OAuth), Postgres with Row Level Security
- i18n: `i18next` + `react-i18next`, languages PL and DE (default DE)
- Plain CSS with design tokens in `src/styles.css` (iOS-like light theme, dark theme)
- Weather: Open-Meteo (no API key); fallback location Frankfurt am Main
- Env vars in `.env.local` (never commit): `VITE_SUPABASE_URL`, `VITE_SUPABASE_PUBLISHABLE_KEY`

## Structure

```
src/auth/        AuthProvider + useAuth
src/components/  shared UI (Layout, Controls, ProtectedRoute)
src/hooks/       reusable hooks (useTheme, useWeather)
src/i18n/        index.ts, pl.json, de.json
src/lib/         supabase client, small helpers
src/pages/       one file per page/module
supabase/migrations/  numbered SQL migrations (0001_init.sql, ...)
wrangler.jsonc     Cloudflare Workers static assets config (SPA routing)
```

Cloudflare: Workers static assets via `wrangler.jsonc`; build command `npm run build`, assets in `dist`.

## Rules

- Write only the code needed now. No speculative abstractions, no unused files.
- Before adding a function, component or style, check whether a similar one exists and reuse it.
- Extract repeated logic (RLS helpers, hooks, UI components) into one place.
- After each stage run a review: unnecessary code, duplicates, unused imports and dependencies.
  Show the list of proposals and wait for the user's confirmation before applying them.
- Make small changes; do not rewrite whole files.
- Code comments are in English.
- All UI text lives in `src/i18n/pl.json` and `src/i18n/de.json` (keep both in sync); no hardcoded UI strings.
- Every table has RLS enabled. Module tables are added in their own migration together with the module,
  and use `has_module_access(family_id, '<module>', 'read' | 'write')` in policies.
- UI shows only the user's first family for now; the schema supports many (`useFamily`).
- Permission modules: `kitchen`, `todo`, `notes`. Verwaltung is admin-only and has no permission rows.
- Only the first user can create a family; everyone else joins through an invitation.
- Invitations: only the token hash is stored, the link carries the token in the URL fragment
  (`/invite#<token>`), it is removed from the URL immediately and from session storage after use.
  Invitations are created and accepted only through the `security definer` functions.
  A freshly created link is kept only in JS memory (never in storage) until the admin clicks "Gotowe/Fertig".
- Migrations already applied in Supabase are never edited; schema changes go into a new numbered file.
