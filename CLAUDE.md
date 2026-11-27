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

## Working mode (set by the owner)

1. UI tasks and small changes: do them right away, no plan and no questions. Describe the default decisions in the summary.
2. A plan and questions only for: migrations with RLS, tokens or permissions; architecture changes; anything irreversible.
3. Run `npm run build`, `npm run db:dry` and the layout check (360/390/768/1280 px) yourself. UI text only in `pl.json` and `de.json`.
4. Never without the owner's explicit OK: `db:push`, `fn:deploy`, commit and push. Secrets never go into the repo, the chat or logs.
5. Combine related tasks in one pass. End with a short summary: what was done, and what the owner has to do by hand, in one table.
6. Ordinary migrations (e.g. adding a column) are checked by you (`db:dry`); show the SQL for review only when it touches RLS, tokens or permissions.

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
  Numbering: 0001 init, 0002 profile theme, 0003 kitchen permission, 0004 invitations,
  (0005 intentionally unused), 0006 invitation label, 0007 kitchen shopping, 0008 kitchen pantry, 0009 receipts, 0010 pack size, 0011 recipes, 0012 family home state, 0013 calendar links, 0014 Google OAuth, 0015 calendar filter, 0016 calendar write limit, 0017 pantry rise cleans list, 0018 to-do core, 0019 recipe import. Next: 0020.
  Pantry triggers: bought shopping item (checked false->true) raises `ist`; a falling `ist` sets the open shopping
  item to `soll - ist` (`add_pantry_shortages`). Neither trigger touches the column that fires the other (no loop).
  0017: a RISING `ist` (trigger `pantry_items_rise`) lowers the open item to max(0, soll - ist) and deletes it at 0 (hard
  delete, so it is not in "recently deleted"); products with soll = 0 and ticked/soft-deleted rows are never touched.
- Applying migrations (Supabase CLI 3.x targets the local stack by default, so the scripts always pass `--remote`
  for the linked project): new migrations are checked with `npm run db:dry` and applied with `npm run db:push`
  only after the user's explicit OK. After every migration show a short summary of the result
  (`npm run db:status`). Never write passwords, tokens or connection strings into the repository or into replies
  (DB password and access token live only in the user's own shell/login, e.g. `SUPABASE_DB_PASSWORD`).
- Edge Functions live in `supabase/functions/<name>/` and are deployed with `npm run fn:deploy` (only on the user's OK).
  Secrets (e.g. `ANTHROPIC_API_KEY`) are set in Supabase by the user and never appear in the repo, the frontend or
  replies. Receipt photos are never stored or logged; the model's output is validated server-side.
- Products may have an optional package size (`pack_size` + `pack_unit`, stored as g/kg/ml/l/pcs). It is only a label
  (`productLabel`): Ist, Soll, Min and the shopping list always count PACKS (integers).
- Recipes (`recipes`, `recipe_ingredients`, `meal_wishes`, 0011): added by hand only, each keeps the language it was written
  in. Pantry check = one pure function `src/lib/recipeNeeds.ts` (sums per product BEFORE comparing with `ist`, skips staples);
  `add_missing_to_list` sets the open list quantity to max(existing, missing); recipes are saved atomically by `save_recipe`.
- Start page: public holidays PL/DE come from Nager.Date (`src/lib/holidays.ts`, cached 30 days in localStorage, errors = nothing
  shown); `families.home_state` (admin-editable in Verwaltung) picks the German state that is highlighted.
- Calendar (read-only so far, 4b): Google OAuth, no service account. "Connect calendar" asks for `calendar.events` +
  `calendar.calendarlist.readonly` (offline + consent); the refresh token is sent once to the Edge Function `calendar`
  (only when sessionStorage marks a connect flow of the same user), which stores it AES-GCM encrypted in
  `google_tokens` (RLS, no client access; service role only in two helpers: read the owner's token, write one's own).
  Secrets GOOGLE_CLIENT_ID, GOOGLE_CLIENT_SECRET, CALENDAR_TOKEN_KEY are set by the user in Supabase, never in the repo.
  Events are read live with the token of the calendar's OWNER and never stored; the user id always comes from getUser().
  Permission module `calendar`. `calendar_links` always has an owner; "shared" ones are registered by admins; a private
  link is invisible to everyone but its owner (admins too). Private/confidential events are masked for non-owners.
  Start page filter: `profiles.calendar_filter` holds the ids of calendars switched OFF (nothing saved = all visible
  calendars on: own + family-visible), one chip per calendar.
- Calendar writing (4c): actions create_event / update_event / delete_event in `calendar`. The target calendar always comes from
  `calendar_links` read with the caller's client (RLS) and must be the family calendar (shared) or the caller's own; Google
  IDs from the client are never used. Writes use the AUTHOR's own token only, after a live check of the author's role
  (owner/writer) in Google and the limit `claim_calendar_write` (60/h). Bodies are built from validated fields only (no
  description or attendees; edits are PATCH with If-Match, sendUpdates=none); recurring events are read-only. "Only me" =
  the person's private calendar and Google visibility private. Reads: client polls every 45 s while the tab is visible,
  function cache 15 s and 20 reads/min per person.
- To-do (`todos`, 0018) and later notes: every row has `owner_user_id` + `visibility` ('private' | 'family'); policies come from
  `apply_visibility_policies(tbl, module)` (private rows only for their owner, admins too; any member with write edits family
  rows; a non-owner can never make a family row private). New members get calendar/todo/notes write
  (`default_member_permissions`). Before a member row is deleted `reassign_family_content` hands their FAMILY content to an
  admin (the guards accept the owner change only through the `app.reassign` setting); private content goes with them.
  Live data: `useTodos` (same Realtime pattern, `applyChange` in `src/lib/realtime.ts`).
- Recipe import (phase 1: photos and pasted text; links come in phase 2 with SSRF protection): Edge Function `import-recipe` only
  READS (no storage, no logging of input); the user confirms on an editable screen, then `save_recipe_import` (security invoker, validates
  everything again, creates new products, learns `ingredient_aliases` - separate from `receipt_aliases` - and saves the recipe in one
  transaction). Daily limit per family: `claim_recipe_import`, default 5, changeable with the secret RECIPE_IMPORT_DAILY_LIMIT
  (read per request, no redeploy). The model sees `in_pantry` (computed on the server from pantry_items); `src/lib/ingredientMatch.ts`
  adds the same pantry bonus and the hints (Dose, gehackte, passierte, frische) on the client. Steps are plain text; `source_url` is
  shown as a link only when it starts with https://.
- Receipt scanning (`scan-receipt` + `apply_receipt`): nothing changes before the user confirms; the approval
  button is locked from the first click until saving ends.
- Module tables get their RLS through `select public.apply_module_policies('<table>', '<module>', <with_delete>)`
  (one shared definition; has_module_access read/write). Tables with `deleted_at` use soft deletion (with_delete = false).
- Kitchen module (`kitchen`): tabs shopping, pantry, recipes, meal-plan under `/kitchen/...`; the family `products`
  catalog is shared by all tabs. Starter product names come from `kitchen.products.<seed_key>` in the translation files.
- Live data uses Supabase Realtime: actions only write to the database, the UI updates from the change event
  (see `useKitchen`, loaded once in `Kitchen.tsx` and passed to the tabs via the Outlet context).
