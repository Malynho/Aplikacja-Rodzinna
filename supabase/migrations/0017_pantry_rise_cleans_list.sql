-- 0017: a RISING Ist cleans the open shopping list item of the same product.
-- Until now: ticking an item raises Ist (shopping_items_pantry, 0008) and a FALLING Ist sets the open item to
-- Soll - Ist (pantry_items_shortage, 0008). New: when Ist rises (typed in the pantry, from a receipt, or by
-- ticking), the open item is lowered to max(0, Soll - Ist); at 0 it is removed.
--
-- Rules:
--  * only the open item is touched: checked = false and deleted_at is null (one per product, see
--    shopping_items_open_product). Ticked / bought / soft-deleted rows are never changed.
--  * the quantity is only ever LOWERED here, never raised.
--  * products without a target (Soll = 0) are left alone: the list is then not derived from the pantry.
--  * no loop: this trigger fires on pantry_items and writes only shopping_items.quantity or deletes a row. It does
--    not touch "checked" (shopping_items_pantry fires only when "checked" changes) and does not write pantry_items
--    (pantry_items_shortage fires only when Ist FALLS).

-- security definer: clients have no DELETE policy on shopping_items (soft deletion only), but this automatic
-- clean-up removes the row for good so it does not show up in "recently deleted". The caller already had
-- "write" on the kitchen module to change the pantry; the rows touched are those of the same family and product.
create function public.pantry_rise_to_shopping() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  target int := greatest(new.soll - new.ist, 0);
begin
  if new.soll <= 0 then
    return null;
  end if;

  if target = 0 then
    delete from public.shopping_items
    where family_id = new.family_id and product_id = new.product_id
      and checked = false and deleted_at is null;
  else
    update public.shopping_items
    set quantity = target
    where family_id = new.family_id and product_id = new.product_id
      and checked = false and deleted_at is null
      and quantity > target;
  end if;
  return null;
end;
$$;

-- A new pantry row that starts with stock (e.g. typed into the editor for a product not tracked yet) ...
create trigger pantry_items_rise_insert after insert on public.pantry_items
  for each row when (new.ist > 0) execute function public.pantry_rise_to_shopping();

-- ... and every later rise of Ist.
create trigger pantry_items_rise after update of ist on public.pantry_items
  for each row when (new.ist > old.ist) execute function public.pantry_rise_to_shopping();
