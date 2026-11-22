-- 0006: optional "for whom" label on invitations (plain text, visible to family admins only).
alter table public.invitations
  add column label text check (char_length(label) <= 60);

-- Replace create_invitation(uuid) with a version that also accepts the label.
drop function public.create_invitation(uuid);

create function public.create_invitation(fid uuid, lbl text default null) returns text
language plpgsql security definer set search_path = '' as $$
declare
  tok text;
begin
  if not public.is_family_admin(fid) then
    raise exception 'forbidden';
  end if;
  tok := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  insert into public.invitations (family_id, token_hash, expires_at, label)
  values (
    fid,
    encode(sha256(convert_to(tok, 'utf8')), 'hex'),
    now() + interval '7 days',
    nullif(btrim(lbl), '')
  );
  return tok;
end;
$$;

revoke execute on function public.create_invitation(uuid, text) from public, anon;
grant execute on function public.create_invitation(uuid, text) to authenticated;
