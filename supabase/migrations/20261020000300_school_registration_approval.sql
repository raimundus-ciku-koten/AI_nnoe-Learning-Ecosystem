alter table public.tenants
  add column if not exists ministry_registry_data jsonb;

create table if not exists public.school_registration_requests_v2 (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  email text not null check (email = lower(btrim(email)) and char_length(email) <= 320),
  npsn text not null check (npsn ~ '^[0-9]{8}$'),
  submitted_name text not null check (char_length(submitted_name) between 2 and 160),
  education_level text not null check (char_length(education_level) between 1 and 40),
  province text not null check (char_length(province) between 1 and 80),
  city text not null check (char_length(city) between 1 and 100),
  address text not null check (char_length(address) between 1 and 240),
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  verified_name text,
  registry_data jsonb,
  reviewed_by uuid references auth.users(id) on delete set null,
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  check (
    (status = 'pending' and reviewed_by is null and reviewed_at is null)
    or (status <> 'pending' and reviewed_by is not null and reviewed_at is not null)
  )
);

create unique index if not exists school_registration_v2_one_pending_npsn_idx
  on public.school_registration_requests_v2 (npsn)
  where status = 'pending';
create index if not exists school_registration_v2_requester_idx
  on public.school_registration_requests_v2 (requester_id, created_at desc);

alter table public.school_registration_requests_v2 enable row level security;
revoke all on table public.school_registration_requests_v2 from public, anon, authenticated;
grant select on table public.school_registration_requests_v2 to authenticated;
grant all on table public.school_registration_requests_v2 to service_role;

drop policy if exists "Applicants and active superadmins read school requests"
  on public.school_registration_requests_v2;
create policy "Applicants and active superadmins read school requests"
  on public.school_registration_requests_v2
  for select
  to authenticated
  using (
    requester_id = (select auth.uid())
    or (
      (select public.current_user_is_active())
      and (select public.current_app_role()) = 'superadmin'
    )
  );

create or replace function public.submit_school_registration_request_v2(
  p_requester_id uuid,
  p_npsn text,
  p_school_name text,
  p_education_level text,
  p_province text,
  p_city text,
  p_address text,
  p_registry_data jsonb default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  requester uuid := p_requester_id;
  requester_email text;
  requester_profile public.profiles%rowtype;
  request_id uuid;
  normalized_npsn text := btrim(coalesce(p_npsn, ''));
begin
  if requester is null then
    raise exception using errcode = '42501', message = 'authentication-required';
  end if;

  select * into requester_profile
  from public.profiles
  where id = requester;

  select lower(btrim(email)) into requester_email
  from auth.users
  where id = requester and email_confirmed_at is not null;

  if requester_profile.id is null
    or requester_profile.role <> 'unprovisioned'
    or requester_profile.tenant_id is not null
    or requester_email is null then
    raise exception using errcode = '42501', message = 'school-request-not-allowed';
  end if;

  if normalized_npsn !~ '^[0-9]{8}$'
    or char_length(btrim(coalesce(p_school_name, ''))) not between 2 and 160
    or char_length(btrim(coalesce(p_education_level, ''))) not between 1 and 40
    or char_length(btrim(coalesce(p_province, ''))) not between 1 and 80
    or char_length(btrim(coalesce(p_city, ''))) not between 1 and 100
    or char_length(btrim(coalesce(p_address, ''))) not between 1 and 240 then
    raise exception using errcode = '22023', message = 'invalid-school-request';
  end if;

  if exists (select 1 from public.tenants where npsn = normalized_npsn) then
    raise exception using errcode = '23505', message = 'npsn-already-registered';
  end if;

  insert into public.school_registration_requests_v2 (
    requester_id, email, npsn, submitted_name, education_level, province, city, address,
    registry_data
  )
  values (
    requester,
    requester_email,
    normalized_npsn,
    btrim(p_school_name),
    btrim(p_education_level),
    btrim(p_province),
    btrim(p_city),
    btrim(p_address),
    p_registry_data
  )
  returning id into request_id;
  return request_id;
end;
$$;

create or replace function public.review_school_registration_request_v2(
  p_request_id uuid,
  p_approve boolean,
  p_verified_name text default null,
  p_registry_data jsonb default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  selected public.school_registration_requests_v2%rowtype;
  official_name text := btrim(coalesce(p_verified_name, ''));
  new_tenant_id text;
  provisioned jsonb;
begin
  if actor_id is null
    or not public.current_user_is_active()
    or public.current_app_role() <> 'superadmin' then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;
  if p_request_id is null or p_approve is null then
    raise exception using errcode = '22023', message = 'invalid-review';
  end if;

  select * into selected
  from public.school_registration_requests_v2
  where id = p_request_id
  for update;
  if selected.id is null or selected.status <> 'pending' then
    raise exception using errcode = 'P0002', message = 'pending-school-request-not-found';
  end if;

  if p_approve then
    if char_length(official_name) not between 2 and 160
      or p_registry_data is null
      or jsonb_typeof(p_registry_data) <> 'object'
      or coalesce(p_registry_data ->> 'npsn', '') <> selected.npsn
      or coalesce(p_registry_data ->> 'nama', '') <> official_name
      or char_length(coalesce(p_registry_data ->> 'bentuk_pendidikan', '')) < 1
      or char_length(coalesce(p_registry_data ->> 'propinsi', '')) < 1
      or char_length(coalesce(p_registry_data ->> 'kabupaten_kota', '')) < 1
      or char_length(coalesce(p_registry_data ->> 'alamat', '')) < 1 then
      raise exception using errcode = '22023', message = 'verified-ministry-record-required';
    end if;
    if exists (select 1 from public.tenants where npsn = selected.npsn) then
      raise exception using errcode = '23505', message = 'npsn-already-registered';
    end if;

    new_tenant_id := 'npsn-' || selected.npsn;
    insert into public.tenants (id, name, active, education_level, npsn, ministry_registry_data)
    values (
      new_tenant_id,
      official_name,
      true,
      left(p_registry_data ->> 'bentuk_pendidikan', 40),
      selected.npsn,
      p_registry_data
    );

    provisioned := public.manage_platform_user(
      selected.email,
      official_name,
      'admin_sekolah',
      new_tenant_id,
      true
    );

    update public.school_registration_requests_v2
    set status = 'approved',
        verified_name = official_name,
        registry_data = p_registry_data,
        reviewed_by = actor_id,
        reviewed_at = now()
    where id = selected.id;
  else
    update public.school_registration_requests_v2
    set status = 'rejected',
        reviewed_by = actor_id,
        reviewed_at = now()
    where id = selected.id;
    provisioned := jsonb_build_object('status', 'rejected', 'request_id', selected.id);
  end if;
  return provisioned;
end;
$$;

revoke all on function public.submit_school_registration_request_v2(
  uuid, text, text, text, text, text, text, jsonb
) from public, anon, authenticated;
grant execute on function public.submit_school_registration_request_v2(
  uuid, text, text, text, text, text, text, jsonb
) to service_role;
revoke all on function public.review_school_registration_request_v2(
  uuid, boolean, text, jsonb
) from public, anon;
grant execute on function public.review_school_registration_request_v2(
  uuid, boolean, text, jsonb
) to authenticated;
