alter table public.tenants
  add column if not exists address text,
  add column if not exists letterhead_object_path text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tenants_address_length_check'
      and conrelid = 'public.tenants'::regclass
  ) then
    alter table public.tenants
      add constraint tenants_address_length_check
      check (address is null or (char_length(address) <= 300 and address !~ '[[:cntrl:]]'));
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'tenants_letterhead_path_check'
      and conrelid = 'public.tenants'::regclass
  ) then
    alter table public.tenants
      add constraint tenants_letterhead_path_check
      check (
        letterhead_object_path is null
        or letterhead_object_path = id || '/letterhead'
      );
  end if;
end;
$$;

grant update (address, letterhead_object_path, updated_by)
  on table public.tenants to authenticated;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'school-letterheads',
  'school-letterheads',
  false,
  2097152,
  array['image/png', 'image/jpeg', 'image/webp']::text[]
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "Active tenant members read school letterhead" on storage.objects;
create policy "Active tenant members read school letterhead"
  on storage.objects
  for select
  to authenticated
  using (
    bucket_id = 'school-letterheads'
    and name = (storage.foldername(name))[1] || '/letterhead'
    and (select public.current_user_is_active())
    and (
      (select public.current_app_role()) = 'superadmin'
      or (
        (storage.foldername(name))[1] = (select public.current_tenant_id())
        and exists (
          select 1 from public.tenants as tenant
          where tenant.id = (storage.foldername(name))[1]
            and tenant.active = true
        )
      )
    )
  );

drop policy if exists "Active school admins upload school letterhead" on storage.objects;
create policy "Active school admins upload school letterhead"
  on storage.objects
  for insert
  to authenticated
  with check (
    bucket_id = 'school-letterheads'
    and name = (storage.foldername(name))[1] || '/letterhead'
    and (select public.current_user_is_active())
    and (
      (select public.current_app_role()) = 'superadmin'
      or (
        (select public.current_app_role()) = 'admin_sekolah'
        and (storage.foldername(name))[1] = (select public.current_tenant_id())
        and exists (
          select 1 from public.tenants as tenant
          where tenant.id = (storage.foldername(name))[1]
            and tenant.active = true
        )
      )
    )
  );

drop policy if exists "Active school admins replace school letterhead" on storage.objects;
create policy "Active school admins replace school letterhead"
  on storage.objects
  for update
  to authenticated
  using (
    bucket_id = 'school-letterheads'
    and name = (storage.foldername(name))[1] || '/letterhead'
    and (select public.current_user_is_active())
    and (
      (select public.current_app_role()) = 'superadmin'
      or (
        (select public.current_app_role()) = 'admin_sekolah'
        and (storage.foldername(name))[1] = (select public.current_tenant_id())
        and exists (
          select 1 from public.tenants as tenant
          where tenant.id = (storage.foldername(name))[1]
            and tenant.active = true
        )
      )
    )
  )
  with check (
    bucket_id = 'school-letterheads'
    and name = (storage.foldername(name))[1] || '/letterhead'
    and (select public.current_user_is_active())
    and (
      (select public.current_app_role()) = 'superadmin'
      or (
        (select public.current_app_role()) = 'admin_sekolah'
        and (storage.foldername(name))[1] = (select public.current_tenant_id())
        and exists (
          select 1 from public.tenants as tenant
          where tenant.id = (storage.foldername(name))[1]
            and tenant.active = true
        )
      )
    )
  );

drop policy if exists "Active school admins delete school letterhead" on storage.objects;
create policy "Active school admins delete school letterhead"
  on storage.objects
  for delete
  to authenticated
  using (
    bucket_id = 'school-letterheads'
    and name = (storage.foldername(name))[1] || '/letterhead'
    and (select public.current_user_is_active())
    and (
      (select public.current_app_role()) = 'superadmin'
      or (
        (select public.current_app_role()) = 'admin_sekolah'
        and (storage.foldername(name))[1] = (select public.current_tenant_id())
      )
    )
  );