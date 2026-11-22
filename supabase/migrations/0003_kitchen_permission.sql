-- 0003: the "shopping" permission becomes "kitchen" (one permission for the whole Kitchen module).
-- Allowed modules: kitchen, todo, notes. The admin module (Verwaltung) is admin-only and has no rows.
alter table public.module_permissions drop constraint module_permissions_module_check;

update public.module_permissions set module = 'kitchen' where module = 'shopping';

alter table public.module_permissions
  add constraint module_permissions_module_check check (module in ('kitchen', 'todo', 'notes'));
