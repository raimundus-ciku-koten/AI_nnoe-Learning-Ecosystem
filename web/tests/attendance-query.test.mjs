import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../src/pages/AttendancePage.jsx', import.meta.url), 'utf8');
const service = await readFile(new URL('../src/services/absensi.js', import.meta.url), 'utf8');
const reportService = await readFile(new URL('../src/services/attendanceReports.js', import.meta.url), 'utf8');

test('staff attendance history uses paginated server filters and role-scoped rows', () => {
  assert.match(page, /muatLaporanPresensi\(/);
  assert.match(page, /Muat catatan berikutnya/);
  assert.match(page, /Terapkan filter/);
  assert.match(page, /guru_bk.*guru_kokurikuler.*guru_ekstrakurikuler/);
  assert.doesNotMatch(page, /\.from\('attendance_records'\)/);
  assert.doesNotMatch(page, /guru_uid|siswa_id/);
  assert.match(reportService, /school_attendance_report/);
  assert.match(reportService, /p_attendance_date:/);
  assert.match(reportService, /p_student_search:/);
  assert.match(reportService, /p_offset:/);
});

test('scan lookups and idempotent writes match the Supabase attendance schema', () => {
  assert.match(service, /\.from\('students'\)/);
  assert.match(service, /\.eq\('owner_id', uid\)/);
  assert.match(service, /student_id: siswa\.id/);
  assert.match(service, /tenant_id: siswa\.tenantId/);
  assert.match(service, /\.eq\('student_id', siswaId\)/);
  assert.doesNotMatch(service, /firebase|firestore|guru_uid|siswa_id/i);
});
