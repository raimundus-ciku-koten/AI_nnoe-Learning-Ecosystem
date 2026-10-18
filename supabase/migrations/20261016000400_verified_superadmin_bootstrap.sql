-- Provision the confirmed project-owner identity without granting roles from
-- client-controlled user metadata.

create or replace function public.provision_auth_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.user_allowlist%rowtype;
  display_name text;
begin
  select *
  into invitation
  from public.user_allowlist
  where email = lower(btrim(new.email))
    and active = true;

  display_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Pengguna'
  );

  insert into public.profiles (id, email, nama, role, tenant_id, active)
  values (
    new.id,
    nullif(lower(btrim(new.email)), ''),
    left(display_name, 120),
    coalesce(invitation.role, 'unprovisioned'),
    invitation.tenant_id,
    coalesce(invitation.active, false) and new.email_confirmed_at is not null
  )
  on conflict (id) do update
  set email = excluded.email,
      role = excluded.role,
      tenant_id = excluded.tenant_id,
      active = excluded.active;

  return new;
end;
$$;

revoke all on function public.provision_auth_profile()
  from public, anon, authenticated;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.provision_auth_profile();

drop trigger if exists on_auth_user_provisioning_updated on auth.users;
create trigger on_auth_user_provisioning_updated
  after update of email, email_confirmed_at on auth.users
  for each row execute function public.provision_auth_profile();

insert into public.user_allowlist (email, role, tenant_id, active)
values ('kotenraimundusc@gmail.com', 'superadmin', null, true)
on conflict (email) do update
set role = excluded.role,
    tenant_id = excluded.tenant_id,
    active = excluded.active;

insert into public.profiles (id, email, nama, role, tenant_id, active)
select
  auth_user.id,
  lower(btrim(auth_user.email)),
  left(
    coalesce(
      nullif(btrim(auth_user.raw_user_meta_data ->> 'full_name'), ''),
      nullif(btrim(auth_user.raw_user_meta_data ->> 'name'), ''),
      nullif(split_part(auth_user.email, '@', 1), ''),
      'Superadmin'
    ),
    120
  ),
  'superadmin',
  null,
  true
from auth.users as auth_user
where lower(btrim(auth_user.email)) = 'kotenraimundusc@gmail.com'
  and auth_user.email_confirmed_at is not null
on conflict (id) do update
set email = excluded.email,
    role = excluded.role,
    tenant_id = excluded.tenant_id,
    active = excluded.active,
    updated_at = now();
