import { supabase } from '../lib/supabase.ts';

const ORDER_STATUSES = new Set(['creating', 'pending', 'paid', 'paid_review', 'failed']);

export async function buatTenantPlatform({ id, name }) {
    if (typeof id !== 'string' || typeof name !== 'string') {
        throw new TypeError('ID dan nama tenant wajib berupa teks.');
    }
    const tenantId = id.trim().toLowerCase();
    const tenantName = name.trim();
    if (!/^[a-z0-9]+(?:[a-z0-9-]{0,78}[a-z0-9])?$/.test(tenantId)
        || tenantId.length < 3 || tenantId.length > 80
        || tenantName.length < 2 || tenantName.length > 160
        || /[\u0000-\u001f\u007f]/.test(tenantName)) {
        throw new TypeError('ID tenant harus berupa slug 3–80 karakter; nama harus 2–160 karakter.');
    }
    const { data, error } = await supabase.rpc('create_platform_tenant', {
        p_tenant_id: tenantId,
        p_name: tenantName,
    });
    if (error) throw error;
    if (!data || data.tenant_id !== tenantId || data.name !== tenantName || data.active !== true) {
        throw new Error('Respons pembuatan tenant tidak valid.');
    }
    return data;
}

export async function muatHalamanDirektoriTenant({ after = null, limit = 41 } = {}) {
    if (after !== null && (typeof after !== 'string' || !after.trim())) {
        throw new TypeError('Kursor direktori tenant tidak valid.');
    }
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) {
        throw new RangeError('Ukuran halaman direktori tenant harus 1 sampai 100.');
    }

    const { data, error } = await supabase.rpc('platform_tenant_directory_page', {
        p_after: after,
        p_limit: limit,
    });
    if (error) throw error;

    const fields = new Set([
        'tenant_id', 'tenant_name', 'tenant_active', 'profile_count',
        'active_profile_count', 'student_count', 'latest_plan_name',
        'latest_order_status', 'latest_order_created_at', 'latest_order_total',
    ]);
    if (!Array.isArray(data) || data.some((row) =>
        !row || typeof row !== 'object'
        || Object.keys(row).some((field) => !fields.has(field))
        || typeof row.tenant_id !== 'string' || !row.tenant_id
        || typeof row.tenant_name !== 'string'
        || typeof row.tenant_active !== 'boolean'
        || !['profile_count', 'active_profile_count', 'student_count']
            .every((field) => Number.isSafeInteger(Number(row[field])) && Number(row[field]) >= 0)
        || (Number(row.active_profile_count) > Number(row.profile_count))
        || (row.latest_plan_name !== null && typeof row.latest_plan_name !== 'string')
        || (row.latest_order_status !== null && !ORDER_STATUSES.has(row.latest_order_status))
        || (row.latest_order_created_at !== null && !Number.isFinite(Date.parse(row.latest_order_created_at)))
        || (row.latest_order_total !== null && (!Number.isSafeInteger(Number(row.latest_order_total)) || Number(row.latest_order_total) <= 0))
        || ((row.latest_plan_name === null) !== (row.latest_order_status === null))
        || ((row.latest_order_status === null) !== (row.latest_order_created_at === null))
        || ((row.latest_order_status === null) !== (row.latest_order_total === null)))) {
        throw new Error('Direktori tenant dari server tidak valid.');
    }

    return data.map((row) => ({
        id: row.tenant_id,
        name: row.tenant_name,
        active: row.tenant_active,
        profileCount: Number(row.profile_count),
        activeProfileCount: Number(row.active_profile_count),
        studentCount: Number(row.student_count),
        latestPlanName: row.latest_plan_name,
        latestOrderStatus: row.latest_order_status,
        latestOrderCreatedAt: row.latest_order_created_at,
        latestOrderTotal: row.latest_order_total === null ? null : Number(row.latest_order_total),
    }));
}
