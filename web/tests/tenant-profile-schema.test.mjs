import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL(
  '../../supabase/migrations/20261017000700_tenant_profile_fields.sql',
  import.meta.url,
);
const migration = await readFile(migrationPath, 'utf8');

test('adds only nullable tenant profile metadata with a safe updater reference', () => {
  assert.match(migration, /alter table public\.tenants/);
  assert.match(migration, /add column if not exists education_level text/);
  assert.match(migration, /add column if not exists npsn text/);
  assert.match(migration, /add column if not exists headmaster_name text/);
  assert.match(migration, /add column if not exists headmaster_nip text/);
  assert.match(migration, /add column if not exists academic_year text/);
  assert.match(migration, /add column if not exists semester text/);
  assert.match(migration, /updated_by uuid references auth\.users\(id\) on delete set null/);
  assert.doesNotMatch(migration, /update public\.tenants|insert into public\.tenants|delete from public\.tenants/i);
});

test('constrains typed metadata and uses normalized semester values', () => {
  assert.match(migration, /npsn is null or npsn ~ '\^\[0-9\]\{1,12\}\$'/);
  assert.match(migration, /headmaster_name is null or char_length\(headmaster_name\) <= 150/);
  assert.match(migration, /headmaster_nip is null or headmaster_nip ~ '\^\[0-9 \]\{1,25\}\$'/);
  assert.match(migration, /academic_year is null or academic_year ~ '\^\[0-9\]\{4\}\/\[0-9\]\{4\}\$'/);
  assert.match(migration, /semester is null or semester in \('ganjil', 'genap'\)/);
});
