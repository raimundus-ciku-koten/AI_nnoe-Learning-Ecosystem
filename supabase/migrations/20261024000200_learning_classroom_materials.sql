create table if not exists public.learning_classroom_materials (
  id uuid primary key default gen_random_uuid(),
  classroom_id uuid not null,
  tenant_id text not null references public.tenants(id) on delete restrict,
  title text not null check (
    char_length(title) between 1 and 120
    and title = btrim(title)
    and title !~ '[[:cntrl:]]'
  ),
  content text not null check (
    char_length(content) between 1 and 20000
    and content = btrim(content)
  ),
  created_by uuid not null default auth.uid()
    references public.profiles(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (classroom_id, tenant_id)
    references public.learning_classrooms(id, tenant_id) on delete cascade
);

create index if not exists learning_classroom_materials_classroom_created_idx
  on public.learning_classroom_materials (tenant_id, classroom_id, created_at desc);

drop trigger if exists learning_classroom_materials_set_updated_at
  on public.learning_classroom_materials;
create trigger learning_classroom_materials_set_updated_at
  before update on public.learning_classroom_materials
  for each row execute function public.set_updated_at();

alter table public.learning_classroom_materials enable row level security;

revoke all on table public.learning_classroom_materials from public, anon, authenticated;
grant select, insert, update, delete on table public.learning_classroom_materials
  to authenticated;
grant all on table public.learning_classroom_materials to service_role;

drop policy if exists "Active classroom members read materials"
  on public.learning_classroom_materials;
create policy "Active classroom members read materials"
  on public.learning_classroom_materials
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = learning_classroom_materials.tenant_id
        and tenant.active = true
    )
    and (
      (select public.current_app_role()) = 'superadmin'
      or (
        tenant_id = (select public.current_tenant_id())
        and (
          (select public.current_app_role()) in ('admin_sekolah', 'operator')
          or exists (
            select 1
            from public.classroom_members as member
            where member.classroom_id = learning_classroom_materials.classroom_id
              and member.tenant_id = learning_classroom_materials.tenant_id
              and member.user_id = (select auth.uid())
          )
        )
      )
    )
  );

drop policy if exists "Assigned teachers create classroom materials"
  on public.learning_classroom_materials;
create policy "Assigned teachers create classroom materials"
  on public.learning_classroom_materials
  for insert
  to authenticated
  with check (
    (select public.current_user_is_active())
    and (select public.current_app_role()) in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
    and tenant_id = (select public.current_tenant_id())
    and created_by = (select auth.uid())
    and exists (
      select 1
      from public.tenants as tenant
      join public.classroom_members as member
        on member.tenant_id = tenant.id
       and member.classroom_id = learning_classroom_materials.classroom_id
       and member.user_id = (select auth.uid())
       and member.member_role = 'guru'
      where tenant.id = learning_classroom_materials.tenant_id
        and tenant.active = true
    )
  );

drop policy if exists "Assigned teachers update their classroom materials"
  on public.learning_classroom_materials;
create policy "Assigned teachers update their classroom materials"
  on public.learning_classroom_materials
  for update
  to authenticated
  using (
    (select public.current_user_is_active())
    and (select public.current_app_role()) in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
    and tenant_id = (select public.current_tenant_id())
    and created_by = (select auth.uid())
    and exists (
      select 1
      from public.classroom_members as member
      join public.tenants as tenant on tenant.id = member.tenant_id and tenant.active = true
      where member.classroom_id = learning_classroom_materials.classroom_id
        and member.tenant_id = learning_classroom_materials.tenant_id
        and member.user_id = (select auth.uid())
        and member.member_role = 'guru'
    )
  )
  with check (
    (select public.current_user_is_active())
    and (select public.current_app_role()) in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
    and tenant_id = (select public.current_tenant_id())
    and created_by = (select auth.uid())
    and exists (
      select 1
      from public.classroom_members as member
      join public.tenants as tenant on tenant.id = member.tenant_id and tenant.active = true
      where member.classroom_id = learning_classroom_materials.classroom_id
        and member.tenant_id = learning_classroom_materials.tenant_id
        and member.user_id = (select auth.uid())
        and member.member_role = 'guru'
    )
  );

drop policy if exists "Assigned teachers delete their classroom materials"
  on public.learning_classroom_materials;
create policy "Assigned teachers delete their classroom materials"
  on public.learning_classroom_materials
  for delete
  to authenticated
  using (
    (select public.current_user_is_active())
    and (select public.current_app_role()) in (
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
    and tenant_id = (select public.current_tenant_id())
    and created_by = (select auth.uid())
    and exists (
      select 1
      from public.classroom_members as member
      join public.tenants as tenant on tenant.id = member.tenant_id and tenant.active = true
      where member.classroom_id = learning_classroom_materials.classroom_id
        and member.tenant_id = learning_classroom_materials.tenant_id
        and member.user_id = (select auth.uid())
        and member.member_role = 'guru'
    )
  );
