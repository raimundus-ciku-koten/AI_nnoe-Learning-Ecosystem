import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL(
  '../../supabase/migrations/20261018000500_question_bank.sql',
  import.meta.url,
);
const migration = await readFile(migrationPath, 'utf8');

test('constrains bank question content, answer choices, and tenant ownership', () => {
  assert.match(migration, /create table if not exists public\.question_bank/);
  assert.match(migration, /tenant_id text not null references public\.tenants/);
  assert.match(migration, /owner_id uuid not null references auth\.users/);
  assert.match(migration, /question_bank_choices_valid\(jenis, pilihan, jawaban\)/);
  assert.match(migration, /select count\(distinct choice\) = cardinality\(p_choices\)\s*from unnest\(p_choices\) as choices\(choice\)/);
  assert.match(migration, /mapel = btrim\(mapel\)/);
  assert.match(migration, /kelas = btrim\(kelas\)/);
  assert.match(migration, /char_length\(pertanyaan\) between 1 and 2000/);
  assert.match(migration, /char_length\(jawaban\) between 1 and 1000/);
});

test('preserves staff read access while limiting writes to entitled teacher owners', () => {
  assert.match(migration, /alter table public\.question_bank enable row level security/);
  assert.match(migration, /'admin_sekolah', 'guru'/);
  assert.match(migration, /owner_id = \(select auth\.uid\(\)\)/);
  assert.match(migration, /public\.current_tenant_id\(\)/);
  assert.match(migration, /entitlement\.status in \('trial', 'active'\)/);
  assert.match(migration, /plan\.allowed_role = 'guru'/);
  assert.match(migration, /grant update \(\s*mapel, kelas, jenis, pertanyaan, pilihan, jawaban, pembahasan\s*\)/);
  assert.match(migration, /revoke all on table public\.question_bank from public, anon, authenticated/);
});
