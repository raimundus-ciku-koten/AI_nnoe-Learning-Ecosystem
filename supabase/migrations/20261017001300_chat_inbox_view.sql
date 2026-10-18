create or replace view public.chat_inbox
with (security_invoker = true)
as
select
  conversation.id as conversation_id,
  member.user_id,
  conversation.type,
  case
    when conversation.type = 'group'
      then coalesce(nullif(conversation.title, ''), 'Grup')
    else coalesce(
      nullif(conversation.participant_names ->> peer.user_id::text, ''),
      'Pengguna'
    )
  end as name,
  peer.user_id as peer_user_id,
  case latest.type
    when 'text' then case
      when char_length(regexp_replace(
        btrim(latest.body),
        '[[:space:]]+',
        ' ',
        'g'
      )) > 200
        then left(regexp_replace(
          btrim(latest.body),
          '[[:space:]]+',
          ' ',
          'g'
        ), 199) || '…'
      else regexp_replace(
        btrim(latest.body),
        '[[:space:]]+',
        ' ',
        'g'
      )
    end
    when 'image' then 'Foto'
    when 'file' then 'Berkas: ' || case
      when char_length(regexp_replace(
        btrim(coalesce(latest.file_name, '')),
        '[[:space:]]+',
        ' ',
        'g'
      )) > 80
        then left(regexp_replace(
          btrim(coalesce(latest.file_name, '')),
          '[[:space:]]+',
          ' ',
          'g'
        ), 79) || '…'
      else regexp_replace(
        btrim(coalesce(latest.file_name, '')),
        '[[:space:]]+',
        ' ',
        'g'
      )
    end
    else ''
  end as last_text,
  coalesce(latest.created_at, conversation.created_at) as last_message_at,
  latest.sender_id as last_sender_id,
  (
    select count(*)
    from public.chat_messages as unread_message
    where unread_message.conversation_id = conversation.id
      and unread_message.sender_id <> member.user_id
      and unread_message.created_at > coalesce(
        receipt.last_read_at,
        conversation.created_at
      )
  ) as unread_count
from public.chat_conversations as conversation
cross join lateral unnest(conversation.participant_ids) as member(user_id)
left join lateral (
  select other_member.user_id
  from unnest(conversation.participant_ids) as other_member(user_id)
  where conversation.type = 'direct'
    and other_member.user_id <> member.user_id
  limit 1
) as peer on true
left join public.chat_read_receipts as receipt
  on receipt.conversation_id = conversation.id
  and receipt.user_id = member.user_id
left join lateral (
  select
    message.type,
    message.body,
    message.file_name,
    message.sender_id,
    message.created_at
  from public.chat_messages as message
  where message.conversation_id = conversation.id
  order by message.created_at desc, message.id desc
  limit 1
) as latest on true
where member.user_id = (select auth.uid())
  and (select public.current_user_is_active());

revoke all on public.chat_inbox from public, anon, authenticated;
grant select on public.chat_inbox to authenticated;
