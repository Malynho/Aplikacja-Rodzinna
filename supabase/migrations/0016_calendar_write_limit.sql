-- 0016: rate limit for writing calendar events (create / update / delete), per person and hour.
-- Same pattern as claim_calendar_check (0013).

-- RLS on and NO policies, no table privileges: only claim_calendar_write() touches it.
create table public.calendar_write_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  hour timestamptz not null,
  writes int not null default 0,
  primary key (user_id, hour)
);

alter table public.calendar_write_usage enable row level security;
revoke all on public.calendar_write_usage from anon, authenticated;

-- Permission check ("calendar" write) and the atomic hourly limit in one call. Raises 'forbidden' or 'limit_reached'.
create function public.claim_calendar_write(fid uuid, per_hour int default 60) returns int
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  if not public.has_module_access(fid, 'calendar', 'write') then
    raise exception 'forbidden';
  end if;

  delete from public.calendar_write_usage where user_id = auth.uid() and hour < now() - interval '1 day';

  insert into public.calendar_write_usage (user_id, hour, writes)
  values (auth.uid(), date_trunc('hour', now()), 1)
  on conflict (user_id, hour) do update set writes = public.calendar_write_usage.writes + 1
  where public.calendar_write_usage.writes < per_hour
  returning writes into n;

  if n is null then
    raise exception 'limit_reached';
  end if;
  return per_hour - n;
end;
$$;

revoke execute on function public.claim_calendar_write(uuid, int) from public, anon;
grant execute on function public.claim_calendar_write(uuid, int) to authenticated;
