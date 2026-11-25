-- 0014: Google sign-in (OAuth) for calendars instead of a service account.
-- calendar_links is empty in production, so it is reshaped in place: every link belongs to the person
-- whose token reads it. Events are still read live from Google and never stored.

-- ---------- Encrypted refresh tokens ----------

create table public.google_tokens (
  user_id uuid primary key references auth.users (id) on delete cascade,
  refresh_token_enc text not null,                  -- AES-GCM: base64(iv || ciphertext); the key lives only in the function
  key_version int not null default 1,               -- for key rotation
  scopes text not null default '',                  -- what Google granted
  status text not null default 'ok' check (status in ('ok', 'revoked')),
  connected_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- RLS on, NO policies and no table privileges: clients can neither read nor write it.
-- Only the Edge Function (service role) touches it.
alter table public.google_tokens enable row level security;
revoke all on public.google_tokens from anon, authenticated;

-- ---------- calendar_links: one owner per link ----------

alter table public.calendar_links
  drop constraint calendar_links_check,                        -- (owner is not null or visibility = 'family')
  alter column owner_user_id set not null,
  add column shared boolean not null default false,            -- the family calendar ("Rodzina"), registered by an admin
  add column access_role text check (access_role in ('owner', 'writer', 'reader')),  -- from Google, for later writing
  add constraint calendar_links_shared_family check (not shared or visibility = 'family');

drop policy calendar_links_select on public.calendar_links;
drop policy calendar_links_insert on public.calendar_links;
drop policy calendar_links_update on public.calendar_links;
drop policy calendar_links_delete on public.calendar_links;
drop function public.can_manage_calendar(uuid, uuid);

-- Owners manage their own links (needs "write"); admins additionally manage the shared ones.
create function public.can_manage_calendar(fid uuid, owner uuid, is_shared boolean) returns boolean
language sql stable security definer set search_path = '' as $$
  select case
    when is_shared then public.is_family_admin(fid)
                        or (owner = auth.uid() and public.has_module_access(fid, 'calendar', 'write'))
    else owner = auth.uid() and public.has_module_access(fid, 'calendar', 'write')
  end;
$$;

-- Read: family-visible links (shared ones always are) and the user's own. A private calendar is seen by its
-- owner only: not by other members and not by admins.
create policy calendar_links_select on public.calendar_links for select
  using (
    public.has_module_access(family_id, 'calendar', 'read')
    and (visibility = 'family' or owner_user_id = auth.uid())
  );

-- A link is always registered under the registering person's own name (their token reads it);
-- a shared one needs an admin.
create policy calendar_links_insert on public.calendar_links for insert
  with check (
    owner_user_id = auth.uid()
    and public.can_manage_calendar(family_id, owner_user_id, shared)
    and (not shared or public.is_family_admin(family_id))
  );
create policy calendar_links_update on public.calendar_links for update
  using (public.can_manage_calendar(family_id, owner_user_id, shared))
  with check (public.can_manage_calendar(family_id, owner_user_id, shared));
create policy calendar_links_delete on public.calendar_links for delete
  using (public.can_manage_calendar(family_id, owner_user_id, shared));

-- What may change: the label by whoever manages the link; everything about the connection to Google
-- (calendar, visibility, role) only by the owner; family, owner and "shared" never.
create or replace function public.calendar_links_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.family_id <> old.family_id or new.owner_user_id <> old.owner_user_id or new.shared <> old.shared then
    raise exception 'forbidden';
  end if;
  if (new.google_calendar_id <> old.google_calendar_id or new.visibility <> old.visibility
      or new.access_role is distinct from old.access_role) and old.owner_user_id <> auth.uid() then
    raise exception 'forbidden';
  end if;
  return new;
end;
$$;
