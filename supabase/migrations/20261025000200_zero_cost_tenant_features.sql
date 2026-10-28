drop policy if exists "Entitled active teachers create their own students"
  on public.students;
create policy "Active teachers create their own students"
  on public.students
  for insert
  to authenticated
  with check (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in ('admin_sekolah', 'operator', 'guru', 'demo')
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = students.tenant_id
        and tenant.active = true
    )
  );

drop policy if exists "Entitled active teachers update their own students"
  on public.students;
create policy "Active teachers update their own students"
  on public.students
  for update
  to authenticated
  using (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in ('admin_sekolah', 'operator', 'guru', 'demo')
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = students.tenant_id
        and tenant.active = true
    )
  )
  with check (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in ('admin_sekolah', 'operator', 'guru', 'demo')
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = students.tenant_id
        and tenant.active = true
    )
  );

drop policy if exists "Entitled active teachers delete their own students"
  on public.students;
create policy "Active teachers delete their own students"
  on public.students
  for delete
  to authenticated
  using (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in ('admin_sekolah', 'operator', 'guru', 'demo')
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = students.tenant_id
        and tenant.active = true
    )
  );

drop policy if exists "Entitled teachers record matching student attendance"
  on public.attendance_records;
create policy "Active teachers record matching student attendance"
  on public.attendance_records
  for insert
  to authenticated
  with check (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and student_id is not null
    and (select public.current_app_role()) in ('admin_sekolah', 'operator', 'guru', 'demo')
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = attendance_records.tenant_id
        and tenant.active = true
    )
    and exists (
      select 1
      from public.students as student
      where student.id = attendance_records.student_id
        and student.owner_id = attendance_records.owner_id
        and student.tenant_id = attendance_records.tenant_id
        and student.kode_unik = attendance_records.kode_unik
        and student.nama = attendance_records.nama
        and student.kelas = attendance_records.kelas
    )
  );

drop policy if exists "Entitled school staff create announcements"
  on public.school_announcements;
create policy "Active school staff create announcements"
  on public.school_announcements
  for insert
  to authenticated
  with check (
    (select public.current_user_is_active())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in ('admin_sekolah', 'operator')
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = school_announcements.tenant_id
        and tenant.active = true
    )
    and author_id = (select auth.uid())
  );

drop policy if exists "Entitled school staff update announcements"
  on public.school_announcements;
create policy "Active school staff update announcements"
  on public.school_announcements
  for update
  to authenticated
  using (
    (select public.current_user_is_active())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in ('admin_sekolah', 'operator')
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = school_announcements.tenant_id
        and tenant.active = true
    )
  )
  with check (
    (select public.current_user_is_active())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) in ('admin_sekolah', 'operator')
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = school_announcements.tenant_id
        and tenant.active = true
    )
  );

drop policy if exists "Entitled teachers create their own tenant questions"
  on public.question_bank;
create policy "Active teachers create their own tenant questions"
  on public.question_bank
  for insert
  to authenticated
  with check (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) = 'guru'
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = question_bank.tenant_id
        and tenant.active = true
    )
  );

drop policy if exists "Entitled teachers update their own tenant questions"
  on public.question_bank;
create policy "Active teachers update their own tenant questions"
  on public.question_bank
  for update
  to authenticated
  using (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) = 'guru'
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = question_bank.tenant_id
        and tenant.active = true
    )
  )
  with check (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) = 'guru'
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = question_bank.tenant_id
        and tenant.active = true
    )
  );

drop policy if exists "Entitled teachers delete their own tenant questions"
  on public.question_bank;
create policy "Active teachers delete their own tenant questions"
  on public.question_bank
  for delete
  to authenticated
  using (
    (select public.current_user_is_active())
    and owner_id = (select auth.uid())
    and tenant_id = (select public.current_tenant_id())
    and (select public.current_app_role()) = 'guru'
    and exists (
      select 1
      from public.tenants as tenant
      where tenant.id = question_bank.tenant_id
        and tenant.active = true
    )
  );
