-- 0008: Kitchen module, stage 2a: pantry (Soll/Ist).
-- Bought shopping items raise Ist; a falling Ist puts the shortage (Soll - Ist) on the shopping list.

-- ---------- pantry_items ----------

-- ist = what we have, soll = target stock, min_qty = "running low" marker (used by the UI only).
create table public.pantry_items (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  product_id uuid not null,
  ist int not null default 0 check (ist >= 0),
  soll int not null default 0 check (soll >= 0),
  min_qty int not null default 0 check (min_qty >= 0),
  updated_at timestamptz not null default now(),
  updated_by uuid references auth.users (id) default auth.uid(),
  unique (family_id, product_id),
  -- the product must belong to the same family
  foreign key (product_id, family_id) references public.products (id, family_id) on delete cascade
);

-- The server decides who changed the row and when; clients cannot set these.
create function public.pantry_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at = now();
  new.updated_by = auth.uid();
  return new;
end;
$$;

create trigger pantry_items_touch before insert or update on public.pantry_items
  for each row execute function public.pantry_touch();

-- Same module permission as the rest of the Kitchen; no hard DELETE for clients.
select public.apply_module_policies('pantry_items', 'kitchen', false);

-- ---------- Changing Ist ----------

-- Atomic +/- on Ist (never below 0). security invoker: the caller's RLS applies (needs "write").
create function public.change_pantry_ist(fid uuid, pid uuid, delta int) returns void
language plpgsql as $$
begin
  insert into public.pantry_items (family_id, product_id, ist)
  values (fid, pid, greatest(delta, 0))
  on conflict (family_id, product_id)
  do update set ist = greatest(public.pantry_items.ist + delta, 0);
end;
$$;

-- ---------- Shortages -> shopping list ----------

-- Puts the open shopping item of every product with Soll > Ist on Soll - Ist (one open row per product,
-- no duplicates; an existing row gets the quantity set, not added). pid = null: all products of the family.
-- Returns how many rows were added or changed.
create function public.add_pantry_shortages(fid uuid, pid uuid default null) returns int
language plpgsql as $$
declare
  n int;
begin
  insert into public.shopping_items (family_id, product_id, quantity)
  select i.family_id, i.product_id, i.soll - i.ist
  from public.pantry_items i
  join public.products p on p.id = i.product_id and p.family_id = i.family_id and p.deleted_at is null
  where i.family_id = fid
    and (pid is null or i.product_id = pid)
    and i.soll > 0 and i.soll > i.ist
  on conflict (family_id, product_id) where checked = false and deleted_at is null
  do update set quantity = excluded.quantity
  where public.shopping_items.quantity is distinct from excluded.quantity;
  get diagnostics n = row_count;
  return n;
end;
$$;

-- Automatic shortage: only when Ist FALLS (not on a rise, not on a change of Soll/Min alone).
-- It only sets shopping_items.quantity, never "checked", so the trigger below is not fired again.
create function public.pantry_shortage_to_shopping() returns trigger
language plpgsql as $$
begin
  perform public.add_pantry_shortages(new.family_id, new.product_id);
  return null;
end;
$$;

create trigger pantry_items_shortage after update of ist on public.pantry_items
  for each row when (new.ist < old.ist) execute function public.pantry_shortage_to_shopping();

-- ---------- Bought -> Ist ----------

-- Ticking an item (checked false -> true) raises Ist by its quantity; unticking (undo) lowers it again.
-- A raised Ist does not fire the shortage trigger (it needs a fall), so there is no loop.
create function public.shopping_bought_to_pantry() returns trigger
language plpgsql as $$
begin
  perform public.change_pantry_ist(
    new.family_id, new.product_id,
    case when new.checked then new.quantity else -new.quantity end);
  return null;
end;
$$;

create trigger shopping_items_pantry after update of checked on public.shopping_items
  for each row when (old.checked is distinct from new.checked)
  execute function public.shopping_bought_to_pantry();

revoke execute on function public.change_pantry_ist(uuid, uuid, int) from public, anon;
revoke execute on function public.add_pantry_shortages(uuid, uuid) from public, anon;
grant execute on function public.change_pantry_ist(uuid, uuid, int) to authenticated;
grant execute on function public.add_pantry_shortages(uuid, uuid) to authenticated;

-- ---------- Realtime ----------

alter table public.pantry_items replica identity full;
alter publication supabase_realtime add table public.pantry_items;
