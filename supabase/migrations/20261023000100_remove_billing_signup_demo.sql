-- Remove payment, pricing, trial, and demo-role behavior from the active schema.
-- Apply only after Staging backup/restore and migration provenance are verified.

alter table public.user_allowlist
  drop constraint if exists user_allowlist_demo_role_isolated,
  drop constraint if exists user_allowlist_roles_valid,
  drop constraint if exists user_allowlist_role_check;
alter table public.profiles
  drop constraint if exists profiles_demo_role_isolated,
  drop constraint if exists profiles_roles_valid,
  drop constraint if exists profiles_role_check;

delete from public.user_allowlist
where role = 'demo';
update public.user_allowlist
set roles = case
  when cardinality(array_remove(coalesce(roles, '{}'::text[]), 'demo')) = 0
    then array[role]
  else array_remove(coalesce(roles, '{}'::text[]), 'demo')
end;

update public.profiles
set role = 'unprovisioned',
    roles = '{}'::text[],
    tenant_id = null,
    active = false
where role = 'demo';
update public.profiles
set roles = case
  when role = 'unprovisioned'
    then '{}'::text[]
  when cardinality(array_remove(coalesce(roles, '{}'::text[]), 'demo')) = 0
    then array[role]
  else array_remove(coalesce(roles, '{}'::text[]), 'demo')
end;

alter table public.user_allowlist
  add constraint user_allowlist_role_check
  check (role in (
    'superadmin', 'admin_sekolah', 'operator', 'guru', 'siswa', 'ortu',
    'orang_tua', 'kepala_sekolah', 'wali_kelas', 'guru_bk',
    'guru_kokurikuler', 'guru_ekstrakurikuler'
  )),
  add constraint user_allowlist_roles_valid
  check (
    cardinality(roles) between 1 and 8
    and array_position(roles, null::text) is null
    and role = any (roles)
    and roles <@ array[
      'superadmin', 'admin_sekolah', 'operator', 'guru', 'siswa', 'ortu',
      'orang_tua', 'kepala_sekolah', 'wali_kelas', 'guru_bk',
      'guru_kokurikuler', 'guru_ekstrakurikuler'
    ]::text[]
    and public.text_array_has_unique_values(roles)
    and (not ('superadmin' = any (roles)) or cardinality(roles) = 1)
    and (not (roles && array['wali_kelas', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler']::text[])
      or 'guru' = any (roles))
  );
alter table public.profiles
  add constraint profiles_role_check
  check (role in (
    'unprovisioned', 'superadmin', 'admin_sekolah', 'operator', 'guru',
    'siswa', 'ortu', 'orang_tua', 'kepala_sekolah', 'wali_kelas', 'guru_bk',
    'guru_kokurikuler', 'guru_ekstrakurikuler'
  )),
  add constraint profiles_roles_valid
  check (
    (role = 'unprovisioned' and cardinality(roles) = 0)
    or (
      role <> 'unprovisioned'
      and cardinality(roles) between 1 and 8
      and array_position(roles, null::text) is null
      and role = any (roles)
      and roles <@ array[
        'superadmin', 'admin_sekolah', 'operator', 'guru', 'siswa', 'ortu',
        'orang_tua', 'kepala_sekolah', 'wali_kelas', 'guru_bk',
        'guru_kokurikuler', 'guru_ekstrakurikuler'
      ]::text[]
      and public.text_array_has_unique_values(roles)
      and (not ('superadmin' = any (roles)) or cardinality(roles) = 1)
      and (not (roles && array['wali_kelas', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler']::text[])
        or 'guru' = any (roles))
    )
  );

drop policy if exists "Active teachers read their own student roster"
  on public.students;
create policy "Active teachers read their own student roster"
  on public.students
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in ('admin_sekolah', 'operator', 'guru')
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = students.tenant_id
        and tenant.active = true
    )
  );

drop policy if exists "Entitled active teachers create their own students"
  on public.students;
create policy "Active teachers create their own students"
  on public.students
  for insert
  to authenticated
  with check (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in ('admin_sekolah', 'operator', 'guru')
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = students.tenant_id
        and tenant.active = true
    )
  );

drop policy if exists "Entitled active teachers update their own students"
  on public.students;
create policy "Active teachers update their own students"
  on public.students
  for update
  to authenticated
  using (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in ('admin_sekolah', 'operator', 'guru')
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = students.tenant_id
        and tenant.active = true
    )
  )
  with check (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in ('admin_sekolah', 'operator', 'guru')
  );

