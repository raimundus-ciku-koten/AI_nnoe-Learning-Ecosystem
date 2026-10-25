create or replace function public.school_admin_classroom_material_catalog()
returns table (
  material_id uuid,
  classroom_id uuid,
  classroom_name text,
  subject text,
  title text,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_tenant_id text := (select public.current_tenant_id());
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) not in ('admin', 'admin_sekolah')
    or not exists (
      select 1
      from public.tenants as tenant
      where tenant.id = active_tenant_id
        and tenant.active = true
    ) then
    raise exception 'Admin sekolah aktif dan tenant aktif diperlukan.'
      using errcode = '42501';
  end if;

  return query
  select
    material.id,
    material.classroom_id,
    classroom.name,
    coalesce(classroom.subject, ''),
    material.title,
    material.created_at,
    material.updated_at
  from public.learning_classroom_materials as material
  join public.learning_classrooms as classroom
    on classroom.id = material.classroom_id
   and classroom.tenant_id = material.tenant_id
  where material.tenant_id = active_tenant_id
  order by material.updated_at desc, material.id desc
  limit 50;
end;
$$;

revoke all on function public.school_admin_classroom_material_catalog()
  from public, anon, authenticated;
grant execute on function public.school_admin_classroom_material_catalog()
  to authenticated;

comment on function public.school_admin_classroom_material_catalog() is
  'Admin-only active-tenant catalog of the latest 50 classroom material titles and classroom labels; does not return material bodies or student data.';
