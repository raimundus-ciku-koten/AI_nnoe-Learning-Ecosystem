drop policy if exists "Chat participants receive private call signaling"
  on realtime.messages;
create policy "Chat participants receive private call signaling"
  on realtime.messages
  for select
  to authenticated
  using (
    extension = 'broadcast'
    and (select public.current_user_is_active())
    and exists (
      select 1
      from public.chat_conversations as conversation
      where (select realtime.topic()) = 'chat-call:' || conversation.id::text
        and (select auth.uid()) = any(conversation.participant_ids)
        and (
          (
            conversation.type = 'direct'
            and cardinality(conversation.participant_ids) = 2
            and exists (
              select 1
              from unnest(conversation.participant_ids) as peer(user_id)
              join public.chat_contacts as contact
                on (
                  (
                    contact.from_user_id = (select auth.uid())
                    and contact.to_user_id = peer.user_id
                  )
                  or (
                    contact.to_user_id = (select auth.uid())
                    and contact.from_user_id = peer.user_id
                  )
                )
              where peer.user_id <> (select auth.uid())
                and contact.status = 'accepted'
            )
          )
          or (
            conversation.type = 'group'
            and cardinality(conversation.participant_ids) between 2 and 4
          )
        )
    )
  );

drop policy if exists "Chat participants send private call signaling"
  on realtime.messages;
create policy "Chat participants send private call signaling"
  on realtime.messages
  for insert
  to authenticated
  with check (
    extension = 'broadcast'
    and (select public.current_user_is_active())
    and exists (
      select 1
      from public.chat_conversations as conversation
      where (select realtime.topic()) = 'chat-call:' || conversation.id::text
        and (select auth.uid()) = any(conversation.participant_ids)
        and (
          (
            conversation.type = 'direct'
            and cardinality(conversation.participant_ids) = 2
            and exists (
              select 1
              from unnest(conversation.participant_ids) as peer(user_id)
              join public.chat_contacts as contact
                on (
                  (
                    contact.from_user_id = (select auth.uid())
                    and contact.to_user_id = peer.user_id
                  )
                  or (
                    contact.to_user_id = (select auth.uid())
                    and contact.from_user_id = peer.user_id
                  )
                )
              where peer.user_id <> (select auth.uid())
                and contact.status = 'accepted'
            )
          )
          or (
            conversation.type = 'group'
            and cardinality(conversation.participant_ids) between 2 and 4
          )
        )
    )
  );
