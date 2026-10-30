import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const sql = await readFile(fileURLToPath(new URL('../../supabase/migrations/20261030000900_platform_content_catalog.sql', import.meta.url)), 'utf8');

test('global catalog is a typed, versioned, superadmin-only table', () => {
    assert.match(sql, /content_type in \('template_perangkat', 'bank_soal', 'modul'\)/);
    assert.match(sql, /status text not null default 'draft' check \(status in \('draft', 'published', 'archived'\)\)/);
    assert.match(sql, /version integer not null default 1/);
    assert.match(sql, /alter table public\.platform_content_catalog enable row level security/);
    assert.match(sql, /revoke all on table public\.platform_content_catalog from public, anon, authenticated/);
    assert.match(sql, /current_app_role\(\)\) <> 'superadmin'/);
});

test('publishing requires content and license metadata and writes platform audit events', () => {
    assert.match(sql, /Draf dan lisensi\/sumber konten wajib lengkap sebelum terbit/);
    assert.match(sql, /platform-content-create/);
    assert.match(sql, /platform-content-update/);
    assert.match(sql, /platform-content-publish/);
    assert.match(sql, /platform-content-archive/);
    assert.match(sql, /Hanya draf yang dapat diubah/);
});
