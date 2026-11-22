-- 0010: optional package size per product ("1 kg", "500 ml", "6 pcs").
-- Ist / Soll / Min and the shopping list keep counting PACKS (integers); the triggers from 0008/0009 are unchanged.

alter table public.products
  add column pack_size numeric(10, 3) check (pack_size > 0 and pack_size <= 100000),
  add column pack_unit text check (pack_unit in ('g', 'kg', 'ml', 'l', 'pcs')),
  -- size and unit are set together or not at all
  add constraint products_pack_complete check ((pack_size is null) = (pack_unit is null));

-- apply_receipt: identical to 0009 except that a new product may carry a package size.
-- (create or replace keeps the existing grants.)
create or replace function public.apply_receipt(fid uuid, lines jsonb) returns jsonb
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
      -- a new custom product, created in the same transaction (with an optional package size)
      insert into public.products (family_id, name, emoji, category, pack_size, pack_unit)
      values (
        fid,
        l.new_product ->> 'name',
        l.new_product ->> 'emoji',
        l.new_product ->> 'category',
        (l.new_product ->> 'pack_size')::numeric,
        l.new_product ->> 'pack_unit'
      )
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
