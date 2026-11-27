-- 0019: Recipe import, phase 1 (text and photos). Learned ingredient aliases, a daily import limit and
-- save_recipe_import(): one transaction that validates everything, creates new products, learns aliases and
-- saves the recipe. (The Edge Function import-recipe only reads; nothing is written before the user confirms.)

-- ---------- ingredient_aliases ----------

-- What an ingredient line looked like (normalized text) -> which product it is. Learned per family.
-- Separate from receipt_aliases on purpose: a receipt abbreviation must not steer recipe matching and vice versa.
create table public.ingredient_aliases (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  alias_text text not null check (char_length(alias_text) between 1 and 80),
  product_id uuid not null,
  updated_at timestamptz not null default now(),
  unique (family_id, alias_text),
  -- the product must belong to the same family
  foreign key (product_id, family_id) references public.products (id, family_id) on delete cascade
);

create trigger ingredient_aliases_touch before update on public.ingredient_aliases
  for each row execute function public.touch_updated_at();

-- Same module permission as the rest of the Kitchen (read / write); hard DELETE stays allowed.
select public.apply_module_policies('ingredient_aliases', 'kitchen', true);

-- ---------- Daily import limit ----------

-- Imports per family and day. RLS is on and there are no policies: only claim_recipe_import() touches it.
create table public.recipe_import_usage (
  family_id uuid not null references public.families (id) on delete cascade,
  day date not null,
  imports int not null default 0,
  primary key (family_id, day)
);

alter table public.recipe_import_usage enable row level security;

-- Permission check ("write" on kitchen) and the atomic daily limit in one call.
-- Default 5 per family and day (the Edge Function passes RECIPE_IMPORT_DAILY_LIMIT when that secret is set).
-- Returns how many imports are left today. Raises 'forbidden' or 'limit_reached'.
create function public.claim_recipe_import(fid uuid, daily_limit int default 5) returns int
language plpgsql security definer set search_path = '' as $$
declare
  n int;
begin
  if not public.has_module_access(fid, 'kitchen', 'write') then
    raise exception 'forbidden';
  end if;

  insert into public.recipe_import_usage (family_id, day, imports)
  values (fid, (now() at time zone 'Europe/Berlin')::date, 1)
  on conflict (family_id, day) do update set imports = public.recipe_import_usage.imports + 1
  where public.recipe_import_usage.imports < daily_limit
  returning imports into n;

  if n is null then
    raise exception 'limit_reached';
  end if;
  return daily_limit - n;
end;
$$;

revoke execute on function public.claim_recipe_import(uuid, int) from public, anon;
grant execute on function public.claim_recipe_import(uuid, int) to authenticated;

-- ---------- Saving an imported recipe ----------

-- recipe:      {title, lang, country, servings, minutes, steps, source_url}
-- ingredients: [{name, amount, unit, staple, product_id | new_product: {name, category, emoji, pack_size?, pack_unit?}, alias?}]
-- Nothing coming from the browser is trusted: every length, number, unit, category, emoji and the https-only
-- source_url is checked here, and any problem raises 'bad_request' (the transaction is rolled back, so no product,
-- alias or recipe is left behind). security INVOKER: the caller's RLS applies to every insert (needs "write" on kitchen).
create function public.save_recipe_import(fid uuid, recipe jsonb, ingredients jsonb) returns uuid
language plpgsql as $$
declare
  -- keep in sync with EMOJI_CHOICES in src/pages/kitchen/products.ts
  allowed_emoji constant text[] := array['🍎', '🍌', '🍇', '🍓', '🥕', '🥔', '🍅', '🥦', '🧅', '🥬', '🍞', '🥐', '🧀', '🥛', '🥚', '🍗', '🥩', '🐟', '🍝', '🍚', '🥫', '🧂', '🌶️', '🍯', '🍫', '🍪', '🥤', '🧃', '☕', '🍺', '🍷', '🧻', '🧴', '🧼', '🧽', '🗑️', '🔋', '💡', '🐾', '💊', '🌿', '🍕', '🧊', '🛒'];
  categories constant text[] := array['fruitVeg', 'dairyEggs', 'bakery', 'meatFish', 'frozen', 'pantry', 'spices', 'drinks', 'household', 'other'];
  units constant text[] := array['g', 'ml', 'pcs', 'tbsp', 'tsp'];
  pack_units constant text[] := array['g', 'kg', 'ml', 'l', 'pcs'];
  i jsonb;
  np jsonb;
  pid uuid;
  made jsonb := '{}'::jsonb;          -- new products created in this call (lower name -> id): no duplicates inside one import
  resolved jsonb := '[]'::jsonb;
  alias text;
  nm text;
  amount numeric;
  rid uuid;
  url text;
