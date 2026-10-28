import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const root = new URL('../../', import.meta.url);
const migration = await readFile(
  new URL('supabase/migrations/20261025000600_private_workspace_records.sql', root),
  'utf8',
);

describe('skema ruang kerja pribadi', () => {
  it('menyimpan catatan yang dibatasi akun, peran, tenant, dan submenu', () => {
    assert.match(migration, /create table if not exists public\.private_workspace_records/i);
    assert.match(migration, /user_id uuid not null references public\.profiles\(id\)/i);
    assert.match(migration, /route text not null check/i);
    assert.match(migration, /search text not null default '' check/i);
    assert.match(migration, /title text not null check/i);
    assert.match(migration, /status in \('planned', 'in_progress', 'done'\)/i);
    assert.match(migration, /char_length\(details\) <= 6000/i);
  });

  it('membatasi seluruh operasi lewat RLS ke pengguna aktif dan tenant serta peran JWT', () => {
    assert.match(migration, /alter table public\.private_workspace_records enable row level security/i);
    assert.match(migration, /public\.current_user_is_active\(\)/);
    assert.match(migration, /user_id = \(select auth\.uid\(\)\)/);
    assert.match(migration, /role = \(select public\.current_app_role\(\)\)/);
    assert.match(migration, /tenant_id is not distinct from nullif\(\(select public\.current_tenant_id\(\)\), ''\)/);
    assert.match(migration, /for all\s+to authenticated/i);
  });
});
