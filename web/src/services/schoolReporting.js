import { supabase } from '../lib/supabase.ts';

const STATUSES = new Set(['creating', 'pending', 'paid', 'paid_review', 'failed']);

export async function muatLaporanKehadiranSekolah() {
    const { data, error } = await supabase.rpc('school_admin_attendance_report');
    if (error) throw error;
    if (!Array.isArray(data) || data.some((row) => !row
        || typeof row.tanggal !== 'string'
        || !/^\d{4}-\d{2}-\d{2}$/.test(row.tanggal)
        || typeof row.kelas !== 'string'
        || !Number.isSafeInteger(Number(row.hadir_scan))
        || Number(row.hadir_scan) < 0
        || Object.keys(row).some((key) => !['tanggal', 'kelas', 'hadir_scan'].includes(key)))) {
        throw new Error('Laporan kehadiran sekolah tidak valid.');
    }
    return data.map((row) => ({ ...row, hadir_scan: Number(row.hadir_scan) }));
}

export async function muatPesananKeuanganSekolah() {
    const { data, error } = await supabase.rpc('school_admin_payment_orders');
    if (error) throw error;
    if (!Array.isArray(data) || data.some((row) => !row
        || typeof row.order_id !== 'string'
        || typeof row.plan_name !== 'string'
        || !['bulanan', 'tahunan'].includes(row.billing_cycle)
        || !STATUSES.has(row.status)
        || !Number.isSafeInteger(Number(row.subtotal)) || Number(row.subtotal) <= 0
        || !Number.isSafeInteger(Number(row.tax_amount)) || Number(row.tax_amount) < 0
        || !Number.isSafeInteger(Number(row.total)) || Number(row.total) !== Number(row.subtotal) + Number(row.tax_amount)
        || typeof row.created_at !== 'string'
        || (row.paid_at !== null && typeof row.paid_at !== 'string')
        || typeof row.expires_at !== 'string'
        || Object.keys(row).some((key) => ![
            'order_id', 'plan_name', 'billing_cycle', 'subtotal', 'tax_amount', 'total',
            'status', 'payment_status', 'created_at', 'paid_at', 'expires_at',
        ].includes(key)))) {
        throw new Error('Daftar pesanan tenant tidak valid.');
    }
    return data.map((row) => ({
        ...row,
        subtotal: Number(row.subtotal),
        tax_amount: Number(row.tax_amount),
        total: Number(row.total),
    }));
}