drop policy if exists "Entitled active teachers delete their own students"
  on public.students;
create policy "Active teachers delete their own students"
  on public.students
  for delete
  to authenticated
  using (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in ('admin_sekolah', 'operator', 'guru')
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = students.tenant_id
        and tenant.active = true
    )
  );

drop policy if exists "Active teachers read their own attendance"
  on public.attendance_records;
create policy "Active teachers read their own attendance"
  on public.attendance_records
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in ('admin_sekolah', 'operator', 'guru')
  );

drop policy if exists "Entitled teachers record matching student attendance"
  on public.attendance_records;
create policy "Active teachers record matching student attendance"
  on public.attendance_records
  for insert
  to authenticated
  with check (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and student_id is not null
    and (select public.current_app_role()) in ('admin_sekolah', 'operator', 'guru')
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = attendance_records.tenant_id
        and tenant.active = true
    )
    and exists (
      select 1
      from public.students as student
      where student.id = attendance_records.student_id
        and student.owner_id = attendance_records.owner_id
        and student.tenant_id = attendance_records.tenant_id
        and student.kode_unik = attendance_records.kode_unik
        and student.nama = attendance_records.nama
        and student.kelas = attendance_records.kelas
    )
  );

drop policy if exists "Active school members and superadmins read announcements"
  on public.school_announcements;
create policy "Active school members and superadmins read announcements"
  on public.school_announcements
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = school_announcements.tenant_id
        and tenant.active = true
    )
    and (
      (select public.current_app_role()) = 'superadmin'
      or (
        school_announcements.tenant_id = (select public.current_tenant_id())
        and (select public.current_app_role()) in (
          'admin_sekolah', 'operator', 'guru', 'siswa', 'ortu', 'orang_tua'
        )
      )
    )
  );

drop policy if exists "Entitled school staff create announcements"
  on public.school_announcements;
create policy "Active school staff create announcements"
  on public.school_announcements
  for insert
  to authenticated
  with check (
    (select public.current_user_is_active())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in ('admin_sekolah', 'operator')
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = school_announcements.tenant_id
        and tenant.active = true
    )
    and author_id = (select auth.uid())
  );

drop policy if exists "Entitled school staff update announcements"
  on public.school_announcements;
create policy "Active school staff update announcements"
  on public.school_announcements
  for update
  to authenticated
  using (
    (select public.current_user_is_active())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in ('admin_sekolah', 'operator')
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = school_announcements.tenant_id
        and tenant.active = true
    )
  )
  with check (
    (select public.current_user_is_active())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in ('admin_sekolah', 'operator')
  );

drop policy if exists "School staff delete announcements"
  on public.school_announcements;
create policy "Active school staff delete announcements"
  on public.school_announcements
  for delete
  to authenticated
  using (
    (select public.current_user_is_active())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in ('admin_sekolah', 'operator')
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = school_announcements.tenant_id
        and tenant.active = true
    )
  );

drop policy if exists "Entitled teachers create their own tenant questions"
  on public.question_bank;
create policy "Active teachers create their own tenant questions"
  on public.question_bank
  for insert
  to authenticated
  with check (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) = 'guru'
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = question_bank.tenant_id
        and tenant.active = true
    )
  );

drop policy if exists "Entitled teachers update their own tenant questions"
  on public.question_bank;
create policy "Active teachers update their own tenant questions"
  on public.question_bank
  for update
  to authenticated
  using (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) = 'guru'
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = question_bank.tenant_id
        and tenant.active = true
    )
  )
  with check (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) = 'guru'
  );

drop policy if exists "Entitled teachers delete their own tenant questions"
  on public.question_bank;
create policy "Active teachers delete their own tenant questions"
  on public.question_bank
  for delete
  to authenticated
  using (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) = 'guru'
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = question_bank.tenant_id
        and tenant.active = true
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
  display_name text;
  institution_name text := '';
  assigned_roles text[] := '{}';
