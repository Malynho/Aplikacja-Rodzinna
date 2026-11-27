-- 0018: To-do, phase 1. Visibility policies (private / family), todos, default permissions for the new
-- modules, and what happens to a leaving member's family content.

-- ---------- Default permissions: calendar, todo and notes (write) for every member ----------

-- Generalises default_calendar_permission() (0013). An admin can change it in the permission matrix.
create function public.default_member_permissions() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  insert into public.module_permissions (family_id, user_id, module, access)
  select new.family_id, new.user_id, m, 'write' from unnest(array['calendar', 'todo', 'notes']) as m
  on conflict do nothing;
  return new;
end;
$$;

drop trigger family_members_default_calendar on public.family_members;
drop function public.default_calendar_permission();

create trigger family_members_default_permissions after insert on public.family_members
  for each row when (new.role = 'member') execute function public.default_member_permissions();

-- existing members (admins need no rows)
insert into public.module_permissions (family_id, user_id, module, access)
select f.family_id, f.user_id, m, 'write'
from public.family_members f, unnest(array['calendar', 'todo', 'notes']) as m
where f.role = 'member'
on conflict do nothing;

-- ---------- One definition of "private or family" policies ----------

-- For tables with family_id, owner_user_id and visibility (no hard DELETE: soft deletion via deleted_at).
--  read:   family rows, and the user's own private rows. Admins do NOT see other people's private rows.
--  insert: only as yourself (owner = auth.uid()), needs "write".
--  update: needs "write"; family rows by any member, private rows by the owner. WITH CHECK means a non-owner
--          can never turn a family row private (they could not see it any more).
create function public.apply_visibility_policies(tbl text, module_name text) returns void
language plpgsql as $$
begin
  execute format('alter table public.%I enable row level security', tbl);
  execute format(
    'create policy %I on public.%I for select using (public.has_module_access(family_id, %L, ''read'') '
    'and (visibility = ''family'' or owner_user_id = auth.uid()))',
    tbl || '_select', tbl, module_name);
  execute format(
    'create policy %I on public.%I for insert with check (owner_user_id = auth.uid() '
    'and public.has_module_access(family_id, %L, ''write''))',
    tbl || '_insert', tbl, module_name);
  execute format(
    'create policy %I on public.%I for update '
    'using (public.has_module_access(family_id, %L, ''write'') and (visibility = ''family'' or owner_user_id = auth.uid())) '
    'with check (public.has_module_access(family_id, %L, ''write'') and (visibility = ''family'' or owner_user_id = auth.uid()))',
    tbl || '_update', tbl, module_name, module_name);
end;
$$;

revoke execute on function public.apply_visibility_policies(text, text) from public, anon, authenticated;

-- ---------- todos ----------

create table public.todos (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  owner_user_id uuid not null,
  visibility text not null default 'family' check (visibility in ('private', 'family')),
  title text not null check (char_length(title) between 1 and 200),
  details text check (char_length(details) <= 2000),
  due_date date,                                               -- a plain date: no time zone problems
  priority smallint not null default 0 check (priority between 0 and 3),   -- 0 none, 1 low, 2 medium, 3 high
  assignee_user_id uuid,
  done_at timestamptz,                                         -- done = not null
  done_by uuid references auth.users (id) on delete set null,  -- set by the server
  sort int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, family_id),
  foreign key (family_id, owner_user_id) references public.family_members (family_id, user_id) on delete cascade,
  foreign key (family_id, assignee_user_id) references public.family_members (family_id, user_id) on delete set null (assignee_user_id),
  -- a private to-do can only be assigned to its owner (nobody else can see it)
  check (visibility = 'family' or assignee_user_id is null or assignee_user_id = owner_user_id)
);

create index todos_open on public.todos (family_id, due_date) where deleted_at is null and done_at is null;
create index todos_assignee on public.todos (family_id, assignee_user_id) where deleted_at is null;

-- Family and owner never change, except when a leaving member's family content is handed to an admin (below).
create function public.todos_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.family_id <> old.family_id then
    raise exception 'forbidden';
  end if;
  if new.owner_user_id <> old.owner_user_id and coalesce(current_setting('app.reassign', true), '') <> 'on' then
    raise exception 'forbidden';
  end if;
  if new.done_at is distinct from old.done_at then   -- who ticked it is decided by the server
    new.done_by := case when new.done_at is null then null else auth.uid() end;
  end if;
  return new;
end;
$$;

create trigger todos_guard before update on public.todos for each row execute function public.todos_guard();
create trigger todos_touch before update on public.todos for each row execute function public.touch_updated_at();

select public.apply_visibility_policies('todos', 'todo');

alter table public.todos replica identity full;
alter publication supabase_realtime add table public.todos;

-- ---------- A leaving member: family content goes to an admin, private content goes with them ----------

-- Before a member row is deleted (removed by an admin, or the account is deleted) their FAMILY to-dos get an admin as
-- owner (the family creator if still an admin, otherwise the first admin); their private rows are deleted by the
-- foreign key cascade. security definer: the update must not depend on the caller's policies. Later migrations add
-- their tables (todo_lists, notes) with "create or replace".
create function public.reassign_family_content() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  new_owner uuid;
begin
  select m.user_id into new_owner
  from public.family_members m
  where m.family_id = old.family_id and m.role = 'admin' and m.user_id <> old.user_id
  order by (m.user_id = (select f.created_by from public.families f where f.id = old.family_id)) desc nulls last, m.user_id
  limit 1;
  if new_owner is null then
    return old;
  end if;

  perform set_config('app.reassign', 'on', true);   -- lets the guards accept the owner change (this transaction only)
  update public.todos set owner_user_id = new_owner
  where family_id = old.family_id and owner_user_id = old.user_id and visibility = 'family';
  perform set_config('app.reassign', 'off', true);
  return old;
end;
$$;

create trigger family_members_reassign before delete on public.family_members
  for each row execute function public.reassign_family_content();
