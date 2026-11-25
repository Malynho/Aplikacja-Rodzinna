-- 0012: home state of the family (public holidays on the start page).
-- No new policy needed: families_update already limits changes to family admins.

alter table public.families
  add column home_state text not null default 'DE-HE'
  check (home_state in (
    'DE-BB', 'DE-BE', 'DE-BW', 'DE-BY', 'DE-HB', 'DE-HE', 'DE-HH', 'DE-MV',
    'DE-NI', 'DE-NW', 'DE-RP', 'DE-SH', 'DE-SL', 'DE-SN', 'DE-ST', 'DE-TH'
  ));
