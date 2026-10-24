import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const migration = await readFile(
  new URL('../../supabase/migrations/20261025001100_tenant_report_card_address.sql', import.meta.url),
  'utf8',
);

test('adds an optional bounded school address using existing tenant-admin update policy', () => {
  assert.match(migration, /add column if not exists address text/);
  assert.match(migration, /address is null or/);
  assert.match(migration, /char_length\(address\) <= 500/);
  assert.match(migration, /grant update \(address\) on table public\.tenants to authenticated/);
  assert.doesNotMatch(migration, /create policy|drop policy|insert into public\.tenants|update public\.tenants/i);
});
