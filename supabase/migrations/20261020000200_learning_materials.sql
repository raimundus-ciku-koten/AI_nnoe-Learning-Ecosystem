create table if not exists public.learning_materials (
  id uuid primary key default gen_random_uuid(),
  tenant_id text not null references public.tenants(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  title text not null check (char_length(title) between 1 and 160),
  subject text not null check (char_length(subject) between 1 and 80),
  kelas text not null check (char_length(kelas) between 1 and 30),
  file_name text not null check (char_length(file_name) between 1 and 255),
  mime_type text not null check (
    mime_type in (
      'application/pdf',
      'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
    )
  ),
  storage_path text not null unique,
  created_at timestamptz not null default now()
);

create index if not exists learning_materials_tenant_created_idx
  on public.learning_materials (tenant_id, created_at desc);

alter table public.learning_materials enable row level security;
revoke all on table public.learning_materials from public, anon, authenticated;
grant select, insert, delete on table public.learning_materials to authenticated;
grant all on table public.learning_materials to service_role;

drop policy if exists "Active tenant members read learning materials"
  on public.learning_materials;
create policy "Active tenant members read learning materials"
  on public.learning_materials
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and tenant_id = (select public.current_tenant_id())
    and exists (
      select 1
      from public.tenants tenant
      where tenant.id = learning_materials.tenant_id
        and tenant.active = true
    )
  );

drop policy if exists "Active teachers publish tenant learning materials"
  on public.learning_materials;
create policy "Active teachers publish tenant learning materials"
  on public.learning_materials
  for insert
  to authenticated
  with check (
    (select public.current_user_is_active())
    and (select public.current_app_role()) = 'guru'
    and tenant_id = (select public.current_tenant_id())
    and owner_id = (select auth.uid())
    and storage_path like tenant_id || '/' || owner_id::text || '/%'
  );

drop policy if exists "Teachers remove their own learning materials"
  on public.learning_materials;
create policy "Teachers remove their own learning materials"
  on public.learning_materials
  for delete
  to authenticated
  using (
    (select public.current_user_is_active())
    and (select public.current_app_role()) = 'guru'
    and tenant_id = (select public.current_tenant_id())
    and owner_id = (select auth.uid())
  );

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'learning-materials',
  'learning-materials',
  false,
  20971520,
  array[
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Tenant members read shared learning material files"
  on storage.objects;
create policy "Tenant members read shared learning material files"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'learning-materials'
    and exists (
      select 1
      from public.learning_materials material
      where material.storage_path = storage.objects.name
        and material.tenant_id = (select public.current_tenant_id())
        and (select public.current_user_is_active())
    )
  );

drop policy if exists "Teachers upload their own learning material files"
  on storage.objects;
create policy "Teachers upload their own learning material files"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'learning-materials'
    and (select public.current_user_is_active())
    and (select public.current_app_role()) = 'guru'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );

drop policy if exists "Teachers remove their own learning material files"
  on storage.objects;
create policy "Teachers remove their own learning material files"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'learning-materials'
    and (select public.current_user_is_active())
    and (select public.current_app_role()) = 'guru'
    and (storage.foldername(name))[1] = (select public.current_tenant_id())
    and (storage.foldername(name))[2] = (select auth.uid())::text
  );
