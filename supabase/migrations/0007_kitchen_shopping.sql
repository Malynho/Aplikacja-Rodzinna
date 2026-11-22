-- 0007: Kitchen module, stage 1 (shopping): products catalog + shopping list,
-- soft deletion, Realtime, one shared policy helper for module tables.

-- ---------- Shared helpers ----------

-- Creates the standard policies for a table with a family_id column:
-- read needs module access "read", write needs "write". with_delete = false keeps hard
-- DELETE closed for clients (tables that use soft deletion via deleted_at).
create function public.apply_module_policies(tbl text, module_name text, with_delete boolean default true)
returns void language plpgsql as $$
begin
  execute format('alter table public.%I enable row level security', tbl);
  execute format(
    'create policy %I on public.%I for select using (public.has_module_access(family_id, %L, ''read''))',
    tbl || '_select', tbl, module_name);
  execute format(
    'create policy %I on public.%I for insert with check (public.has_module_access(family_id, %L, ''write''))',
    tbl || '_insert', tbl, module_name);
  execute format(
    'create policy %I on public.%I for update using (public.has_module_access(family_id, %L, ''write'')) '
    'with check (public.has_module_access(family_id, %L, ''write''))',
    tbl || '_update', tbl, module_name, module_name);
  if with_delete then
    execute format(
      'create policy %I on public.%I for delete using (public.has_module_access(family_id, %L, ''write''))',
      tbl || '_delete', tbl, module_name);
  end if;
end;
$$;

-- Only migrations (table owner) may call it.
revoke execute on function public.apply_module_policies(text, text, boolean) from public, anon, authenticated;

create function public.touch_updated_at() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- ---------- products: family catalog (shared by shopping, pantry, recipes later) ----------

-- Starter products have seed_key (name comes from the translation files) and name = null;
-- custom products have a name. deleted_at = archived.
create table public.products (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  name text check (char_length(name) between 1 and 60),
  seed_key text,
  emoji text not null check (char_length(emoji) between 1 and 16),
  category text not null check (category in (
    'fruitVeg', 'dairyEggs', 'bakery', 'meatFish', 'frozen',
    'pantry', 'spices', 'drinks', 'household', 'other')),
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  check (name is not null or seed_key is not null),
  unique (family_id, seed_key), -- null seed_key (custom products) never collides
  unique (id, family_id)        -- target of the composite foreign keys below
);

-- ---------- shopping_items ----------

create table public.shopping_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  product_id uuid not null,
  quantity int not null check (quantity >= 1),
  checked boolean not null default false,
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  -- the product must belong to the same family
  foreign key (product_id, family_id) references public.products (id, family_id) on delete cascade
);

-- One open (not bought, not deleted) row per product and family.
create unique index shopping_items_open_product
  on public.shopping_items (family_id, product_id)
  where checked = false and deleted_at is null;

create trigger products_touch before update on public.products
  for each row execute function public.touch_updated_at();
create trigger shopping_items_touch before update on public.shopping_items
  for each row execute function public.touch_updated_at();

-- ---------- RLS: permission "kitchen"; no hard DELETE (soft deletion only) ----------

select public.apply_module_policies('products', 'kitchen', false);
select public.apply_module_policies('shopping_items', 'kitchen', false);

-- ---------- Quantity changes (atomic, so two phones never overwrite each other) ----------

-- delta > 0: adds a row or increases the open one. delta < 0: decreases it; when it would drop
-- below 1 the row is soft-deleted instead (quantity stays, so it can be restored).
-- security invoker: the caller's RLS applies (needs "write").
create function public.change_shopping_quantity(fid uuid, pid uuid, delta int) returns void
language plpgsql as $$
begin
  if delta > 0 then
    insert into public.shopping_items (family_id, product_id, quantity)
    values (fid, pid, delta)
    on conflict (family_id, product_id) where checked = false and deleted_at is null
    do update set quantity = public.shopping_items.quantity + excluded.quantity;
  else
    update public.shopping_items
    set deleted_at = case when quantity + delta < 1 then now() else null end,
        quantity = case when quantity + delta < 1 then quantity else quantity + delta end
    where family_id = fid and product_id = pid and checked = false and deleted_at is null;
  end if;
end;
$$;

revoke execute on function public.change_shopping_quantity(uuid, uuid, int) from public, anon;
grant execute on function public.change_shopping_quantity(uuid, uuid, int) to authenticated;

-- ---------- Realtime ----------

-- Soft deletion only produces UPDATEs, but full identity also delivers the old row values.
alter table public.products replica identity full;
alter table public.shopping_items replica identity full;
alter publication supabase_realtime add table public.products, public.shopping_items;
