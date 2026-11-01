import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL(
  '../../supabase/migrations/20261101033150_lesson_journals.sql',
  import.meta.url,
);
const migration = await readFile(migrationPath, 'utf8');

test('constrains journal fields and indexes tenant-owner history queries', () => {
  assert.match(migration, /create table if not exists public\.lesson_journals/);
  assert.match(migration, /tenant_id text not null references public\.tenants/);
  assert.match(migration, /owner_id uuid not null references auth\.users/);
  assert.match(migration, /tanggal date not null/);
  assert.match(migration, /status in \('draft', 'final'\)/);
  assert.match(migration, /char_length\(materi\) between 1 and 2000/);
  assert.match(migration, /char_length\(kegiatan\) <= 4000/);
  assert.match(migration, /char_length\(kendala\) <= 2000/);
  assert.match(migration, /char_length\(tindak_lanjut\) <= 2000/);
  assert.match(migration, /on public\.lesson_journals \(tenant_id, owner_id, tanggal desc, created_at desc\)/);
});

test('protects exposed journal rows with owner, tenant, role, assignment, and entitlement checks', () => {
  assert.match(migration, /alter table public\.lesson_journals enable row level security/);
  assert.match(migration, /owner_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /tenant_id = \(select public\.current_tenant_id\(\)\)/);
  assert.match(migration, /public\.current_user_is_active\(\)/);
  assert.match(migration, /public\.current_app_role\(\).*'guru'/s);
  assert.match(migration, /lesson_journals\.kelas = any\(profile\.kelas_ids\)/);
  assert.match(migration, /lesson_journals\.mapel = any\(profile\.mapel_ids\)/);
  assert.match(migration, /entitlement\.status in \('trial', 'active'\)/);
  assert.match(migration, /plan\.allowed_role = 'guru'/);
  assert.match(migration, /for update[\s\S]*?using \([\s\S]*?with check \(/);
  assert.match(migration, /revoke all on table public\.lesson_journals from public, anon, authenticated/);
  assert.match(migration, /grant update \(\s*tanggal, kelas, mapel, jam, materi, kegiatan, kendala, tindak_lanjut, status\s*\)/);
  assert.doesNotMatch(migration, /raw_user_meta_data|user_metadata/);
});
