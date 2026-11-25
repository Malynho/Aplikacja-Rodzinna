-- 0013: "calendar" permission, calendar links, check limit.
-- Events are read live from Google (service account) and never stored here.

-- ---------- Permission "calendar" ----------

alter table public.module_permissions drop constraint module_permissions_module_check;
alter table public.module_permissions
  add constraint module_permissions_module_check check (module in ('kitchen', 'todo', 'notes', 'calendar'));

-- Existing members get write access (admins need no rows).
insert into public.module_permissions (family_id, user_id, module, access)
select family_id, user_id, 'calendar', 'write' from public.family_members where role = 'member'
on conflict do nothing;

-- New members (invitations) start with write access too; an admin can change it in the permission matrix.
create function public.default_calendar_permission() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.module_permissions (family_id, user_id, module, access)
  values (new.family_id, new.user_id, 'calendar', 'write')
  on conflict do nothing;
  return new;
end;
$$;

create trigger family_members_default_calendar after insert on public.family_members
  for each row when (new.role = 'member') execute function public.default_calendar_permission();

-- ---------- calendar_links ----------

create table public.calendar_links (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  google_calendar_id text not null check (char_length(google_calendar_id) between 3 and 254),
  label text not null check (char_length(label) between 1 and 60),
  owner_user_id uuid,                                      -- null = shared family calendar
  visibility text not null default 'private' check (visibility in ('private', 'family')),
  created_at timestamptz not null default now(),
  unique (family_id, google_calendar_id),                  -- one registration per calendar (see CLAUDE.md)
  foreign key (family_id, owner_user_id) references public.family_members (family_id, user_id) on delete cascade,
  check (owner_user_id is not null or visibility = 'family')  -- a shared calendar is always visible to the family
);

-- Who manages a link: admins the shared ones (owner is null), owners their own (needs "write").
create function public.can_manage_calendar(fid uuid, owner uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when owner is null then public.is_family_admin(fid)
    else owner = auth.uid() and public.has_module_access(fid, 'calendar', 'write')
  end;
$$;

alter table public.calendar_links enable row level security;

-- Read: shared rows, family-visible rows and the user's own rows. A private personal calendar is seen by
-- its owner only: not by other members and not by admins (no ID, no events).
create policy calendar_links_select on public.calendar_links for select
  using (
    public.has_module_access(family_id, 'calendar', 'read')
    and (owner_user_id is null or visibility = 'family' or owner_user_id = auth.uid())
  );
create policy calendar_links_insert on public.calendar_links for insert
  with check (public.can_manage_calendar(family_id, owner_user_id));
create policy calendar_links_update on public.calendar_links for update
  using (public.can_manage_calendar(family_id, owner_user_id))
  with check (public.can_manage_calendar(family_id, owner_user_id));
create policy calendar_links_delete on public.calendar_links for delete
  using (public.can_manage_calendar(family_id, owner_user_id));

-- The owner of a link never changes (delete it and add a new one instead).
create function public.calendar_links_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.family_id <> old.family_id or new.owner_user_id is distinct from old.owner_user_id then
    raise exception 'forbidden';
  end if;
  return new;
end;
$$;

create trigger calendar_links_guard before update on public.calendar_links
  for each row execute function public.calendar_links_guard();

-- ---------- Limit of connection tests per person ----------

-- Tests per person and hour. RLS is on and there are no policies: only claim_calendar_check() touches it.
create table public.calendar_check_usage (
  user_id uuid not null references auth.users (id) on delete cascade,
  hour timestamptz not null,
  checks int not null default 0,
  primary key (user_id, hour)
);

alter table public.calendar_check_usage enable row level security;

-- Permission check ("calendar" read) and the atomic hourly limit in one call. Raises 'forbidden' or 'limit_reached'.
create function public.claim_calendar_check(fid uuid, per_hour int default 20) returns int
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  if not public.has_module_access(fid, 'calendar', 'read') then
    raise exception 'forbidden';
  end if;

  delete from public.calendar_check_usage where user_id = auth.uid() and hour < now() - interval '1 day';

  insert into public.calendar_check_usage (user_id, hour, checks)
  values (auth.uid(), date_trunc('hour', now()), 1)
  on conflict (user_id, hour) do update set checks = public.calendar_check_usage.checks + 1
  where public.calendar_check_usage.checks < per_hour
  returning checks into n;

  if n is null then
    raise exception 'limit_reached';
  end if;
  return per_hour - n;
end;
$$;

revoke execute on function public.claim_calendar_check(uuid, int) from public, anon;
grant execute on function public.claim_calendar_check(uuid, int) to authenticated;
