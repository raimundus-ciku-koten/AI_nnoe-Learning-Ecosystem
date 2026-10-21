alter table public.tenants
  add column if not exists education_level text,
  add column if not exists npsn text,
  add column if not exists headmaster_name text,
  add column if not exists headmaster_nip text,
  add column if not exists academic_year text,
  add column if not exists semester text,
  add column if not exists updated_by uuid references auth.users(id) on delete set null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'tenants_npsn_format_check'
      and conrelid = 'public.tenants'::regclass
  ) then
    alter table public.tenants
      add constraint tenants_npsn_format_check
      check (npsn is null or npsn ~ '^[0-9]{1,12}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'tenants_headmaster_name_length_check'
      and conrelid = 'public.tenants'::regclass
  ) then
    alter table public.tenants
      add constraint tenants_headmaster_name_length_check
      check (headmaster_name is null or char_length(headmaster_name) <= 150);
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'tenants_headmaster_nip_format_check'
      and conrelid = 'public.tenants'::regclass
  ) then
    alter table public.tenants
      add constraint tenants_headmaster_nip_format_check
      check (headmaster_nip is null or headmaster_nip ~ '^[0-9 ]{1,25}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'tenants_academic_year_format_check'
      and conrelid = 'public.tenants'::regclass
  ) then
    alter table public.tenants
      add constraint tenants_academic_year_format_check
      check (academic_year is null or academic_year ~ '^[0-9]{4}/[0-9]{4}$');
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'tenants_semester_check'
      and conrelid = 'public.tenants'::regclass
  ) then
    alter table public.tenants
      add constraint tenants_semester_check
      check (semester is null or semester in ('ganjil', 'genap'));
  end if;
end;
$$;
