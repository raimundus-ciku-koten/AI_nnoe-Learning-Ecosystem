create table if not exists public.lesson_journals (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete restrict,
  owner_id uuid not null references auth.users(id) on delete cascade,
  tanggal date not null,
  kelas text not null check (
    char_length(kelas) between 1 and 120
    and kelas = btrim(kelas)
  ),
  mapel text not null default '' check (
    char_length(mapel) <= 120
    and mapel = btrim(mapel)
  ),
  jam text not null check (
    char_length(jam) between 1 and 20
    and jam ~ '^[0-9A-Za-z-]+$'
  ),
  materi text not null check (
    char_length(materi) between 1 and 2000
    and materi = btrim(materi)
  ),
  kegiatan text not null default '' check (
    char_length(kegiatan) <= 4000
    and kegiatan = btrim(kegiatan)
  ),
  kendala text not null default '' check (
    char_length(kendala) <= 2000
    and kendala = btrim(kendala)
  ),
  tindak_lanjut text not null default '' check (
    char_length(tindak_lanjut) <= 2000
    and tindak_lanjut = btrim(tindak_lanjut)
  ),
  status text not null default 'draft' check (status in ('draft', 'final')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists lesson_journals_owner_date_idx
  on public.lesson_journals (tenant_id, owner_id, tanggal desc, created_at desc);

drop trigger if exists lesson_journals_set_updated_at on public.lesson_journals;
create trigger lesson_journals_set_updated_at
  before update on public.lesson_journals
  for each row execute function public.set_updated_at();

alter table public.lesson_journals enable row level security;

revoke all on table public.lesson_journals from public, anon, authenticated;
grant select, delete on table public.lesson_journals to authenticated;
grant insert (
  tenant_id, owner_id, tanggal, kelas, mapel, jam, materi, kegiatan, kendala,
  tindak_lanjut, status
) on table public.lesson_journals to authenticated;
grant update (
  tanggal, kelas, mapel, jam, materi, kegiatan, kendala, tindak_lanjut, status
) on table public.lesson_journals to authenticated;
grant all on table public.lesson_journals to service_role;

drop policy if exists "Active teachers read their own lesson journals"
  on public.lesson_journals;
create policy "Active teachers read their own lesson journals"
  on public.lesson_journals
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) = 'guru'
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = lesson_journals.tenant_id
        and tenant.active = true
    )
  );

drop policy if exists "Entitled teachers create assigned-class lesson journals"
  on public.lesson_journals;
create policy "Entitled teachers create assigned-class lesson journals"
  on public.lesson_journals
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
      where tenant.id = lesson_journals.tenant_id
        and tenant.active = true
    )
    and exists (
      select 1
      from public.profiles as profile
      where profile.id = (select auth.uid())
        and profile.tenant_id = lesson_journals.tenant_id
        and lesson_journals.kelas = any(profile.kelas_ids)
        and (
          lesson_journals.mapel = ''
          or lesson_journals.mapel = any(profile.mapel_ids)
        )
    )
    and (
      exists (
        select 1
        from public.tenant_entitlements as entitlement
        where entitlement.tenant_id = lesson_journals.tenant_id
          and entitlement.status in ('trial', 'active')
          and (entitlement.valid_until is null or entitlement.valid_until > now())
      )
      or exists (
        select 1
        from public.personal_entitlements as entitlement
        join public.billing_plans as plan on plan.id = entitlement.plan_id
        where entitlement.user_id = (select auth.uid())
          and entitlement.status in ('trial', 'active')
          and (entitlement.valid_until is null or entitlement.valid_until > now())
          and plan.allowed_role = 'guru'
          and plan.active = true
      )
    )
  );

drop policy if exists "Entitled teachers update their own lesson journals"
  on public.lesson_journals;
create policy "Entitled teachers update their own lesson journals"
  on public.lesson_journals
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
      where tenant.id = lesson_journals.tenant_id
        and tenant.active = true
    )
  )
  with check (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) = 'guru'
    and exists (
      select 1
      from public.profiles as profile
      where profile.id = (select auth.uid())
        and profile.tenant_id = lesson_journals.tenant_id
        and lesson_journals.kelas = any(profile.kelas_ids)
        and (
          lesson_journals.mapel = ''
          or lesson_journals.mapel = any(profile.mapel_ids)
        )
    )
    and (
      exists (
        select 1
        from public.tenant_entitlements as entitlement
        where entitlement.tenant_id = lesson_journals.tenant_id
          and entitlement.status in ('trial', 'active')
          and (entitlement.valid_until is null or entitlement.valid_until > now())
      )
      or exists (
        select 1
        from public.personal_entitlements as entitlement
        join public.billing_plans as plan on plan.id = entitlement.plan_id
        where entitlement.user_id = (select auth.uid())
          and entitlement.status in ('trial', 'active')
          and (entitlement.valid_until is null or entitlement.valid_until > now())
          and plan.allowed_role = 'guru'
          and plan.active = true
      )
    )
  );

drop policy if exists "Active teachers delete their own lesson journals"
  on public.lesson_journals;
create policy "Active teachers delete their own lesson journals"
  on public.lesson_journals
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
      where tenant.id = lesson_journals.tenant_id
        and tenant.active = true
    )
  );