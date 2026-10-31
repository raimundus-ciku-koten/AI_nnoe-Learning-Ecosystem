create or replace function public.school_admin_chat_overview()
returns table (
  conversation_count bigint,
  active_conversations_30d bigint,
  messages_7d bigint,
  messages_30d bigint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null
    or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'admin_sekolah'
    or not exists (
      select 1 from public.tenants as tenant
      where tenant.id = (select public.current_tenant_id())
        and tenant.active = true
    )
  then
    raise exception 'Admin sekolah aktif diperlukan untuk melihat agregat chat tenant.'
      using errcode = '42501';
  end if;

  return query
  with scoped_conversations as (
    select conversation.id
    from public.chat_conversations as conversation
    where cardinality(conversation.participant_ids) between 2 and 50
      and not exists (
        select 1
        from unnest(conversation.participant_ids) as participant(user_id)
        left join public.profiles as profile on profile.id = participant.user_id
        where profile.id is null
          or profile.active is not true
          or profile.tenant_id is distinct from (select public.current_tenant_id())
      )
  ), scoped_messages as (
    select message.conversation_id, message.created_at
    from public.chat_messages as message
    join scoped_conversations as conversation on conversation.id = message.conversation_id
  )
  select
    (select count(*) from scoped_conversations),
    (select count(distinct message.conversation_id)
      from scoped_messages as message where message.created_at >= now() - interval '30 days'),
    (select count(*) from scoped_messages as message where message.created_at >= now() - interval '7 days'),
    (select count(*) from scoped_messages as message where message.created_at >= now() - interval '30 days');
end;
$$;

revoke all on function public.school_admin_chat_overview() from public, anon;
grant execute on function public.school_admin_chat_overview() to authenticated;
