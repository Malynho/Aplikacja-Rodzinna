-- 0015: calendar filter chosen on the start page (the same on phone and computer).
-- A list of calendar_links ids that are switched on; null = default (shared + own calendars).
-- No new policy: profiles_update already limits changes to the own row.

alter table public.profiles add column calendar_filter jsonb
  check (calendar_filter is null
         or (jsonb_typeof(calendar_filter) = 'array' and jsonb_array_length(calendar_filter) <= 50));
