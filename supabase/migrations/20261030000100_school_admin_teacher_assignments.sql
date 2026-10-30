create or replace function public.manage_school_teacher_assignments(
  p_user_id uuid,
  p_mapel_ids text[],
  p_kelas_ids text[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  actor_id uuid := auth.uid();
  actor_tenant_id text := public.current_tenant_id();
  target public.profiles%rowtype;
begin
  if actor_id is null
    or not public.current_user_is_active()
    or public.current_app_role() <> 'admin_sekolah'
    or actor_tenant_id = '' then
    raise exception using errcode = '42501', message = 'forbidden';
  end if;

  if p_user_id is null
    or p_mapel_ids is null
    or p_kelas_ids is null
    or cardinality(p_mapel_ids) > 30
    or cardinality(p_kelas_ids) > 30
    or exists (
      select 1 from unnest(p_mapel_ids || p_kelas_ids) as value
      where value is null
        or char_length(btrim(value)) not between 1 and 120
        or value ~ '[[:cntrl:]]'
    )
    or not public.text_array_has_unique_values(p_mapel_ids)
    or not public.text_array_has_unique_values(p_kelas_ids) then
    raise exception using errcode = '22023', message = 'invalid-argument';
  end if;

  select *
  into target
  from public.profiles as profile
  where profile.id = p_user_id
    and profile.tenant_id = actor_tenant_id
    and profile.active
    and 'guru' = any(profile.roles)
    and profile.roles <@ array[
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'
    ]::text[]
  for update;

  if not found then
    raise exception using errcode = '42501', message = 'teacher-not-found-in-tenant';
  end if;

  update public.profiles
  set mapel_ids = p_mapel_ids,
      kelas_ids = p_kelas_ids,
      updated_at = now()
  where id = target.id;

  insert into public.platform_audit (
    actor_id, action, target, before_value, after_value
  )
  values (
    actor_id,
    'school.teacher.assignments.updated',
    coalesce(target.email, target.id::text),
    jsonb_build_object('mapel_ids', target.mapel_ids, 'kelas_ids', target.kelas_ids),
    jsonb_build_object('mapel_ids', p_mapel_ids, 'kelas_ids', p_kelas_ids)
  );

  return jsonb_build_object(
    'user_id', target.id,
    'tenant_id', actor_tenant_id,
    'mapel_ids', to_jsonb(p_mapel_ids),
    'kelas_ids', to_jsonb(p_kelas_ids)
  );
end;
$$;

revoke all on function public.manage_school_teacher_assignments(uuid, text[], text[])
  from public, anon;
grant execute on function public.manage_school_teacher_assignments(uuid, text[], text[])
  to authenticated;