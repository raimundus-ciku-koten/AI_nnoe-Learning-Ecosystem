create or replace function private.platform_question_payload_valid(
  p_question_items jsonb,
  p_answer_key jsonb
)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  item jsonb;
  choice jsonb;
  item_position text;
  item_kind text;
  prompt_text text;
  answer_text text;
  choices text[];
  positions integer[] := array[]::integer[];
  parsed_position integer;
begin
  if jsonb_typeof(p_question_items) <> 'array'
    or jsonb_array_length(p_question_items) not between 1 and 100
    or jsonb_typeof(p_answer_key) <> 'object' then
    return false;
  end if;

  for item in select value from jsonb_array_elements(p_question_items)
  loop
    if jsonb_typeof(item) <> 'object'
      or jsonb_object_length(item) <> 4
      or not (item ?& array['position', 'kind', 'prompt', 'choices'])
      or jsonb_typeof(item -> 'position') <> 'number'
      or jsonb_typeof(item -> 'kind') <> 'string'
      or jsonb_typeof(item -> 'prompt') <> 'string'
      or jsonb_typeof(item -> 'choices') <> 'array' then
      return false;
    end if;

    item_position := item ->> 'position';
    if item_position !~ '^[0-9]{1,3}$' then return false; end if;
    parsed_position := item_position::integer;
    if parsed_position not between 1 and 100 or parsed_position = any(positions) then
      return false;
    end if;
    positions := array_append(positions, parsed_position);
    item_kind := item ->> 'kind';
    prompt_text := btrim(item ->> 'prompt');
    if item_kind not in ('pilihan_ganda', 'uraian')
      or char_length(prompt_text) not between 1 and 2000 then
      return false;
    end if;

    choices := array[]::text[];
    for choice in select value from jsonb_array_elements(item -> 'choices')
    loop
      if jsonb_typeof(choice) <> 'string'
        or char_length(btrim(choice #>> '{}')) not between 1 and 300 then
        return false;
      end if;
      choices := array_append(choices, btrim(choice #>> '{}'));
    end loop;

    if item_kind = 'pilihan_ganda' then
      if cardinality(choices) not between 2 and 5
        or cardinality(choices) <> (select count(distinct selected) from unnest(choices) as selected) then
        return false;
      end if;
    elsif cardinality(choices) <> 0 then
      return false;
    end if;

    if not (p_answer_key ? item_position)
      or jsonb_typeof(p_answer_key -> item_position) <> 'string' then
      return false;
    end if;
    answer_text := btrim(p_answer_key ->> item_position);
    if char_length(answer_text) not between 1 and 1000
      or (item_kind = 'pilihan_ganda' and not (answer_text = any(choices))) then
      return false;
    end if;
  end loop;

  return jsonb_object_length(p_answer_key) = cardinality(positions);
exception when others then
  return false;
end;
$$;

revoke all on function private.platform_question_payload_valid(jsonb, jsonb) from public, anon;
grant execute on function private.platform_question_payload_valid(jsonb, jsonb) to authenticated;

create table if not exists public.platform_content_catalog (
  id uuid primary key default gen_random_uuid(),
  content_type text not null check (content_type in ('template_perangkat', 'bank_soal', 'modul')),
  title text not null check (char_length(btrim(title)) between 1 and 160 and title = btrim(title)),
  description text not null default '' check (char_length(description) <= 2000),
  content_text text not null default '' check (char_length(content_text) <= 30000),
  question_items jsonb not null default '[]'::jsonb check (jsonb_typeof(question_items) = 'array'),
  answer_key jsonb not null default '{}'::jsonb check (jsonb_typeof(answer_key) = 'object'),
  subject text not null default '' check (char_length(subject) <= 80),
  grade_level text not null default '' check (char_length(grade_level) <= 80),
  license_label text not null default '' check (char_length(license_label) <= 160),
  source_url text not null default '' check (
    char_length(source_url) <= 2048
    and (source_url = '' or source_url ~ '^https://[^[:space:]]+$')
  ),
  status text not null default 'draft' check (status in ('draft', 'published', 'archived')),
  version integer not null default 1 check (version > 0),
  created_by uuid not null references auth.users(id) on delete restrict,
  updated_by uuid not null references auth.users(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz,
  check (content_type = 'bank_soal' or (question_items = '[]'::jsonb and answer_key = '{}'::jsonb)),
  check (status <> 'published' or (
    char_length(btrim(license_label)) > 0
    and case when content_type = 'bank_soal'
      then private.platform_question_payload_valid(question_items, answer_key)
      else char_length(btrim(content_text)) > 0
    end
  ))
);

create index if not exists platform_content_catalog_type_status_updated_idx
  on public.platform_content_catalog (content_type, status, updated_at desc);

alter table public.platform_content_catalog enable row level security;
revoke all on table public.platform_content_catalog from public, anon, authenticated;
grant all on table public.platform_content_catalog to service_role;

create or replace function public.platform_content_list(p_content_type text default null)
returns table (
  id uuid,
  content_type text,
  title text,
  description text,
  content_text text,
  question_items jsonb,
  answer_key jsonb,
  subject text,
  grade_level text,
  license_label text,
  source_url text,
  status text,
  version integer,
  created_at timestamptz,
  updated_at timestamptz,
  published_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'superadmin' then
    raise exception 'Superadmin aktif diperlukan untuk mengelola katalog konten global.'
      using errcode = '42501';
  end if;
  if p_content_type is not null
    and p_content_type not in ('template_perangkat', 'bank_soal', 'modul') then
    raise exception 'Jenis konten tidak valid.' using errcode = '22023';
  end if;

  return query
  select item.id, item.content_type, item.title, item.description, item.content_text,
    item.question_items, item.answer_key,
    item.subject, item.grade_level, item.license_label, item.source_url, item.status,
    item.version, item.created_at, item.updated_at, item.published_at
  from public.platform_content_catalog as item
  where p_content_type is null or item.content_type = p_content_type
  order by item.updated_at desc, item.id;
end;
$$;

create or replace function public.platform_content_save(
  p_id uuid,
  p_content_type text,
  p_title text,
  p_description text,
  p_content_text text,
  p_subject text,
  p_grade_level text,
  p_license_label text,
  p_source_url text,
  p_question_items jsonb,
  p_answer_key jsonb
)
returns table (saved_id uuid, saved_version integer)
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_item public.platform_content_catalog%rowtype;
  next_id uuid;
  next_version integer;
begin
  if auth.uid() is null or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'superadmin' then
    raise exception 'Superadmin aktif diperlukan untuk mengubah katalog konten global.'
      using errcode = '42501';
  end if;
  if p_content_type not in ('template_perangkat', 'bank_soal', 'modul')
    or p_title is null or char_length(btrim(p_title)) not between 1 and 160
    or p_title <> btrim(p_title)
    or p_description is null or char_length(p_description) > 2000
    or p_content_text is null or char_length(p_content_text) > 30000
    or p_subject is null or char_length(p_subject) > 80
    or p_grade_level is null or char_length(p_grade_level) > 80
    or p_license_label is null or char_length(p_license_label) > 160
    or p_source_url is null or char_length(p_source_url) > 2048
    or (p_source_url <> '' and p_source_url !~ '^https://[^[:space:]]+$')
    or p_question_items is null or p_answer_key is null
    or (p_content_type = 'bank_soal'
      and not private.platform_question_payload_valid(p_question_items, p_answer_key))
    or (p_content_type <> 'bank_soal'
      and (p_question_items <> '[]'::jsonb or p_answer_key <> '{}'::jsonb)) then
    raise exception 'Metadata konten tidak valid.' using errcode = '22023';
  end if;

  if p_id is null then
    insert into public.platform_content_catalog (
      content_type, title, description, content_text, subject, grade_level,
      license_label, source_url, question_items, answer_key, created_by, updated_by
    ) values (
      p_content_type, btrim(p_title), p_description, p_content_text, p_subject,
      p_grade_level, p_license_label, p_source_url, p_question_items, p_answer_key,
      auth.uid(), auth.uid()
    ) returning id, version into next_id, next_version;
    insert into public.platform_audit (actor_id, action, target, after_value)
    values (auth.uid(), 'platform-content-create', next_id::text,
      jsonb_build_object('type', p_content_type, 'title', btrim(p_title), 'status', 'draft', 'version', next_version));
  else
    select * into current_item
    from public.platform_content_catalog as item
    where item.id = p_id
    for update;
    if not found then
      raise exception 'Konten tidak ditemukan.' using errcode = 'P0002';
    end if;
    if current_item.status <> 'draft' then
      raise exception 'Hanya draf yang dapat diubah; buat draf baru untuk revisi item terbit atau arsip.' using errcode = '22023';
    end if;
    next_version := current_item.version + 1;
    update public.platform_content_catalog as item
    set content_type = p_content_type,
        title = btrim(p_title), description = p_description, content_text = p_content_text,
        subject = p_subject, grade_level = p_grade_level, license_label = p_license_label,
        source_url = p_source_url, question_items = p_question_items, answer_key = p_answer_key,
        version = next_version, updated_by = auth.uid(), updated_at = now()
    where item.id = p_id
    returning item.id into next_id;
    insert into public.platform_audit (actor_id, action, target, before_value, after_value)
    values (auth.uid(), 'platform-content-update', p_id::text,
      jsonb_build_object('type', current_item.content_type, 'title', current_item.title, 'status', current_item.status, 'version', current_item.version),
      jsonb_build_object('type', p_content_type, 'title', btrim(p_title), 'status', current_item.status, 'version', next_version));
  end if;
  return query select next_id, next_version;
end;
$$;

create or replace function public.platform_content_publish(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_item public.platform_content_catalog%rowtype;
begin
  if auth.uid() is null or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'superadmin' then
    raise exception 'Superadmin aktif diperlukan untuk menerbitkan konten global.'
      using errcode = '42501';
  end if;
  select * into current_item from public.platform_content_catalog as item
  where item.id = p_id for update;
  if not found then raise exception 'Konten tidak ditemukan.' using errcode = 'P0002'; end if;
  if current_item.status <> 'draft' or char_length(btrim(current_item.license_label)) = 0
    or case when current_item.content_type = 'bank_soal'
      then not private.platform_question_payload_valid(current_item.question_items, current_item.answer_key)
      else char_length(btrim(current_item.content_text)) = 0
    end then
    raise exception 'Draf dan lisensi/sumber konten wajib lengkap sebelum terbit.' using errcode = '22023';
  end if;
  update public.platform_content_catalog as item
  set status = 'published', published_at = now(), updated_at = now(), updated_by = auth.uid()
  where item.id = p_id;
  insert into public.platform_audit (actor_id, action, target, before_value, after_value)
  values (auth.uid(), 'platform-content-publish', p_id::text,
    jsonb_build_object('status', current_item.status, 'version', current_item.version),
    jsonb_build_object('status', 'published', 'version', current_item.version));
end;
$$;

create or replace function public.platform_content_archive(p_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_item public.platform_content_catalog%rowtype;
begin
  if auth.uid() is null or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'superadmin' then
    raise exception 'Superadmin aktif diperlukan untuk mengarsipkan konten global.'
      using errcode = '42501';
  end if;
  select * into current_item from public.platform_content_catalog as item
  where item.id = p_id for update;
  if not found then raise exception 'Konten tidak ditemukan.' using errcode = 'P0002'; end if;
  if current_item.status = 'archived' then return; end if;
  update public.platform_content_catalog as item
  set status = 'archived', updated_at = now(), updated_by = auth.uid()
  where item.id = p_id;
  insert into public.platform_audit (actor_id, action, target, before_value, after_value)
  values (auth.uid(), 'platform-content-archive', p_id::text,
    jsonb_build_object('status', current_item.status, 'version', current_item.version),
    jsonb_build_object('status', 'archived', 'version', current_item.version));
end;
$$;

create or replace function public.tenant_global_content_catalog(p_content_type text default null)
returns table (
  id uuid,
  content_type text,
  title text,
  description text,
  content_text text,
  question_items jsonb,
  subject text,
  grade_level text,
  license_label text,
  source_url text,
  version integer,
  published_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not (select public.current_user_is_active())
    or (select public.current_app_role()) not in (
      'admin_sekolah', 'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    )
    or not exists (
      select 1 from public.tenants as tenant
      where tenant.id = (select public.current_tenant_id()) and tenant.active = true
    )
    or not (
      exists (
        select 1 from public.tenant_entitlements as entitlement
        where entitlement.tenant_id = (select public.current_tenant_id())
          and entitlement.status in ('trial', 'active')
          and (entitlement.valid_until is null or entitlement.valid_until > now())
      )
      or exists (
        select 1
        from public.personal_entitlements as entitlement
        join public.billing_plans as plan on plan.id = entitlement.plan_id
        where entitlement.user_id = auth.uid()
          and entitlement.status in ('trial', 'active')
          and (entitlement.valid_until is null or entitlement.valid_until > now())
          and plan.allowed_role = 'guru' and plan.active = true
      )
    ) then
    raise exception 'Keanggotaan tenant dan entitlement aktif diperlukan untuk melihat katalog.'
      using errcode = '42501';
  end if;
  if p_content_type is not null
    and p_content_type not in ('template_perangkat', 'bank_soal', 'modul') then
    raise exception 'Jenis konten tidak valid.' using errcode = '22023';
  end if;

  return query
  select item.id, item.content_type, item.title, item.description,
    case when item.content_type = 'bank_soal' then '' else item.content_text end,
    case when item.content_type = 'bank_soal' then item.question_items else '[]'::jsonb end,
    item.subject, item.grade_level, item.license_label, item.source_url,
    item.version, item.published_at
  from public.platform_content_catalog as item
  where item.status = 'published'
    and (p_content_type is null or item.content_type = p_content_type)
  order by item.content_type, item.title, item.id;
end;
$$;

create or replace function public.import_published_platform_questions(
  p_content_id uuid,
  p_mapel text,
  p_kelas text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  catalog_item public.platform_content_catalog%rowtype;
  inserted_count integer;
  v_tenant_id text := (select public.current_tenant_id());
begin
  if auth.uid() is null or not (select public.current_user_is_active())
    or (select public.current_app_role()) <> 'guru'
    or v_tenant_id is null
    or p_content_id is null
    or p_mapel is null or char_length(btrim(p_mapel)) not between 1 and 80
    or p_kelas is null or char_length(btrim(p_kelas)) not between 1 and 30 then
    raise exception 'Guru aktif, tenant, mapel, dan kelas wajib tersedia.'
      using errcode = '42501';
  end if;
  if not exists (
    select 1 from public.profiles as profile
    where profile.id = auth.uid() and profile.tenant_id = v_tenant_id
      and profile.active = true and btrim(p_mapel) = any(profile.mapel_ids)
      and btrim(p_kelas) = any(profile.kelas_ids)
  ) then
    raise exception 'Mapel dan kelas harus tercantum pada penugasan guru aktif.'
      using errcode = '42501';
  end if;
  if not (
    exists (
      select 1 from public.tenant_entitlements as entitlement
      where entitlement.tenant_id = v_tenant_id
        and entitlement.status in ('trial', 'active')
        and (entitlement.valid_until is null or entitlement.valid_until > now())
    )
    or exists (
      select 1 from public.personal_entitlements as entitlement
      join public.billing_plans as plan on plan.id = entitlement.plan_id
      where entitlement.user_id = auth.uid()
        and entitlement.status in ('trial', 'active')
        and (entitlement.valid_until is null or entitlement.valid_until > now())
        and plan.allowed_role = 'guru' and plan.active = true
    )
  ) then
    raise exception 'Entitlement aktif diperlukan untuk menambah soal ke bank tenant.'
      using errcode = '42501';
  end if;

  select * into catalog_item
  from public.platform_content_catalog as item
  where item.id = p_content_id and item.content_type = 'bank_soal'
    and item.status = 'published'
  for share;
  if not found then
    raise exception 'Bank soal global tidak tersedia atau belum valid.' using errcode = '22023';
  end if;
  if not private.platform_question_payload_valid(catalog_item.question_items, catalog_item.answer_key) then
    raise exception 'Bank soal global tidak tersedia atau belum valid.' using errcode = '22023';
  end if;

  insert into public.question_bank (
    tenant_id, owner_id, mapel, kelas, jenis, pertanyaan, pilihan, jawaban, pembahasan
  )
  select v_tenant_id, auth.uid(), btrim(p_mapel), btrim(p_kelas),
    question.value ->> 'kind', question.value ->> 'prompt',
    array(select jsonb_array_elements_text(question.value -> 'choices')),
    catalog_item.answer_key ->> (question.value ->> 'position'), ''
  from jsonb_array_elements(catalog_item.question_items) as question(value)
  order by (question.value ->> 'position')::integer;
  get diagnostics inserted_count = row_count;
  return inserted_count;
end;
$$;

revoke all on function public.platform_content_list(text) from public, anon;
revoke all on function public.platform_content_save(uuid, text, text, text, text, text, text, text, text, jsonb, jsonb) from public, anon;
revoke all on function public.platform_content_publish(uuid) from public, anon;
revoke all on function public.platform_content_archive(uuid) from public, anon;
revoke all on function public.tenant_global_content_catalog(text) from public, anon;
revoke all on function public.import_published_platform_questions(uuid, text, text) from public, anon;
grant execute on function public.platform_content_list(text) to authenticated;
grant execute on function public.platform_content_save(uuid, text, text, text, text, text, text, text, text, jsonb, jsonb) to authenticated;
grant execute on function public.platform_content_publish(uuid) to authenticated;
grant execute on function public.platform_content_archive(uuid) to authenticated;
grant execute on function public.tenant_global_content_catalog(text) to authenticated;
grant execute on function public.import_published_platform_questions(uuid, text, text) to authenticated;
