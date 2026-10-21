alter table public.profiles
  add column if not exists instansi text not null default '',
  add column if not exists nip text,
  add column if not exists mapel_ids text[] not null default '{}',
  add column if not exists kelas_ids text[] not null default '{}';

alter table public.profiles
  add constraint profiles_instansi_length
    check (char_length(instansi) <= 160),
  add constraint profiles_nip_length
    check (nip is null or char_length(nip) <= 40),
  add constraint profiles_mapel_count
    check (cardinality(mapel_ids) <= 30),
  add constraint profiles_kelas_count
    check (cardinality(kelas_ids) <= 30);

create or replace function public.provision_auth_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.user_allowlist%rowtype;
  display_name text;
  institution_name text := '';
begin
  select *
  into invitation
  from public.user_allowlist
  where email = lower(btrim(new.email))
    and active = true;

  if invitation.tenant_id is not null then
    select name
    into institution_name
    from public.tenants
    where id = invitation.tenant_id;
  end if;

  display_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Pengguna'
  );

  insert into public.profiles (
    id, email, nama, role, tenant_id, instansi, active
  )
  values (
    new.id,
    nullif(lower(btrim(new.email)), ''),
    left(display_name, 120),
    coalesce(invitation.role, 'unprovisioned'),
    invitation.tenant_id,
    coalesce(institution_name, ''),
    coalesce(invitation.active, false) and new.email_confirmed_at is not null
  )
  on conflict (id) do update
  set email = excluded.email,
      nama = case
        when public.profiles.role = 'unprovisioned' then excluded.nama
        else public.profiles.nama
      end,
      role = excluded.role,
      tenant_id = excluded.tenant_id,
      instansi = excluded.instansi,
      active = excluded.active;

  return new;
end;
$$;

revoke all on function public.provision_auth_profile()
  from public, anon, authenticated;

