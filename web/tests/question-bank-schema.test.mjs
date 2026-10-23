import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migrationPath = new URL(
  '../../supabase/migrations/20261018000500_question_bank.sql',
  import.meta.url,
);
const migration = await readFile(migrationPath, 'utf8');
const cleanupMigration = await readFile(new URL(
  '../../supabase/migrations/20261023000100_remove_billing_signup_demo.sql',
  import.meta.url,
), 'utf8');
const cleanupPolicies = cleanupMigration.slice(
  cleanupMigration.indexOf('create policy'),
  cleanupMigration.indexOf('create or replace function'),
);

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

test('preserves tenant-scoped teacher ownership while removing subscription gates', () => {
  assert.match(cleanupMigration, /create policy "Active teachers create their own tenant questions"/);
  assert.match(cleanupMigration, /create policy "Active teachers update their own tenant questions"/);
  assert.match(cleanupMigration, /create policy "Active teachers delete their own tenant questions"/);
  assert.match(cleanupMigration, /owner_id = \(select auth\.uid\(\)\)/);
  assert.match(cleanupMigration, /public\.current_tenant_id\(\)/);
  assert.match(cleanupMigration, /tenant\.active = true/);
  assert.doesNotMatch(cleanupPolicies, /tenant_entitlements|personal_entitlements|billing_plans|demo/i);
});
