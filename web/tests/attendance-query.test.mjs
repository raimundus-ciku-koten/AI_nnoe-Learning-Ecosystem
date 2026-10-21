import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const page = await readFile(new URL('../src/pages/AttendancePage.jsx', import.meta.url), 'utf8');
const service = await readFile(new URL('../src/services/absensi.js', import.meta.url), 'utf8');

test('attendance history uses the deployed owner and student columns', () => {
  assert.match(page, /\.from\('attendance_records'\)[\s\S]*?\.eq\('owner_id', user\.uid\)/);
  assert.match(page, /record\.student_id/g);
  assert.doesNotMatch(page, /guru_uid|siswa_id/);
});

test('scan lookups and idempotent writes match the Supabase attendance schema', () => {
  assert.match(service, /\.from\('students'\)/);
  assert.match(service, /\.eq\('owner_id', uid\)/);
  assert.match(service, /student_id: siswa\.id/);
  assert.match(service, /tenant_id: siswa\.tenantId/);
  assert.match(service, /\.eq\('student_id', siswaId\)/);
  assert.doesNotMatch(service, /firebase|firestore|guru_uid|siswa_id/i);
});
