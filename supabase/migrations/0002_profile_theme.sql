-- 0002: remember the chosen theme per user (null = not chosen yet, keep the local setting).
-- Existing profiles_update policy already lets users change their own row.
alter table public.profiles
  add column theme text check (theme in ('light', 'dark', 'system'));
