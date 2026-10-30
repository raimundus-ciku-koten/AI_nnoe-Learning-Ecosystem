create or replace function public.platform_usage_snapshot()
returns table (
  snapshot_at timestamptz,
  tenant_count bigint,
  active_tenant_count bigint,
  profile_count bigint,
  active_profile_count bigint,
  school_admin_count bigint,
  student_count bigint,
  attendance_scan_90d bigint,
  chat_messages_30d bigint,
  exams_30d bigint,
  question_bank_count bigint,
  published_content_count bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'superadmin'
  then
    raise exception 'Superadmin aktif diperlukan untuk melihat snapshot platform.'
      using errcode = '42501';
  end if;

  return query
  with active_tenants as (
    select tenant.id from public.tenants as tenant where tenant.active = true
  ), scoped_conversations as (
    select conversation.id
    from public.chat_conversations as conversation
    where cardinality(conversation.participant_ids) between 2 and 50
      and not exists (
        select 1
        from unnest(conversation.participant_ids) as participant(user_id)
        left join public.profiles as profile on profile.id = participant.user_id
        where profile.id is null or profile.active is not true
          or profile.tenant_id is null
          or not exists (select 1 from active_tenants as tenant where tenant.id = profile.tenant_id)
      )
      and (
        select count(distinct profile.tenant_id)
        from unnest(conversation.participant_ids) as participant(user_id)
        join public.profiles as profile on profile.id = participant.user_id
      ) = 1
  )
  select
    now(),
    (select count(*) from public.tenants),
    (select count(*) from active_tenants),
    (select count(*) from public.profiles),
    (select count(*) from public.profiles as profile where profile.active = true),
    (select count(*) from public.profiles as profile
      where profile.active = true and profile.role = 'admin_sekolah'
        and exists (select 1 from active_tenants as tenant where tenant.id = profile.tenant_id)),
    (select count(*) from public.students as student
      where exists (select 1 from active_tenants as tenant where tenant.id = student.tenant_id)),
    (select count(*) from public.attendance_records as attendance
      where attendance.status = 'hadir' and attendance.metode = 'scan'
        and attendance.tanggal >= current_date - 89
        and exists (select 1 from active_tenants as tenant where tenant.id = attendance.tenant_id)),
    (select count(*) from public.chat_messages as message
      join scoped_conversations as conversation on conversation.id = message.conversation_id
      where message.created_at >= now() - interval '30 days'),
    (select count(*) from public.online_exams as exam
      where exam.created_at >= now() - interval '30 days'
        and exists (select 1 from active_tenants as tenant where tenant.id = exam.tenant_id)),
    (select count(*) from public.question_bank as question
      where exists (select 1 from active_tenants as tenant where tenant.id = question.tenant_id)),
    (select count(*) from public.platform_content_catalog as content where content.status = 'published');
end;
$$;

revoke all on function public.platform_usage_snapshot() from public, anon;
grant execute on function public.platform_usage_snapshot() to authenticated;
