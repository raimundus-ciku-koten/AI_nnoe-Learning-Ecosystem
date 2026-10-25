create or replace function public.school_admin_recent_activity()
returns table (
  event_key text,
  event_label text,
  occurred_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) not in ('admin', 'admin_sekolah')
    or not exists (
      select 1 from public.tenants as tenant
      where tenant.id = (select public.current_tenant_id())
        and tenant.active = true
    ) then
    raise exception 'Admin sekolah aktif dan tenant aktif diperlukan.'
      using errcode = '42501';
  end if;

  return query
  select activity.event_key, activity.event_label, activity.occurred_at
  from (
    select 'announcement'::text as event_key,
      'Pengumuman sekolah dibuat'::text as event_label,
      announcement.created_at as occurred_at
    from public.school_announcements as announcement
    where announcement.tenant_id = (select public.current_tenant_id())

    union all

    select 'classroom', 'Ruang kelas dibuat', classroom.created_at
    from public.learning_classrooms as classroom
    where classroom.tenant_id = (select public.current_tenant_id())

    union all

    select 'assignment', 'Tugas ruang kelas dibuat', assignment.created_at
    from public.learning_classroom_assignments as assignment
    where assignment.tenant_id = (select public.current_tenant_id())

    union all

    select 'quiz', 'Kuis ruang kelas dibuat', quiz.created_at
    from public.learning_classroom_quizzes as quiz
    where quiz.tenant_id = (select public.current_tenant_id())

    union all

    select 'online_exam', 'Ujian online dijadwalkan', exam.created_at
    from public.online_exams as exam
    where exam.tenant_id = (select public.current_tenant_id())

    union all

    select 'guardian_link', 'Status verifikasi wali-siswa diperbarui', link_audit.created_at
    from public.student_guardian_link_audit as link_audit
    where link_audit.tenant_id = (select public.current_tenant_id())
  ) as activity
  where activity.occurred_at >= now() - interval '30 days'
  order by activity.occurred_at desc, activity.event_key
  limit 100;
end;
$$;

revoke all on function public.school_admin_recent_activity()
  from public, anon, authenticated;
grant execute on function public.school_admin_recent_activity()
  to authenticated;

create or replace function public.school_admin_chat_overview()
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
      select 1 from public.tenants as tenant
      where tenant.id = active_tenant_id
        and tenant.active = true
    ) then
    raise exception 'Admin sekolah aktif dan tenant aktif diperlukan.'
      using errcode = '42501';
  end if;

  return query
  select 'conversations_created_30d'::text, count(*)::bigint
  from public.chat_conversations as conversation
  where conversation.created_at >= now() - interval '30 days'
    and exists (
      select 1
      from unnest(conversation.participant_ids) as participant(user_id)
      join public.profiles as profile on profile.id = participant.user_id
      where profile.tenant_id = active_tenant_id and profile.active = true
    )
    and not exists (
      select 1
      from unnest(conversation.participant_ids) as participant(user_id)
      left join public.profiles as profile on profile.id = participant.user_id
      where profile.id is null
        or profile.active is not true
        or profile.tenant_id is distinct from active_tenant_id
    )

  union all

  select 'messages_7d', count(*)::bigint
  from public.chat_messages as message
  join public.chat_conversations as conversation
    on conversation.id = message.conversation_id
  join public.profiles as sender
    on sender.id = message.sender_id
    and sender.tenant_id = active_tenant_id
    and sender.active = true
  where message.created_at >= now() - interval '7 days'
    and message.sender_id = any(conversation.participant_ids)
    and exists (
      select 1
      from unnest(conversation.participant_ids) as participant(user_id)
      join public.profiles as profile on profile.id = participant.user_id
      where profile.tenant_id = active_tenant_id and profile.active = true
    )
    and not exists (
      select 1
      from unnest(conversation.participant_ids) as participant(user_id)
      left join public.profiles as profile on profile.id = participant.user_id
      where profile.id is null
        or profile.active is not true
        or profile.tenant_id is distinct from active_tenant_id
    )

  union all

  select 'active_senders_30d', count(distinct message.sender_id)::bigint
  from public.chat_messages as message
  join public.chat_conversations as conversation
    on conversation.id = message.conversation_id
  join public.profiles as sender
    on sender.id = message.sender_id
    and sender.tenant_id = active_tenant_id
    and sender.active = true
  where message.created_at >= now() - interval '30 days'
    and message.sender_id = any(conversation.participant_ids)
    and not exists (
      select 1
      from unnest(conversation.participant_ids) as participant(user_id)
      left join public.profiles as profile on profile.id = participant.user_id
      where profile.id is null
        or profile.active is not true
        or profile.tenant_id is distinct from active_tenant_id
    );
end;
$$;

revoke all on function public.school_admin_chat_overview()
  from public, anon, authenticated;
grant execute on function public.school_admin_chat_overview()
  to authenticated;

comment on function public.school_admin_recent_activity() is
  'Admin-only, same-tenant, content-free activity feed from explicitly tracked school modules; not a complete audit log.';
comment on function public.school_admin_chat_overview() is
  'Admin-only same-tenant aggregate counts; never returns message content or participant identity.';
