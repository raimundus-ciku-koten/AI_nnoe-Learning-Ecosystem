create or replace function public.list_chat_attachment_recipients(
  p_conversation_id uuid
)
returns table (
  user_id uuid,
  email text,
  public_key text,
  fingerprint text,
  key_version smallint
)
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_participant_count integer;
  v_recipient_count integer;
begin
  if (select auth.uid()) is null or not (select public.current_user_is_active()) then
    raise exception 'Pengguna aktif wajib masuk untuk mengakses kunci lampiran.'
      using errcode = '42501';
  end if;

  select cardinality(conversation.participant_ids)
    into v_participant_count
  from public.chat_conversations as conversation
  where conversation.id = p_conversation_id
    and (select auth.uid()) = any(conversation.participant_ids);

  if v_participant_count is null then
    raise exception 'Percakapan tidak ditemukan atau pengguna bukan anggotanya.'
      using errcode = '42501';
  end if;

  return query
    select profile.id, profile.email, encryption_key.public_key,
      encryption_key.fingerprint, encryption_key.key_version
    from public.chat_conversations as conversation
    join public.profiles as requester
      on requester.id = (select auth.uid())
    join lateral unnest(conversation.participant_ids) as participant(id)
      on true
    join public.profiles as profile
      on profile.id = participant.id
    join public.user_encryption_keys as encryption_key
      on encryption_key.user_id = profile.id
    where conversation.id = p_conversation_id
      and profile.active is true
      and profile.role not in ('unprovisioned', 'demo')
      and profile.email is not null
      and profile.tenant_id = requester.tenant_id
    order by profile.id;

  get diagnostics v_recipient_count = row_count;
  if v_recipient_count <> v_participant_count then
    raise exception 'Setiap anggota percakapan harus aktif dan menyiapkan kunci lampiran.'
      using errcode = '42501';
  end if;
end;
$$;

create or replace function public.register_chat_drive_attachment(
  p_conversation_id uuid,
  p_drive_file_id text,
  p_ciphertext_sha256 text,
  p_ciphertext_size_bytes bigint,
  p_encryption_version smallint,
  p_message_type text,
  p_source_file_size bigint,
  p_key_envelopes jsonb
)
returns table (message_id uuid, drive_file_index_id uuid)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_owner_id uuid := (select auth.uid());
  v_tenant_id text;
  v_participant_ids uuid[];
  v_file_index_id uuid;
  v_envelope_count integer;
