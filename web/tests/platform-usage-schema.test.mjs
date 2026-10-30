import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';

const sql = await readFile(fileURLToPath(new URL('../../supabase/migrations/20261030001000_platform_usage_snapshot.sql', import.meta.url)), 'utf8');

test('platform snapshot is superadmin-only and returns only aggregate count columns', () => {
    assert.match(sql, /current_app_role\(\)\) <> 'superadmin'/);
    assert.match(sql, /revoke all on function public\.platform_usage_snapshot\(\) from public, anon/);
    assert.match(sql, /returns table\s*\(\s*snapshot_at timestamptz,\s*tenant_count bigint/s);
    for (const field of [
        'active_tenant_count', 'active_profile_count', 'school_admin_count', 'student_count',
        'attendance_scan_90d', 'chat_messages_30d', 'exams_30d', 'question_bank_count',
        'published_content_count',
    ]) assert.match(sql, new RegExp(`${field} bigint`));
    assert.doesNotMatch(sql, /select\s+profile\.email|message\.body|question\.jawaban|student\.nama/is);
});
