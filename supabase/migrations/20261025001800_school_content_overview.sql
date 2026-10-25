create or replace function public.school_admin_content_overview()
returns table (
  metric_key text,
  metric_value bigint
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
  select 'classroom_materials_current'::text, count(*)::bigint
  from public.learning_classroom_materials as material
  where material.tenant_id = active_tenant_id

  union all

  select 'classroom_materials_30d'::text, count(*)::bigint
  from public.learning_classroom_materials as material
  where material.tenant_id = active_tenant_id
    and material.created_at >= now() - interval '30 days'

  union all

  select 'school_announcements_30d'::text, count(*)::bigint
  from public.school_announcements as announcement
  where announcement.tenant_id = active_tenant_id
    and announcement.created_at >= now() - interval '30 days';
end;
$$;

revoke all on function public.school_admin_content_overview()
  from public, anon, authenticated;
grant execute on function public.school_admin_content_overview()
  to authenticated;

comment on function public.school_admin_content_overview() is
  'Admin-only tenant-scoped counts for stored classroom materials and school announcements; returns no titles, bodies, student identities, or encrypted planning documents.';
