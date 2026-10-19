alter table public.tenants
  add column if not exists school_npsn text
    check (school_npsn is null or school_npsn ~ '^[0-9]{8}$');

create unique index if not exists tenants_school_npsn_unique
  on public.tenants (school_npsn)
  where school_npsn is not null;

-- Public school registration; apply in sequence only after reviewed staging validation.
create table if not exists public.school_registration_requests (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  email text not null
    check (email = lower(btrim(email)) and char_length(email) between 3 and 320),
  school_name text not null check (char_length(school_name) between 2 and 160),
  npsn text not null check (npsn ~ '^[0-9]{8}$'),
  terms_accepted_at timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'approved', 'rejected')),
  tenant_id text references public.tenants(id) on delete restrict,
  review_notes text check (review_notes is null or char_length(review_notes) <= 1000),
  submitted_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  check (
    (status = 'pending' and tenant_id is null and reviewed_at is null and reviewed_by is null)
    or (status = 'approved' and tenant_id is not null and reviewed_at is not null and reviewed_by is not null)
    or (status = 'rejected' and tenant_id is null and reviewed_at is not null and reviewed_by is not null)
  )
);

create unique index if not exists school_registration_npsn_pending_approved
  on public.school_registration_requests (npsn)
  where status in ('pending', 'approved');

alter table public.school_registration_requests enable row level security;
revoke all on table public.school_registration_requests from anon, authenticated;
grant select on table public.school_registration_requests to authenticated;
grant all on table public.school_registration_requests to service_role;

drop policy if exists "Applicants and active superadmins read school requests"
  on public.school_registration_requests;
create policy "Applicants and active superadmins read school requests"
  on public.school_registration_requests
  for select
  to authenticated
  using (
    user_id = (select auth.uid())
    or (
      (select public.current_user_is_active())
      and (select public.current_app_role()) = 'superadmin'
    )
  );

create or replace function public.provision_auth_profile()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  invitation public.user_allowlist%rowtype;
  trial public.trial_registrations%rowtype;
  display_name text;
  institution_name text := '';
  assigned_roles text[] := '{}';
  assigned_role text := 'unprovisioned';
  assigned_tenant text;
  trial_expiry timestamptz;
  account_active boolean := false;
  normalized_email text := lower(btrim(coalesce(new.email, '')));
begin
  select *
  into invitation
  from public.user_allowlist
  where email = normalized_email;

  display_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Pengguna'
  );

  if invitation.email is not null and invitation.active then
    assigned_role := invitation.role;
    assigned_roles := coalesce(nullif(invitation.roles, '{}'::text[]), array[invitation.role]);
    assigned_tenant := invitation.tenant_id;
    account_active := invitation.active and new.email_confirmed_at is not null;

    if assigned_tenant is not null then
      select name
      into institution_name
      from public.tenants
      where id = assigned_tenant;
    end if;
  elsif coalesce(new.raw_user_meta_data ->> 'signup_intent', '') <> 'school_registration'
    and new.email_confirmed_at is not null
    and normalized_email <> '' then
    select *
    into trial
    from public.trial_registrations
    where user_id = new.id;

    if not found then
      insert into public.trial_registrations (
        email, user_id, started_at, expires_at
      )
      values (
        normalized_email,
        new.id,
        now(),
        now() + interval '72 hours'
      )
      on conflict (email) do nothing
      returning * into trial;

      if trial.user_id = new.id then
        assigned_tenant := 'trial-' || new.id::text;
        insert into public.tenants (id, name, active)
        values (assigned_tenant, 'AI_nnoe Trial ' || left(new.id::text, 8), true);
        update public.trial_registrations
        set tenant_id = assigned_tenant
        where email = normalized_email
        returning * into trial;
      end if;
    end if;

    if trial.user_id = new.id and trial.tenant_id is not null then
      assigned_role := 'demo';
      assigned_roles := array['demo'];
      assigned_tenant := trial.tenant_id;
      trial_expiry := trial.expires_at;
      account_active := trial.started_at <= now() and trial.expires_at > now();
      institution_name := 'AI_nnoe Demo';
    end if;
  end if;

  insert into public.profiles (
    id, email, nama, role, roles, tenant_id, instansi, active, trial_expires_at
  )
  values (
    new.id,
    nullif(normalized_email, ''),
    left(display_name, 120),
    assigned_role,
    assigned_roles,
    assigned_tenant,
    coalesce(institution_name, ''),
    account_active,
    trial_expiry
  )
  on conflict (id) do update
  set email = excluded.email,
      nama = case
        when public.profiles.role in ('unprovisioned', 'demo') then excluded.nama
        else public.profiles.nama
      end,
      role = excluded.role,
      roles = excluded.roles,
      tenant_id = excluded.tenant_id,
      instansi = excluded.instansi,
      active = excluded.active,
      trial_expires_at = excluded.trial_expires_at;

  return new;
