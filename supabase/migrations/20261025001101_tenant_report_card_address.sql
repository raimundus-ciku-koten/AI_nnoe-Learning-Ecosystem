alter table public.tenants
  add column if not exists address text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tenants_address_length_check'
      and conrelid = 'public.tenants'::regclass
  ) then
    alter table public.tenants
      add constraint tenants_address_length_check
      check (address is null or (
        char_length(address) <= 500
        and address = btrim(address)
        and translate(address, chr(9) || chr(10) || chr(13), '') !~ '[[:cntrl:]]'
      ));
  end if;
end;
$$;

grant update (address) on table public.tenants to authenticated;
