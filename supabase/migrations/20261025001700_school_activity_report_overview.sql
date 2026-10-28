create or replace function public.school_admin_activity_report_overview()
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
  select 'classrooms_current'::text, count(*)::bigint
  from public.learning_classrooms as classroom
  where classroom.tenant_id = active_tenant_id

  union all

  select 'lesson_journals_30d'::text, count(*)::bigint
  from public.learning_classroom_journals as journal
  where journal.tenant_id = active_tenant_id
    and journal.lesson_date >= current_date - 29

  union all

  select 'attendance_sessions_30d'::text, count(*)::bigint
  from public.learning_classroom_attendance_sessions as session
  where session.tenant_id = active_tenant_id
    and session.attendance_date >= current_date - 29

  union all

  select 'assignments_30d'::text, count(*)::bigint
  from public.learning_classroom_assignments as assignment
  where assignment.tenant_id = active_tenant_id
    and assignment.created_at >= now() - interval '30 days'

  union all

  select 'quizzes_30d'::text, count(*)::bigint
  from public.learning_classroom_quizzes as quiz
  where quiz.tenant_id = active_tenant_id
    and quiz.created_at >= now() - interval '30 days';
end;
$$;

revoke all on function public.school_admin_activity_report_overview()
  from public, anon, authenticated;
grant execute on function public.school_admin_activity_report_overview()
  to authenticated;

comment on function public.school_admin_activity_report_overview() is
  'Admin-only tenant-scoped aggregate counts from classroom modules; excludes individual student and user-generated content and is not a complete school report.';