begin
  if v_owner_id is null or not (select public.current_user_is_active()) then
    raise exception 'Pengguna aktif wajib masuk untuk mendaftarkan lampiran.'
      using errcode = '42501';
  end if;

  if p_drive_file_id is null
      or p_drive_file_id !~ '^[A-Za-z0-9_-]{1,256}$'
      or char_length(p_drive_file_id) not between 1 and 256
      or p_ciphertext_sha256 is null
      or p_ciphertext_sha256 !~ '^[a-f0-9]{64}$'
      or p_ciphertext_size_bytes is null
      or p_ciphertext_size_bytes not between 1 and 2105344
      or p_encryption_version is distinct from 1
      or p_message_type is null
      or p_message_type not in ('image', 'file')
      or p_source_file_size is null
      or p_source_file_size not between 1 and 2097152
      or p_ciphertext_size_bytes < p_source_file_size
      or p_key_envelopes is null
      or jsonb_typeof(p_key_envelopes) <> 'array' then
    raise exception 'Metadata lampiran terenkripsi tidak valid.'
      using errcode = '22023';
  end if;

  select profile.tenant_id, conversation.participant_ids
    into v_tenant_id, v_participant_ids
  from public.chat_conversations as conversation
  join public.profiles as profile
    on profile.id = v_owner_id
  join public.tenants as tenant
    on tenant.id = profile.tenant_id
  where conversation.id = p_conversation_id
    and v_owner_id = any(conversation.participant_ids)
    and profile.active is true
    and profile.role not in ('unprovisioned', 'demo')
    and tenant.active is true
  for share of conversation, profile, tenant;

  if v_tenant_id is null then
    raise exception 'Pengguna bukan anggota aktif percakapan atau tenant.'
      using errcode = '42501';
  end if;

  perform profile.id
  from public.profiles as profile
  where profile.id = any(v_participant_ids)
  order by profile.id
  for share;

  perform encryption_key.user_id
  from public.user_encryption_keys as encryption_key
  where encryption_key.user_id = any(v_participant_ids)
  order by encryption_key.user_id
  for share;

  if exists (
    select 1
    from unnest(v_participant_ids) as participant(id)
    left join public.profiles as profile
      on profile.id = participant.id
    where profile.id is null
      or profile.active is not true
      or profile.role in ('unprovisioned', 'demo')
      or profile.tenant_id is distinct from v_tenant_id
  ) then
    raise exception 'Semua anggota percakapan harus aktif pada tenant yang sama.'
      using errcode = '42501';
  end if;

  if jsonb_typeof(p_key_envelopes) <> 'array' then
    raise exception 'Daftar kunci lampiran tidak valid.'
      using errcode = '22023';
  end if;

  if jsonb_array_length(p_key_envelopes) <> cardinality(v_participant_ids) then
    raise exception 'Lampiran harus memiliki tepat satu kunci untuk setiap anggota.'
      using errcode = '22023';
  end if;

  select count(*) into v_envelope_count
  from jsonb_array_elements(p_key_envelopes) as item(envelope)
  where case
    when jsonb_typeof(item.envelope) = 'object'
      then (select count(*) from jsonb_object_keys(item.envelope)) = 4
        and item.envelope ?& array[
          'userId', 'wrappedDataKey', 'recipientKeyFingerprint', 'keyVersion'
        ]
        and item.envelope->>'userId' ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        and item.envelope->>'wrappedDataKey' ~ '^[A-Za-z0-9_-]{512}$'
        and item.envelope->>'recipientKeyFingerprint' ~ '^[a-f0-9]{64}$'
        and case
          when item.envelope->>'keyVersion' ~ '^[1-9][0-9]{0,4}$'
            then (item.envelope->>'keyVersion')::integer <= 32767
          else false
        end
    else false
  end;

  if v_envelope_count <> cardinality(v_participant_ids)
      or exists (
        select 1
        from (
          select item.envelope->>'userId' as recipient_id, count(*) as copies
          from jsonb_array_elements(p_key_envelopes) as item(envelope)
          group by item.envelope->>'userId'
        ) as duplicate_envelopes
        where duplicate_envelopes.copies <> 1
      )
      or exists (
        select 1
        from unnest(v_participant_ids) as participant(id)
        left join jsonb_to_recordset(p_key_envelopes) as envelope(
          "userId" uuid,
          "wrappedDataKey" text,
          "recipientKeyFingerprint" text,
          "keyVersion" integer
        ) on envelope."userId" = participant.id
        left join public.user_encryption_keys as encryption_key
          on encryption_key.user_id = participant.id
        where envelope."userId" is null
          or encryption_key.user_id is null
          or envelope."recipientKeyFingerprint" <> encryption_key.fingerprint
          or envelope."keyVersion" <> encryption_key.key_version
      ) then
    raise exception 'Kunci lampiran tidak sesuai dengan anggota dan kunci publik aktif.'
      using errcode = '42501';
  end if;

  insert into public.drive_file_index (
    owner_id, tenant_id, drive_file_id, category, ciphertext_sha256,
    ciphertext_size_bytes, encryption_version
  ) values (
    v_owner_id, v_tenant_id, p_drive_file_id, 'communication',
    p_ciphertext_sha256, p_ciphertext_size_bytes, p_encryption_version
  )
  returning id into v_file_index_id;

  insert into public.drive_file_access (
    file_id, grantee_id, granted_by, access_level
  )
  select v_file_index_id, participant.id, v_owner_id, 'read'
  from unnest(v_participant_ids) as participant(id)
  where participant.id <> v_owner_id;

  insert into public.drive_file_key_envelopes (
    file_id, recipient_id, wrapped_data_key,
    recipient_key_fingerprint, key_version
  )
  select v_file_index_id,
    envelope."userId",
    envelope."wrappedDataKey",
    envelope."recipientKeyFingerprint",
    envelope."keyVersion"::smallint
  from jsonb_to_recordset(p_key_envelopes) as envelope(
    "userId" uuid,
    "wrappedDataKey" text,
    "recipientKeyFingerprint" text,
    "keyVersion" integer
  );

  insert into public.chat_messages (
    conversation_id, sender_id, type, body, drive_file_index_id,
    file_name, file_size
  ) values (
    p_conversation_id, v_owner_id, p_message_type, null,
    v_file_index_id,
    case p_message_type
      when 'image' then 'Foto terenkripsi'
      else 'Lampiran terenkripsi'
    end,
    p_source_file_size
  )
  returning id into message_id;

  drive_file_index_id := v_file_index_id;
  return next;
end;
$$;

revoke all on function public.list_chat_attachment_recipients(uuid)
  from public, anon;
revoke all on function public.register_chat_drive_attachment(
  uuid, text, text, bigint, smallint, text, bigint, jsonb
) from public, anon;
grant execute on function public.list_chat_attachment_recipients(uuid)
  to authenticated;
grant execute on function public.register_chat_drive_attachment(
  uuid, text, text, bigint, smallint, text, bigint, jsonb
) to authenticated;
