create table if not exists public.billing_plans (
  id text primary key check (char_length(id) between 1 and 80),
  product_type text not null check (product_type in ('school', 'individual')),
  allowed_role text not null check (allowed_role in ('admin_sekolah', 'guru', 'siswa')),
  user_type text check (user_type in ('teacher', 'student')),
  name text not null check (char_length(name) between 1 and 120),
  annual_price integer not null check (annual_price > 0),
  monthly_divisor integer not null default 10 check (monthly_divisor between 1 and 24),
  student_capacity integer check (student_capacity is null or student_capacity > 0),
  teacher_capacity integer check (teacher_capacity is null or teacher_capacity > 0),
  features text not null default '',
  active boolean not null default true,
  check (
    (product_type = 'school' and allowed_role = 'admin_sekolah' and user_type is null)
    or (product_type = 'individual' and allowed_role in ('guru', 'siswa') and user_type is not null)
  )
);

insert into public.billing_plans (
  id, product_type, allowed_role, user_type, name, annual_price,
  student_capacity, teacher_capacity, features
) values
  ('sekolah-basic', 'school', 'admin_sekolah', null, 'Sekolah Basic', 3500000, 100, 20, '100 siswa, 20 guru'),
  ('sekolah-pro', 'school', 'admin_sekolah', null, 'Sekolah Pro', 7500000, 500, 100, '500 siswa, 100 guru'),
  ('sekolah-enterprise', 'school', 'admin_sekolah', null, 'Sekolah Enterprise', 15000000, 1500, null, '1.500 siswa, jumlah guru tanpa batas'),
  ('siswa-basic', 'individual', 'siswa', 'student', 'Siswa Basic', 149000, null, null, 'Ujian online, materi ringkas, nilai, 1 mapel pilihan'),
  ('siswa-pro', 'individual', 'siswa', 'student', 'Siswa Pro', 249000, null, null, 'Semua mapel, bank soal lengkap, tryout, analitik belajar'),
  ('siswa-premium', 'individual', 'siswa', 'student', 'Siswa Premium', 399000, null, null, 'AI tutor, pembahasan adaptif, prioritas materi baru'),
  ('guru-sd-basic', 'individual', 'guru', 'teacher', 'Guru Kelas SD Basic', 199000, null, null, '3 mapel, bank soal 150, 2 ujian, 1 kelas'),
  ('guru-sd-pro', 'individual', 'guru', 'teacher', 'Guru Kelas SD Pro', 349000, null, null, '6 mapel, AI Generator 200 soal/bulan, anti-curang, 3 kelas'),
  ('guru-sd-premium', 'individual', 'guru', 'teacher', 'Guru Kelas SD Premium', 499000, null, null, 'Mapel dan AI tanpa batas, chat orang tua, 5 kelas, dukungan prioritas'),
  ('guru-mapel-basic', 'individual', 'guru', 'teacher', 'Guru Mapel Basic', 149000, null, null, '1 mapel, bank soal 100, 2 ujian, 1 kelas'),
  ('guru-mapel-pro', 'individual', 'guru', 'teacher', 'Guru Mapel Pro', 249000, null, null, '1 mapel + paralel, AI Generator 200 soal/bulan, anti-curang, 5 kelas'),
  ('guru-mapel-premium', 'individual', 'guru', 'teacher', 'Guru Mapel Premium', 399000, null, null, 'AI dan ujian tanpa batas, chat 1-on-1, 10 kelas, analitik lanjutan')
on conflict (id) do nothing;

create table if not exists public.personal_entitlements (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan_id text not null references public.billing_plans(id) on delete restrict,
  status text not null check (status in ('trial', 'active', 'past_due', 'suspended', 'cancelled')),
  valid_until timestamptz,
  updated_at timestamptz not null default now()
);

alter table public.billing_plans enable row level security;
alter table public.personal_entitlements enable row level security;

revoke all on table public.billing_plans, public.personal_entitlements
  from anon, authenticated;
grant select on table public.billing_plans, public.personal_entitlements
  to authenticated;
grant all on table public.billing_plans, public.personal_entitlements
  to service_role;

drop policy if exists "Authenticated users read active billing plans"
  on public.billing_plans;
create policy "Authenticated users read active billing plans"
  on public.billing_plans
  for select
  to authenticated
  using (
    active = true
    and (select public.current_user_is_active())
  );

drop policy if exists "Users read their personal entitlement"
  on public.personal_entitlements;
create policy "Users read their personal entitlement"
  on public.personal_entitlements
  for select
  to authenticated
  using (
    (select public.current_user_is_active())
    and user_id = (select auth.uid())
  );