begin
  select *
  into invitation
  from public.user_allowlist
  where email = lower(btrim(new.email))
    and active = true;

  if invitation.email is null then
    raise exception using errcode = '42501', message = 'account-not-provisioned';
  end if;

  if invitation.tenant_id is not null then
    select name
    into institution_name
    from public.tenants
    where id = invitation.tenant_id;
  end if;

  assigned_roles := coalesce(
    nullif(invitation.roles, '{}'::text[]),
    array[invitation.role]
  );
  display_name := coalesce(
    nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(btrim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(split_part(coalesce(new.email, ''), '@', 1), ''),
    'Pengguna'
  );

  insert into public.profiles (
    id, email, nama, role, roles, tenant_id, instansi, active
  )
  values (
    new.id,
    nullif(lower(btrim(new.email)), ''),
    left(display_name, 120),
    invitation.role,
    assigned_roles,
    invitation.tenant_id,
    coalesce(institution_name, ''),
    invitation.active and new.email_confirmed_at is not null
  )
  on conflict (id) do update
  set email = excluded.email,
      nama = case
        when public.profiles.role = 'unprovisioned' then excluded.nama
        else public.profiles.nama
      end,
      role = excluded.role,
      roles = excluded.roles,
      tenant_id = excluded.tenant_id,
      instansi = excluded.instansi,
      active = excluded.active;

  return new;
end;
$$;

revoke all on function public.provision_auth_profile()
  from public, anon, authenticated;

create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb;
  app_metadata jsonb;
  profile_roles text[];
  selected_role text;
  app_profile public.profiles%rowtype;
begin
  select *
  into app_profile
  from public.profiles
  where id = (event ->> 'user_id')::uuid;

  profile_roles := coalesce(app_profile.roles, '{}'::text[]);
  if cardinality(profile_roles) = 0 and app_profile.role <> 'unprovisioned' then
    profile_roles := array[app_profile.role];
  end if;

  claims := event -> 'claims';
  selected_role := claims -> 'user_metadata' ->> 'active_role';
  if selected_role is null or not (selected_role = any (profile_roles)) then
    selected_role := app_profile.role;
  end if;

  app_metadata := (coalesce(claims -> 'app_metadata', '{}'::jsonb) - 'trial_expires_at')
    || jsonb_build_object(
      'role', coalesce(selected_role, 'unprovisioned'),
      'roles', to_jsonb(profile_roles),
      'tenant_id', coalesce(app_profile.tenant_id, ''),
      'active', coalesce(app_profile.active, false)
    );

  claims := jsonb_set(claims, '{app_metadata}', app_metadata, true);
  return jsonb_set(event, '{claims}', claims, true);
end;
$$;

revoke all on function public.custom_access_token_hook(jsonb)
  from public, anon, authenticated;
grant usage on schema public to supabase_auth_admin;
grant select on table public.profiles to supabase_auth_admin;
grant execute on function public.custom_access_token_hook(jsonb)
  to supabase_auth_admin;

create or replace function public.current_user_is_active()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select profile.active
      and public.current_app_role() in (
        'superadmin', 'admin_sekolah', 'operator', 'guru', 'siswa',
        'ortu', 'orang_tua', 'kepala_sekolah', 'wali_kelas'
      )
      and case
        when public.current_app_role() in ('admin_sekolah', 'superadmin')
          then auth.jwt() ->> 'aal' = 'aal2'
        else true
      end
    from public.profiles as profile
    where profile.id = auth.uid()
  ), false)
$$;

revoke all on function public.current_user_is_active() from public, anon;
grant execute on function public.current_user_is_active() to authenticated;

create or replace function public.current_app_role()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select case
      when auth.jwt() -> 'app_metadata' ->> 'role'
        in ('guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler')
        then 'guru'
      else auth.jwt() -> 'app_metadata' ->> 'role'
    end
    from public.profiles as profile
    where profile.id = auth.uid()
      and profile.active
      and auth.jwt() -> 'app_metadata' ->> 'role' = any (
        case
          when cardinality(profile.roles) > 0 then profile.roles
          when profile.role <> 'unprovisioned' then array[profile.role]
          else '{}'::text[]
        end
      )
  ), '')
$$;

revoke all on function public.current_app_role() from public, anon;
grant execute on function public.current_app_role() to authenticated;

create or replace function public.current_tenant_id()
returns text
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce((
    select profile.tenant_id
    from public.profiles as profile
    where profile.id = auth.uid()
      and profile.active
  ), '')
$$;

revoke all on function public.current_tenant_id() from public, anon;
grant execute on function public.current_tenant_id() to authenticated;

drop function if exists public.finalize_midtrans_payment(text, text, text, text, integer);
drop table if exists public.payment_orders;
drop table if exists public.personal_entitlements;
drop table if exists public.billing_plans;
drop table if exists public.trial_registrations;
drop table if exists public.tenant_entitlements;
alter table public.profiles drop column if exists trial_expires_at;
