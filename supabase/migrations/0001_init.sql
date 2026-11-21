-- 0001: profiles, families, members, per-module permissions, helper functions, RLS.
-- Module tables (shopping_items, todos, notes) come in their own migrations.

-- ---------- Tables ----------

create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now()
);

create table public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now()
);

create table public.family_members (
  family_id uuid not null references public.families (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('admin', 'member')),
  primary key (family_id, user_id)
);

-- One row per member and module. Admins need no rows: they get full access.
-- The "admin" (Verwaltung) module is admin-only and is not listed here.
create table public.module_permissions (
  family_id uuid not null,
  user_id uuid not null,
  module text not null check (module in ('shopping', 'todo', 'notes')),
  access text not null check (access in ('none', 'read', 'write')),
  primary key (family_id, user_id, module),
  foreign key (family_id, user_id) references public.family_members (family_id, user_id) on delete cascade
);

-- ---------- Helper functions (security definer avoids RLS recursion) ----------

create function public.is_family_member(fid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.family_members where family_id = fid and user_id = auth.uid()
  );
$$;

create function public.is_family_admin(fid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.family_members
    where family_id = fid and user_id = auth.uid() and role = 'admin'
  );
$$;

-- level: 'read' (satisfied by read or write) or 'write'.
create function public.has_module_access(fid uuid, mod text, level text) returns boolean
language sql stable security definer set search_path = '' as $$
  select public.is_family_admin(fid) or exists (
    select 1 from public.module_permissions
    where family_id = fid and user_id = auth.uid() and module = mod
      and (access = 'write' or (access = 'read' and level = 'read'))
  );
$$;

create function public.shares_family_with(uid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1
    from public.family_members a
    join public.family_members b on a.family_id = b.family_id
    where a.user_id = auth.uid() and b.user_id = uid
  );
$$;

-- ---------- Triggers ----------

-- Create a profile for every new auth user (name/avatar come from Google).
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'full_name', new.raw_user_meta_data ->> 'name'),
    new.raw_user_meta_data ->> 'avatar_url'
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- The creator of a family becomes its admin.
create function public.handle_new_family() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.family_members (family_id, user_id, role)
  values (new.id, new.created_by, 'admin');
  return new;
end;
$$;

create trigger on_family_created
  after insert on public.families
  for each row execute function public.handle_new_family();

-- ---------- Row Level Security ----------

alter table public.profiles enable row level security;
alter table public.families enable row level security;
alter table public.family_members enable row level security;
alter table public.module_permissions enable row level security;

-- profiles: own profile + members of shared families; edit only your own.
create policy profiles_select on public.profiles for select
  using (id = auth.uid() or public.shares_family_with(id));
create policy profiles_update on public.profiles for update
  using (id = auth.uid()) with check (id = auth.uid());

-- families: members read; any signed-in user creates; admins change/delete.
create policy families_select on public.families for select
  using (public.is_family_member(id) or created_by = auth.uid());
create policy families_insert on public.families for insert
  with check (created_by = auth.uid());
create policy families_update on public.families for update
  using (public.is_family_admin(id));
create policy families_delete on public.families for delete
  using (public.is_family_admin(id));

-- family_members: members read; only admins manage.
create policy members_select on public.family_members for select
  using (public.is_family_member(family_id));
create policy members_insert on public.family_members for insert
  with check (public.is_family_admin(family_id));
create policy members_update on public.family_members for update
  using (public.is_family_admin(family_id));
create policy members_delete on public.family_members for delete
  using (public.is_family_admin(family_id));

-- module_permissions: a member sees own rows, admins see and manage all.
create policy perms_select on public.module_permissions for select
  using (user_id = auth.uid() or public.is_family_admin(family_id));
create policy perms_insert on public.module_permissions for insert
  with check (public.is_family_admin(family_id));
create policy perms_update on public.module_permissions for update
  using (public.is_family_admin(family_id));
create policy perms_delete on public.module_permissions for delete
  using (public.is_family_admin(family_id));
