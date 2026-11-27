-- to-do guard also on INSERT: done_by is always decided by the server, never taken from the client.
-- Triggers fire in name order, so todos_guard still runs before todos_touch (which stays update-only).
create or replace function public.todos_guard() returns trigger
language plpgsql set search_path = '' as $$
begin
  if tg_op = 'INSERT' then
    new.done_by := case when new.done_at is null then null else auth.uid() end;
    return new;
  end if;

  -- UPDATE (unchanged logic from 0018)
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

drop trigger todos_guard on public.todos;
create trigger todos_guard before insert or update on public.todos for each row execute function public.todos_guard();
