import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';

const migration = await readFile(
  new URL('../../supabase/migrations/20261025001200_school_letterheads.sql', import.meta.url),
  'utf8',
);

test('kop sekolah dibatasi ke image data URL dan bisa dikelola staf sekolah yang aktif', () => {
  assert.match(migration, /create table if not exists public\.school_letterheads/);
  assert.match(migration, /char_length\(image_data_url\) between 32 and 500000/);
  assert.match(migration, /current_app_role\(\)\) = 'superadmin'/);
  assert.match(migration, /'admin_sekolah'.*'guru_bk'.*'guru_kokurikuler'.*'guru_ekstrakurikuler'/);
  assert.match(migration, /updated_by = \(select auth\.uid\(\)\)/);
});

test('impor siswa superadmin hanya menulis data atas namanya ke sekolah aktif', () => {
  assert.match(migration, /create policy "Superadmins import students into active tenant"/);
  assert.match(migration, /owner_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /tenant\.id = students\.tenant_id\s+and tenant\.active = true/);
});