create or replace function public.manage_platform_user(
  p_email text,
  p_nama text,
  p_role text,
  p_tenant_id text,
  p_active boolean,
  p_nip text default null,
  p_mapel_ids text[] default '{}',
  p_kelas_ids text[] default '{}'
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  normalized_email text := lower(btrim(coalesce(p_email, '')));
  normalized_name text := btrim(coalesce(p_nama, ''));
  normalized_nip text := nullif(btrim(coalesce(p_nip, '')), '');
  tenant_name text;
  target_user_id uuid;
  previous_profile jsonb;
  next_profile jsonb;
begin
  if actor_id is null
    or not public.current_user_is_active()
    or public.current_app_role() <> 'superadmin' then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  if normalized_email !~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    or char_length(normalized_email) > 254
    or char_length(normalized_name) not between 2 and 120
    or normalized_name ~ '[[:cntrl:]]'
    or p_role is null
    or p_role not in ('admin_sekolah', 'operator', 'guru', 'siswa', 'ortu', 'orang_tua')
    or p_active is null
    or p_mapel_ids is null
    or p_kelas_ids is null
    or cardinality(p_mapel_ids) > 30
    or cardinality(p_kelas_ids) > 30
    or exists (
      select 1 from unnest(p_mapel_ids || p_kelas_ids) as item
      where item is null
        or char_length(btrim(item)) not between 1 and 120
        or item ~ '[[:cntrl:]]'
    ) then
    raise exception using errcode = '22023', message = 'invalid-argument';
  end if;

  if normalized_nip is not null
    and (char_length(normalized_nip) > 40 or normalized_nip ~ '[[:cntrl:]]') then
    raise exception using errcode = '22023', message = 'invalid-argument';
  end if;

  select name
  into tenant_name
  from public.tenants
  where id = p_tenant_id
    and active = true;

  if tenant_name is null then
    raise exception using errcode = 'P0002', message = 'active-tenant-not-found';
  end if;

  if normalized_email = (
    select lower(btrim(email)) from auth.users where id = actor_id
  ) or exists (
    select 1 from public.profiles
    where email = normalized_email and role = 'superadmin'
  ) then
    raise exception using errcode = '42501', message = 'cannot-change-superadmin';
  end if;

  select id
  into target_user_id
  from auth.users
  where lower(btrim(email)) = normalized_email
    and email_confirmed_at is not null;

  select to_jsonb(profile)
  into previous_profile
  from public.profiles as profile
  where profile.email = normalized_email;

  insert into public.user_allowlist (email, role, tenant_id, active)
  values (normalized_email, p_role, p_tenant_id, p_active)
  on conflict (email) do update
  set role = excluded.role,
      tenant_id = excluded.tenant_id,
      active = excluded.active;

  if target_user_id is not null then
    insert into public.profiles (
      id, email, nama, role, tenant_id, instansi, nip, mapel_ids, kelas_ids, active
    )
    values (
      target_user_id, normalized_email, normalized_name, p_role, p_tenant_id,
      tenant_name, normalized_nip, p_mapel_ids, p_kelas_ids, p_active
    )
    on conflict (id) do update
    set email = excluded.email,
        nama = excluded.nama,
        role = excluded.role,
        tenant_id = excluded.tenant_id,
        instansi = excluded.instansi,
        nip = excluded.nip,
        mapel_ids = excluded.mapel_ids,
        kelas_ids = excluded.kelas_ids,
        active = excluded.active;
  end if;

  select to_jsonb(profile)
  into next_profile
  from public.profiles as profile
  where profile.email = normalized_email;

  insert into public.platform_audit (
    actor_id, action, target, before_value, after_value
  )
  values (
    actor_id,
    'platform.user.provisioned',
    normalized_email,
    previous_profile,
    coalesce(
      next_profile,
      jsonb_build_object(
        'email', normalized_email,
        'nama', normalized_name,
        'role', p_role,
        'tenant_id', p_tenant_id,
        'instansi', tenant_name,
        'active', p_active,
        'invitation_required', true
      )
    )
  );

  return jsonb_build_object(
    'email', normalized_email,
    'role', p_role,
    'tenant_id', p_tenant_id,
    'active', p_active and target_user_id is not null,
    'user_id', target_user_id,
    'invitation_required', target_user_id is null
  );
end;
$$;

revoke all on function public.manage_platform_user(
  text, text, text, text, boolean, text, text[], text[]
) from public, anon;
grant execute on function public.manage_platform_user(
  text, text, text, text, boolean, text, text[], text[]
) to authenticated;

insert into public.tenants (id, name, active)
values ('sman-1-tanjung-bunga', 'SMAN 1 Tanjung Bunga', true)
on conflict (id) do update
set name = excluded.name,
    active = excluded.active,
    updated_at = now();

update public.profiles
set nama = 'CEO AI_nnoe Corp.',
    instansi = 'AI_nnoe Corp'
where email = 'kotenraimundusc@gmail.com'
  and role = 'superadmin';

insert into public.user_allowlist (email, role, tenant_id, active)
values ('raimunduscikukoten@gmail.com', 'admin_sekolah', 'sman-1-tanjung-bunga', true)
on conflict (email) do update
set role = excluded.role,
    tenant_id = excluded.tenant_id,
    active = excluded.active;

update public.profiles as profile
set nama = 'Operator SMAN 1 Tanjung Bunga',
    role = 'admin_sekolah',
    tenant_id = 'sman-1-tanjung-bunga',
    instansi = 'SMAN 1 Tanjung Bunga',
    active = true
from auth.users as auth_user
where profile.id = auth_user.id
  and profile.email = 'raimunduscikukoten@gmail.com'
  and auth_user.email_confirmed_at is not null;

insert into public.user_allowlist (email, role, tenant_id, active)
values ('raimunduskoten21@guru.sma.belajar.id', 'guru', 'sman-1-tanjung-bunga', true)
on conflict (email) do update
set role = excluded.role,
    tenant_id = excluded.tenant_id,
    active = excluded.active;

update public.profiles as profile
set nama = 'Raimundus Ciku Koten, S.Pd.,Gr.',
    role = 'guru',
    tenant_id = 'sman-1-tanjung-bunga',
    instansi = 'SMAN 1 Tanjung Bunga',
    nip = '199211222019031001',
    mapel_ids = array['Matematika', 'Matematika Tingkat Lanjut'],
    kelas_ids = array['X', 'XI', 'XII'],
    active = true
from auth.users as auth_user
where profile.id = auth_user.id
  and profile.email = 'raimunduskoten21@guru.sma.belajar.id'
  and auth_user.email_confirmed_at is not null;
