import { supabase } from '../lib/supabase.ts';

const COUNTS = [
    'tenant_count', 'active_tenant_count', 'profile_count', 'active_profile_count',
    'school_admin_count', 'student_count', 'attendance_scan_90d', 'chat_messages_30d',
    'exams_30d', 'question_bank_count', 'published_content_count',
];

export async function muatSnapshotPlatform() {
    const { data, error } = await supabase.rpc('platform_usage_snapshot');
    if (error) throw error;
    if (!Array.isArray(data) || data.length !== 1) throw new Error('Snapshot penggunaan platform tidak valid.');
    const row = data[0];
    if (!row || typeof row.snapshot_at !== 'string' || !Number.isFinite(Date.parse(row.snapshot_at))
        || Object.keys(row).some((key) => key !== 'snapshot_at' && !COUNTS.includes(key))
        || COUNTS.some((key) => !Number.isSafeInteger(Number(row[key])) || Number(row[key]) < 0)) {
        throw new Error('Snapshot penggunaan platform tidak valid.');
    }
    return {
        snapshotAt: row.snapshot_at,
        ...Object.fromEntries(COUNTS.map((key) => [key, Number(row[key])])),
    };
}
