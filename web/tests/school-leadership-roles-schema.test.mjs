import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const migration = await readFile(new URL(
    '../../supabase/migrations/20261031000100_school_leadership_roles.sql',
    import.meta.url,
), 'utf8');

test('activates only trusted, active head and homeroom teacher claims without weakening admin MFA', () => {
    assert.match(migration, /public\.current_app_role\(\) in \([\s\S]*?'wali_kelas'[\s\S]*?'kepala_sekolah'/);
    assert.match(migration, /when public\.current_app_role\(\) in \('admin_sekolah', 'superadmin'\)[\s\S]*?auth\.jwt\(\) ->> 'aal' = 'aal2'/);
    assert.match(migration, /profile\.id = auth\.uid\(\)/);
});

test('limits homeroom ledger to same-tenant classes assigned to an active teacher account', () => {
    assert.match(migration, /profile\.tenant_id = \(select public\.current_tenant_id\(\)\)/);
    assert.match(migration, /profile\.roles @> array\['guru', 'wali_kelas'\]::text\[\]/);
    assert.match(migration, /student\.kelas = any\(profile\.kelas_ids\)/);
    assert.match(migration, /exam\.tenant_id = student\.tenant_id/);
    assert.match(migration, /public\.online_exam_recipients/);
    assert.match(migration, /attempt\.grade_pending then null else attempt\.score end/);
    assert.doesNotMatch(migration, /attempt\.answers|correct_answer|essay_responses/);
    assert.match(migration, /revoke all on function public\.homeroom_exam_grade_ledger\(\)[\s\S]*?from public, anon/);
});