end;
$$;

revoke all on function public.provision_auth_profile()
  from public, anon, authenticated;

create or replace function public.submit_school_registration_request(
  p_school_name text,
  p_npsn text,
  p_accepted_terms boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  applicant_id uuid := auth.uid();
  applicant_email text;
  normalized_name text := btrim(coalesce(p_school_name, ''));
  normalized_npsn text := btrim(coalesce(p_npsn, ''));
  applicant_profile public.profiles%rowtype;
  registration public.school_registration_requests%rowtype;
  previous_request jsonb;
begin
  if applicant_id is null then
    raise exception using errcode = '42501', message = 'authentication-required';
  end if;

  select lower(btrim(email))
  into applicant_email
  from auth.users
  where id = applicant_id
    and email_confirmed_at is not null
    and (raw_app_meta_data -> 'providers') ? 'email';

  if applicant_email is null then
    raise exception using errcode = '42501', message = 'verified-email-required';
  end if;

  if char_length(normalized_name) not between 2 and 160
    or normalized_name ~ '[[:cntrl:]]'
    or normalized_npsn !~ '^[0-9]{8}$'
    or p_accepted_terms is distinct from true then
    raise exception using errcode = '22023', message = 'invalid-registration-details';
  end if;

  if exists (
    select 1 from public.tenants where school_npsn = normalized_npsn
  ) then
    raise exception using errcode = '23505', message = 'npsn-already-registered';
  end if;

  select *
  into applicant_profile
  from public.profiles
  where id = applicant_id
  for update;

  if not found
    or applicant_profile.email is distinct from applicant_email
    or applicant_profile.role <> 'unprovisioned'
    or applicant_profile.active
    or exists (
      select 1 from public.user_allowlist where email = applicant_email
    ) then
    raise exception using errcode = '42501', message = 'account-not-eligible';
  end if;

  select to_jsonb(existing_request)
  into previous_request
  from public.school_registration_requests as existing_request
  where existing_request.user_id = applicant_id
  for update;

  if previous_request is not null then
    if previous_request ->> 'status' <> 'rejected' then
      raise exception using errcode = '23505', message = 'registration-request-already-exists';
    end if;

    update public.school_registration_requests
    set email = applicant_email,
        school_name = normalized_name,
        npsn = normalized_npsn,
        terms_accepted_at = now(),
        status = 'pending',
        tenant_id = null,
        review_notes = null,
        submitted_at = now(),
        reviewed_at = null,
        reviewed_by = null
    where user_id = applicant_id
    returning * into registration;
  else
    insert into public.school_registration_requests (
      user_id, email, school_name, npsn, terms_accepted_at
    )
    values (applicant_id, applicant_email, normalized_name, normalized_npsn, now())
    returning * into registration;
  end if;

  insert into public.platform_audit (
    actor_id, action, target, before_value, after_value
  )
  values (
    applicant_id,
    'platform.school_registration.submitted',
    registration.id::text,
    previous_request,
    jsonb_build_object(
      'school_name', registration.school_name,
      'npsn', registration.npsn,
      'status', registration.status,
      'terms_accepted_at', registration.terms_accepted_at
    )
  );

  return jsonb_build_object(
    'id', registration.id,
    'school_name', registration.school_name,
    'status', registration.status,
    'submitted_at', registration.submitted_at
  );
end;
$$;

revoke all on function public.submit_school_registration_request(text, text, boolean)
  from public, anon;
grant execute on function public.submit_school_registration_request(text, text, boolean)
  to authenticated;

create or replace function public.review_school_registration_request(
  p_request_id uuid,
  p_decision text,
  p_review_notes text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  reviewer_id uuid := auth.uid();
  registration public.school_registration_requests%rowtype;
  created_tenant_id text;
  normalized_notes text := nullif(btrim(coalesce(p_review_notes, '')), '');
begin
  if reviewer_id is null
    or not public.current_user_is_active()
    or public.current_app_role() <> 'superadmin' then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  if auth.jwt() ->> 'aal' <> 'aal2' then
    raise exception using errcode = '42501', message = 'mfa-required';
  end if;

  if p_request_id is null
    or p_decision is null
    or p_decision not in ('approve', 'reject')
    or char_length(coalesce(normalized_notes, '')) > 1000 then
    raise exception using errcode = '22023', message = 'invalid-review-decision';
  end if;

  select *
  into registration
  from public.school_registration_requests
  where id = p_request_id
  for update;

  if not found or registration.status <> 'pending' then
    raise exception using errcode = 'P0002', message = 'pending-request-not-found';
  end if;

  if p_decision = 'approve' then
    if not exists (
      select 1
      from auth.users as auth_user
      join public.profiles as applicant on applicant.id = auth_user.id
      where auth_user.id = registration.user_id
        and lower(btrim(auth_user.email)) = registration.email
        and auth_user.email_confirmed_at is not null
        and (auth_user.raw_app_meta_data -> 'providers') ? 'email'
        and applicant.email = registration.email
        and applicant.role = 'unprovisioned'
        and not applicant.active
        and not exists (
          select 1
          from public.user_allowlist as allowlist
          where allowlist.email = registration.email
        )
    ) then
      raise exception using errcode = '42501', message = 'applicant-not-eligible';
    end if;

    created_tenant_id := 'school-' || registration.id::text;
    insert into public.tenants (id, name, active, school_npsn)
    values (created_tenant_id, registration.school_name, true, registration.npsn);

    insert into public.user_allowlist (email, role, roles, tenant_id, active)
    values (
      registration.email,
      'admin_sekolah',
      array['admin_sekolah']::text[],
      created_tenant_id,
      true
    );

    update public.profiles
    set role = 'admin_sekolah',
        roles = array['admin_sekolah']::text[],
        tenant_id = created_tenant_id,
        instansi = registration.school_name,
        active = true
    where id = registration.user_id
      and role = 'unprovisioned'
      and not active;

    if not found then
      raise exception using errcode = '42501', message = 'applicant-not-eligible';
    end if;

    update public.school_registration_requests
    set status = 'approved',
        tenant_id = created_tenant_id,
        review_notes = normalized_notes,
        reviewed_at = now(),
        reviewed_by = reviewer_id
    where id = registration.id;
  else
    update public.school_registration_requests
    set status = 'rejected',
        review_notes = normalized_notes,
        reviewed_at = now(),
        reviewed_by = reviewer_id
    where id = registration.id;
  end if;

  insert into public.platform_audit (
    actor_id, action, target, before_value, after_value
  )
  values (
    reviewer_id,
    'platform.school_registration.' || case when p_decision = 'approve' then 'approved' else 'rejected' end,
    registration.id::text,
    to_jsonb(registration),
    jsonb_build_object(
      'status', case when p_decision = 'approve' then 'approved' else 'rejected' end,
      'tenant_id', created_tenant_id,
      'review_notes', normalized_notes
    )
  );

  return jsonb_build_object(
    'id', registration.id,
    'status', case when p_decision = 'approve' then 'approved' else 'rejected' end,
    'tenant_id', created_tenant_id
  );
end;
$$;

revoke all on function public.review_school_registration_request(uuid, text, text)
  from public, anon;
grant execute on function public.review_school_registration_request(uuid, text, text)
  to authenticated;
