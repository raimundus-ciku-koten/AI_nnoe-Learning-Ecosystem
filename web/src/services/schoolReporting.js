import { supabase } from '../lib/supabase.ts';

const STATUSES = new Set(['creating', 'pending', 'paid', 'paid_review', 'failed']);
const FINANCE_FIELDS = new Set([
    'order_id', 'plan_name', 'billing_cycle', 'subtotal', 'tax_amount', 'total',
    'status', 'payment_status', 'created_at', 'paid_at', 'expires_at',
]);

function validasiRentang({ startDate, endDate }) {
    const datePattern = /^\d{4}-\d{2}-\d{2}$/;
    const start = Date.parse(`${startDate}T00:00:00Z`);
    const end = Date.parse(`${endDate}T00:00:00Z`);
    const todayUtc = new Date().toISOString().slice(0, 10);
    if (!datePattern.test(startDate) || !datePattern.test(endDate)
        || !Number.isFinite(start) || !Number.isFinite(end)
        || new Date(start).toISOString().slice(0, 10) !== startDate
        || new Date(end).toISOString().slice(0, 10) !== endDate
        || start > end
        || endDate > todayUtc
        || (end - start) / 86_400_000 > 365) {
        throw new TypeError('Rentang tanggal harus 1 sampai 366 hari dan tidak melewati hari ini.');
    }
}

function normalisasiPesanan(rows) {
    if (!Array.isArray(rows) || rows.some((row) => !row
        || typeof row.order_id !== 'string'
        || typeof row.plan_name !== 'string'
        || !['bulanan', 'tahunan'].includes(row.billing_cycle)
        || !STATUSES.has(row.status)
        || !Number.isSafeInteger(Number(row.subtotal)) || Number(row.subtotal) <= 0
        || !Number.isSafeInteger(Number(row.tax_amount)) || Number(row.tax_amount) < 0
        || !Number.isSafeInteger(Number(row.total)) || Number(row.total) !== Number(row.subtotal) + Number(row.tax_amount)
        || (row.payment_status !== null && (typeof row.payment_status !== 'string' || row.payment_status.length > 80))
        || typeof row.created_at !== 'string' || !Number.isFinite(Date.parse(row.created_at))
        || (row.paid_at !== null && (typeof row.paid_at !== 'string' || !Number.isFinite(Date.parse(row.paid_at))))
        || typeof row.expires_at !== 'string' || !Number.isFinite(Date.parse(row.expires_at))
        || Object.keys(row).some((key) => !FINANCE_FIELDS.has(key)))) {
        throw new Error('Daftar pesanan tenant tidak valid.');
    }
    return rows.map((row) => ({
        ...row,
        subtotal: Number(row.subtotal),
        tax_amount: Number(row.tax_amount),
        total: Number(row.total),
    }));
}

function normalisasiKehadiran(data) {
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

export async function muatLaporanKehadiranSekolah() {
    const { data, error } = await supabase.rpc('school_admin_attendance_report');
    if (error) throw error;
    return normalisasiKehadiran(data);
}

export async function muatLaporanKehadiranSekolahRentang({ startDate, endDate }) {
    validasiRentang({ startDate, endDate });
    const { data, error } = await supabase.rpc('school_admin_attendance_report_range', {
        p_start_date: startDate,
        p_end_date: endDate,
    });
    if (error) throw error;
    return normalisasiKehadiran(data);
}

export async function muatPesananKeuanganSekolah() {
    const { data, error } = await supabase.rpc('school_admin_payment_orders');
    if (error) throw error;
    return normalisasiPesanan(data);
}

export async function muatRingkasanKeuanganSekolah({ startDate, endDate }) {
    validasiRentang({ startDate, endDate });
    const { data, error } = await supabase.rpc('school_admin_payment_order_summary', {
        p_start_date: startDate,
        p_end_date: endDate,
    });
    if (error) throw error;
    const fields = [
        'order_count', 'paid_count', 'pending_count', 'failed_count',
        'paid_amount', 'pending_amount', 'paid_review_count', 'paid_review_amount',
    ];
    if (!Array.isArray(data) || data.length !== 1 || !data[0]
        || Object.keys(data[0]).some((key) => !fields.includes(key))
        || fields.some((field) => !Number.isSafeInteger(Number(data[0][field])) || Number(data[0][field]) < 0)
        || Number(data[0].paid_count) + Number(data[0].pending_count)
            + Number(data[0].failed_count) + Number(data[0].paid_review_count) !== Number(data[0].order_count)) {
        throw new Error('Ringkasan keuangan tenant tidak valid.');
    }
    return Object.fromEntries(fields.map((field) => [field, Number(data[0][field])]));
}

export async function muatHalamanPesananKeuanganSekolah({
    startDate,
    endDate,
    status = null,
    cursor = null,
    limit = 50,
}) {
    validasiRentang({ startDate, endDate });
    if (status !== null && !STATUSES.has(status)) throw new TypeError('Status pesanan tidak valid.');
    if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new RangeError('Ukuran halaman harus 1 sampai 100.');
    if (cursor !== null && (!cursor || typeof cursor.created_at !== 'string'
        || !Number.isFinite(Date.parse(cursor.created_at))
        || typeof cursor.order_id !== 'string' || !cursor.order_id)) {
        throw new TypeError('Kursor pesanan tenant tidak valid.');
    }
    const { data, error } = await supabase.rpc('school_admin_payment_orders_page', {
        p_start_date: startDate,
        p_end_date: endDate,
        p_status: status,
        p_after_created_at: cursor?.created_at || null,
        p_after_order_id: cursor?.order_id || null,
        p_limit: limit + 1,
    });
    if (error) throw error;
    const rows = normalisasiPesanan(data);
    const pageRows = rows.slice(0, limit);
    return {
        rows: pageRows,
        hasMore: rows.length > limit,
        nextCursor: rows.length > limit
            ? { created_at: pageRows.at(-1).created_at, order_id: pageRows.at(-1).order_id }
            : null,
    };
}

export async function muatSemuaPesananKeuanganSekolah(filters, maxRows = 1000) {
    if (!Number.isInteger(maxRows) || maxRows < 1 || maxRows > 5000) {
        throw new RangeError('Batas ekspor harus 1 sampai 5.000 pesanan.');
    }
    const rows = [];
    let cursor = null;
    const seenCursors = new Set();
    do {
        const page = await muatHalamanPesananKeuanganSekolah({
            ...filters,
            cursor,
            limit: Math.min(100, maxRows - rows.length),
        });
        if (page.rows.length === 0 && page.hasMore) {
            throw new Error('Halaman pesanan tidak bergerak; ekspor dihentikan.');
        }
        rows.push(...page.rows);
        cursor = page.nextCursor;
        if (cursor) {
            const cursorKey = `${cursor.created_at}|${cursor.order_id}`;
            if (seenCursors.has(cursorKey)) throw new Error('Kursor ekspor pesanan berulang.');
            seenCursors.add(cursorKey);
        }
        if (cursor && rows.length >= maxRows) {
            throw new RangeError(`Hasil melebihi ${maxRows.toLocaleString('id-ID')} pesanan. Persempit rentang tanggal sebelum mengekspor.`);
        }
    } while (cursor);
    return rows;
}