begin
  if not public.has_module_access(fid, 'kitchen', 'write') then
    raise exception 'forbidden';
  end if;

  begin
    if jsonb_typeof(recipe) <> 'object' or jsonb_typeof(ingredients) <> 'array' or jsonb_array_length(ingredients) > 60 then
      raise exception 'bad_request';
    end if;
    if char_length(btrim(coalesce(recipe->>'title', ''))) not between 1 and 120
       or coalesce(recipe->>'lang', '') not in ('pl', 'de')
       or (nullif(recipe->>'country', '') is not null and (recipe->>'country') !~ '^[A-Z]{2}$')
       or coalesce((recipe->>'servings')::int, 0) not between 1 and 100
       or ((recipe->>'minutes') is not null and (recipe->>'minutes')::int not between 1 and 10000)
       or char_length(coalesce(recipe->>'steps', '')) > 10000 then
      raise exception 'bad_request';
    end if;
    url := nullif(btrim(coalesce(recipe->>'source_url', '')), '');
    if url is not null and (url !~ '^https://[^[:space:]]+$' or char_length(url) > 2000) then
      raise exception 'bad_request';
    end if;

    for i in select value from jsonb_array_elements(ingredients) loop
      np := nullif(i->'new_product', 'null'::jsonb);
      nm := btrim(coalesce(i->>'name', ''));
      amount := (i->>'amount')::numeric;
      if jsonb_typeof(i) <> 'object' or char_length(nm) not between 1 and 80
         or amount is null or not (amount > 0 and amount <= 100000)
         or not (coalesce(i->>'unit', '') = any (units))
         or (np is not null and nullif(i->>'product_id', '') is not null) then
        raise exception 'bad_request';
      end if;

      pid := null;
      if nullif(i->>'product_id', '') is not null then
        pid := (i->>'product_id')::uuid;
        perform 1 from public.products where id = pid and family_id = fid and deleted_at is null;
        if not found then raise exception 'bad_request'; end if;
      elsif np is not null then
        if jsonb_typeof(np) <> 'object' or char_length(btrim(coalesce(np->>'name', ''))) not between 1 and 60
           or not ((np->>'category') = any (categories)) or not ((np->>'emoji') = any (allowed_emoji))
           or (np->>'pack_size' is null) <> (np->>'pack_unit' is null)
           or (np->>'pack_size' is not null and not ((np->>'pack_size')::numeric > 0 and (np->>'pack_size')::numeric <= 100000
                                                     and (np->>'pack_unit') = any (pack_units))) then
          raise exception 'bad_request';
        end if;
        nm := btrim(np->>'name');
        pid := (made->>lower(nm))::uuid;                                        -- already created in this import
        if pid is null then                                                      -- or an existing custom product with this name
          select id into pid from public.products
          where family_id = fid and deleted_at is null and lower(name) = lower(nm) limit 1;
        end if;
        if pid is null then
          insert into public.products (family_id, name, emoji, category, pack_size, pack_unit)
          values (fid, nm, np->>'emoji', np->>'category', (np->>'pack_size')::numeric, np->>'pack_unit')
          returning id into pid;
        end if;
        made := made || jsonb_build_object(lower(nm), pid);
      end if;

      -- learn the alias (the browser sends it for lines the user matched, corrected or created)
      alias := left(lower(regexp_replace(btrim(coalesce(i->>'alias', '')), '\s+', ' ', 'g')), 80);
      if pid is not null and alias <> '' then
        insert into public.ingredient_aliases (family_id, alias_text, product_id)
        values (fid, alias, pid)
        on conflict (family_id, alias_text) do update set product_id = excluded.product_id;
      end if;

      resolved := resolved || jsonb_build_array(jsonb_build_object(
        'product_id', pid, 'name', left(btrim(coalesce(i->>'name', '')), 80), 'amount', amount,
        'unit', i->>'unit', 'staple', coalesce((i->>'staple')::boolean, false)));
    end loop;
  exception
    when raise_exception then raise;                                            -- 'bad_request' / 'forbidden' stay as they are
    when others then raise exception 'bad_request';                             -- wrong types, bad casts, ...
  end;

  rid := public.save_recipe(fid, null, jsonb_build_object(
    'title', btrim(recipe->>'title'), 'lang', recipe->>'lang', 'country', nullif(recipe->>'country', ''),
    'servings', (recipe->>'servings')::int, 'minutes', (recipe->>'minutes')::int, 'steps', coalesce(recipe->>'steps', '')),
    resolved);
  if url is not null then
    update public.recipes set source_url = url where id = rid and family_id = fid;
  end if;
  return rid;
end;
$$;

revoke execute on function public.save_recipe_import(uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_recipe_import(uuid, jsonb, jsonb) to authenticated;
