import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const migrationUrl = new URL('../../supabase/migrations/20261030000600_student_guardian_portal.sql', import.meta.url);
const sql = await readFile(fileURLToPath(migrationUrl), 'utf8');

test('guardian links and audit are private to server RPCs', () => {
    assert.match(sql, /create table if not exists public\.student_guardian_links/);
    assert.match(sql, /create table if not exists public\.student_guardian_link_audit/);
    assert.match(sql, /alter table public\.student_guardian_links enable row level security/);
    assert.match(sql, /alter table public\.student_guardian_link_audit enable row level security/);
    assert.match(sql, /revoke all on table public\.student_guardian_links, public\.student_guardian_link_audit\s+from public, anon, authenticated/);
    assert.match(sql, /profile\.tenant_id = v_tenant_id/);
    assert.match(sql, /profile\.role in \('ortu', 'orang_tua'\)/);
});

test('guardian RPCs validate the link owner before returning private data', () => {
    for (const name of ['parent_student_attendance', 'parent_student_exam_results']) {
        const body = sql.slice(sql.indexOf(`create or replace function public.${name}`));
        assert.match(body, /link\.guardian_user_id = auth\.uid\(\)/);
        assert.match(body, /link\.tenant_id = \(select public\.current_tenant_id\(\)\)/);
    }
});

test('guardian exam results omit answer content and conceal pending scores', () => {
    assert.match(sql, /case when attempt\.grade_pending then null else attempt\.score end/);
    const results = sql.slice(sql.indexOf('create or replace function public.parent_student_exam_results'));
    assert.doesNotMatch(results, /correct_answer|attempt\.answers/);
    assert.match(results, /exam\.ends_at <= now\(\)/);
});