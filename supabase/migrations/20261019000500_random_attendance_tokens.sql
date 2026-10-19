alter table public.students
  drop constraint if exists students_kode_unik_check,
  add constraint students_kode_unik_check check (
    kode_unik ~ '^ALE-[0-9A-F]{32}$'
    or kode_unik ~ '^ALE-[A-Z0-9]{1,6}-[A-Z0-9]{6}-[0-9]{4}$'
  );

alter table public.attendance_records
  drop constraint if exists attendance_records_kode_unik_check,
  add constraint attendance_records_kode_unik_check check (
    kode_unik ~ '^ALE-[0-9A-F]{32}$'
    or kode_unik ~ '^ALE-[A-Z0-9]{1,6}-[A-Z0-9]{6}-[0-9]{4}$'
  );
