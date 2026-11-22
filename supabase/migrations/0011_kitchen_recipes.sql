-- 0011: Kitchen stage 3a: recipes, recipe ingredients, meal wishes (dinner plan).
-- Recipes are added by hand only; a recipe keeps the language it was written in (no translation).

-- ---------- Tables ----------

create table public.recipes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  title text not null check (char_length(title) between 1 and 120),
  lang text not null check (lang in ('pl', 'de')),
  country text check (country ~ '^[A-Z]{2}$'),               -- ISO code, null = other
  servings int not null check (servings between 1 and 100),
  minutes int check (minutes between 1 and 10000),
  steps text not null default '' check (char_length(steps) <= 10000),
  source_url text check (char_length(source_url) <= 2000),   -- for the later import stage
  created_by uuid not null default auth.uid() references auth.users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  unique (id, family_id)                                     -- target of the composite foreign keys
);

create table public.recipe_ingredients (
  id uuid primary key default gen_random_uuid(),
  recipe_id uuid not null,
  family_id uuid not null references public.families (id) on delete cascade,
  product_id uuid,                                           -- null = not in the catalog
  name text not null check (char_length(name) between 1 and 80),
  amount numeric(10, 3) not null check (amount > 0 and amount <= 100000),
  unit text not null check (unit in ('g', 'ml', 'pcs', 'tbsp', 'tsp')),
  staple boolean not null default false,                     -- always at home (salt, oil): never auto-listed
  sort int not null default 0,
  updated_at timestamptz not null default now(),
  foreign key (recipe_id, family_id) references public.recipes (id, family_id) on delete cascade,
  foreign key (product_id, family_id) references public.products (id, family_id) on delete cascade
);

create table public.meal_wishes (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families (id) on delete cascade,
  day date not null,
  recipe_id uuid,
  title text check (char_length(title) between 1 and 120),
  wished_by uuid not null default auth.uid() references auth.users (id),
  note text check (char_length(note) <= 300),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  foreign key (recipe_id, family_id) references public.recipes (id, family_id),
  check ((recipe_id is null) <> (title is null))             -- exactly one of recipe / own text
);

create index recipes_family on public.recipes (family_id);
create index recipe_ingredients_recipe on public.recipe_ingredients (recipe_id);
create index meal_wishes_family_day on public.meal_wishes (family_id, day);

create trigger recipes_touch before update on public.recipes
  for each row execute function public.touch_updated_at();
create trigger recipe_ingredients_touch before update on public.recipe_ingredients
  for each row execute function public.touch_updated_at();
create trigger meal_wishes_touch before update on public.meal_wishes
  for each row execute function public.touch_updated_at();

-- ---------- RLS: permission "kitchen" ----------
-- Recipes and wishes use soft deletion; ingredients are part of a recipe and are replaced (hard DELETE).

select public.apply_module_policies('recipes', 'kitchen', false);
select public.apply_module_policies('recipe_ingredients', 'kitchen', true);
select public.apply_module_policies('meal_wishes', 'kitchen', false);

-- ---------- Functions (security invoker: the caller's RLS applies, so "write" is required) ----------

-- Saves a recipe and replaces its ingredients in one transaction. rid = null creates a new recipe.
-- recipe: {title, lang, country, servings, minutes, steps}
-- ingredients: [{product_id, name, amount, unit, staple}] (order = sort)
create function public.save_recipe(fid uuid, rid uuid, recipe jsonb, ingredients jsonb) returns uuid
language plpgsql as $$
declare
  result uuid;
begin
  if jsonb_typeof(ingredients) <> 'array' or jsonb_array_length(ingredients) > 60 then
    raise exception 'bad_request';
  end if;

  if rid is null then
    insert into public.recipes (family_id, title, lang, country, servings, minutes, steps)
    values (fid, recipe->>'title', recipe->>'lang', nullif(recipe->>'country', ''),
            (recipe->>'servings')::int, (recipe->>'minutes')::int, coalesce(recipe->>'steps', ''))
    returning id into result;
  else
    update public.recipes
    set title = recipe->>'title', lang = recipe->>'lang', country = nullif(recipe->>'country', ''),
        servings = (recipe->>'servings')::int, minutes = (recipe->>'minutes')::int,
        steps = coalesce(recipe->>'steps', '')
    where id = rid and family_id = fid and deleted_at is null
    returning id into result;
    if result is null then raise exception 'not_found'; end if;
    delete from public.recipe_ingredients where recipe_id = result;
  end if;

  insert into public.recipe_ingredients (recipe_id, family_id, product_id, name, amount, unit, staple, sort)
  select result, fid, (i.value->>'product_id')::uuid, i.value->>'name', (i.value->>'amount')::numeric,
         i.value->>'unit', coalesce((i.value->>'staple')::boolean, false), (i.ordinality - 1)::int
  from jsonb_array_elements(ingredients) with ordinality as i(value, ordinality);

  return result;
end;
$$;

-- Puts missing packs on the shopping list: quantity = max(existing open quantity, missing), no duplicates.
-- needs: [{product_id, qty}]; duplicate products are summed first (one row per product per statement).
-- Does not touch checked/pantry, so the 0008/0009 triggers stay silent.
-- Returns the number of products processed.
create function public.add_missing_to_list(fid uuid, needs jsonb) returns int
language plpgsql as $$
declare
  n int;
begin
  if jsonb_typeof(needs) <> 'array' or jsonb_array_length(needs) > 300 then
    raise exception 'bad_request';
  end if;

  insert into public.shopping_items (family_id, product_id, quantity)
  select fid, (x->>'product_id')::uuid, least(sum((x->>'qty')::int), 99)
  from jsonb_array_elements(needs) as x
  where (x->>'qty')::int > 0
  group by (x->>'product_id')::uuid
  on conflict (family_id, product_id) where checked = false and deleted_at is null
  do update set quantity = greatest(public.shopping_items.quantity, excluded.quantity);

  get diagnostics n = row_count;
  return n;
end;
$$;

revoke execute on function public.save_recipe(uuid, uuid, jsonb, jsonb) from public, anon;
grant execute on function public.save_recipe(uuid, uuid, jsonb, jsonb) to authenticated;
revoke execute on function public.add_missing_to_list(uuid, jsonb) from public, anon;
grant execute on function public.add_missing_to_list(uuid, jsonb) to authenticated;

-- ---------- Realtime ----------

alter table public.recipes replica identity full;
alter table public.recipe_ingredients replica identity full;
alter table public.meal_wishes replica identity full;
alter publication supabase_realtime add table public.recipes, public.recipe_ingredients, public.meal_wishes;
