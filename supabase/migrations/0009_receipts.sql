-- 0009: Kitchen module, stage 2c: receipt scanning.
-- receipt_aliases (learned receipt text -> product), a daily scan limit and apply_receipt().

-- ---------- receipt_aliases ----------

-- What a receipt line looked like (normalized text) -> which product it is. Learned per family.
create table public.receipt_aliases (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  alias_text text not null check (char_length(alias_text) between 1 and 80),
  product_id uuid not null,
  updated_at timestamptz not null default now(),
  unique (family_id, alias_text),
  -- the product must belong to the same family
  foreign key (product_id, family_id) references public.products (id, family_id) on delete cascade
);

create trigger receipt_aliases_touch before update on public.receipt_aliases
  for each row execute function public.touch_updated_at();

-- Same module permission as the rest of the Kitchen. Hard DELETE stays allowed (no soft delete here).
select public.apply_module_policies('receipt_aliases', 'kitchen', true);

-- ---------- Daily scan limit ----------

-- Scans per family and day. RLS is on and there are no policies: only claim_receipt_scan() touches it.
create table public.receipt_scan_usage (
  family_id uuid not null references public.families (id) on delete cascade,
  day date not null,
  scans int not null default 0,
  primary key (family_id, day)
);

alter table public.receipt_scan_usage enable row level security;

-- Permission check ("write" on kitchen) and the atomic daily limit in one call.
-- Returns how many scans are left today. Raises 'forbidden' or 'limit_reached'.
create function public.claim_receipt_scan(fid uuid, daily_limit int default 20) returns int
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  if not public.has_module_access(fid, 'kitchen', 'write') then
    raise exception 'forbidden';
  end if;

  insert into public.receipt_scan_usage (family_id, day, scans)
  values (fid, (now() at time zone 'Europe/Berlin')::date, 1)
  on conflict (family_id, day) do update set scans = public.receipt_scan_usage.scans + 1
  where public.receipt_scan_usage.scans < daily_limit
  returning scans into n;

  if n is null then
    raise exception 'limit_reached';
  end if;
  return daily_limit - n;
end;
$$;

-- ---------- Applying a confirmed receipt ----------

-- lines = [{ product_id | new_product: {name, emoji, category}, quantity, alias? }]
-- Everything happens in one transaction. security invoker: the caller's RLS applies;
-- the explicit check below only gives a clear error instead of silently filtered rows.
create function public.apply_receipt(fid uuid, lines jsonb) returns jsonb
language plpgsql as $$
declare
  l record;
  pid uuid;
  q int;
  sid uuid;
  sqty int;
  cleared int := 0;
  reduced int := 0;
  touched int := 0;
begin
  if not public.has_module_access(fid, 'kitchen', 'write') then
    raise exception 'forbidden';
  end if;
  if jsonb_typeof(lines) <> 'array' or jsonb_array_length(lines) > 100 then
    raise exception 'invalid_lines';
  end if;

  for l in
    select * from jsonb_to_recordset(lines)
      as x(product_id uuid, new_product jsonb, quantity int, alias text)
  loop
    q := l.quantity;
    if q is null or q < 1 or q > 999 then
      raise exception 'invalid_quantity';
    end if;

    pid := l.product_id;
    if pid is null and jsonb_typeof(l.new_product) = 'object' then
      -- a new custom product, created in the same transaction
      insert into public.products (family_id, name, emoji, category)
      values (fid, l.new_product ->> 'name', l.new_product ->> 'emoji', l.new_product ->> 'category')
      returning id into pid;
    end if;
    if pid is null or not exists (
      select 1 from public.products where id = pid and family_id = fid and deleted_at is null
    ) then
      raise exception 'unknown_product';
    end if;

    -- the open (not bought, not deleted) shopping item of this product, if any
    select id, quantity into sid, sqty
    from public.shopping_items
    where family_id = fid and product_id = pid and checked = false and deleted_at is null
    for update;

    if sid is not null and q >= sqty then
      -- Bought in full: the trigger shopping_items_pantry raises Ist by sqty, so only the surplus is added here.
      update public.shopping_items set checked = true, deleted_at = now() where id = sid;
      if q > sqty then
        perform public.change_pantry_ist(fid, pid, q - sqty);
      end if;
      cleared := cleared + 1;
    elsif sid is not null then
      -- Bought less than listed: Ist += bought, the list quantity goes down (the "checked" column is not touched).
      perform public.change_pantry_ist(fid, pid, q);
      update public.shopping_items set quantity = sqty - q where id = sid;
      reduced := reduced + 1;
    else
      perform public.change_pantry_ist(fid, pid, q);
    end if;
    touched := touched + 1;

    -- learn the alias (the client sends it only for lines the user matched or corrected)
    if nullif(btrim(l.alias), '') is not null then
      insert into public.receipt_aliases (family_id, alias_text, product_id)
      values (fid, left(lower(regexp_replace(btrim(l.alias), '\s+', ' ', 'g')), 80), pid)
      on conflict (family_id, alias_text) do update set product_id = excluded.product_id;
    end if;
  end loop;

  return jsonb_build_object('cleared', cleared, 'reduced', reduced, 'pantry', touched);
end;
$$;

revoke execute on function public.claim_receipt_scan(uuid, int) from public, anon;
revoke execute on function public.apply_receipt(uuid, jsonb) from public, anon;
grant execute on function public.claim_receipt_scan(uuid, int) to authenticated;
grant execute on function public.apply_receipt(uuid, jsonb) to authenticated;
