-- 0004: invitations (one-time token, 7 days), only the first user may create a family,
-- admins can remove only plain members.

-- ---------- Invitations ----------

-- Only the SHA-256 hash of the token is stored; the token itself is shown once on creation.
create table public.invitations (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  token_hash text not null unique,
  created_by uuid not null default auth.uid() references auth.users (id),
  expires_at timestamptz not null,
  used_at timestamptz,
  used_by uuid references auth.users (id),
  created_at timestamptz not null default now()
);

alter table public.invitations enable row level security;

-- Admins list and revoke invitations. No INSERT/UPDATE policies: clients use the functions below.
create policy invitations_select on public.invitations for select
  using (public.is_family_admin(family_id));
create policy invitations_delete on public.invitations for delete
  using (public.is_family_admin(family_id));

-- Admin only. Returns the plain token once; it is valid for 7 days and works a single time.
create function public.create_invitation(fid uuid) returns text
language plpgsql security definer set search_path = '' as $$
declare
  tok text;
begin
  if not public.is_family_admin(fid) then
    raise exception 'forbidden';
  end if;
  tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.invitations (family_id, token_hash, expires_at)
  values (fid, encode(sha256(convert_to(tok, 'utf8')), 'hex'), now() + interval '7 days');
  return tok;
end;
$$;

-- Signed-in user joins the family as a member. One generic error for every failure reason.
create function public.accept_invitation(tok text) returns uuid
language plpgsql security definer set search_path = '' as $$
declare
  inv public.invitations;
begin
  if auth.uid() is null then
    raise exception 'invalid_invitation';
  end if;

  select * into inv from public.invitations
  where token_hash = encode(sha256(convert_to(tok, 'utf8')), 'hex')
    and used_at is null
    and expires_at > now()
  for update;

  if not found then
    raise exception 'invalid_invitation';
  end if;

  insert into public.family_members (family_id, user_id, role)
  values (inv.family_id, auth.uid(), 'member')
  on conflict do nothing;

  update public.invitations set used_at = now(), used_by = auth.uid() where id = inv.id;
  return inv.family_id;
end;
$$;

revoke execute on function public.create_invitation(uuid) from public, anon;
revoke execute on function public.accept_invitation(text) from public, anon;
grant execute on function public.create_invitation(uuid) to authenticated;
grant execute on function public.accept_invitation(text) to authenticated;

-- ---------- Only the first user can create a family ----------

-- security definer: the families SELECT policy would hide other families from the caller.
create function public.no_family_exists() returns boolean
language sql stable security definer set search_path = '' as $$
  select not exists (select 1 from public.families);
$$;

drop policy families_insert on public.families;
create policy families_insert on public.families for insert
  with check (created_by = auth.uid() and public.no_family_exists());

-- ---------- Admins remove only plain members (never themselves or another admin) ----------

drop policy members_delete on public.family_members;
create policy members_delete on public.family_members for delete
  using (public.is_family_admin(family_id) and role = 'member' and user_id <> auth.uid());
