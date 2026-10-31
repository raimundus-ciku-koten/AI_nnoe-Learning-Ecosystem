import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { buatCsv, csvEscape, unduhBerkas } from '../lib/berkas.js';
import {
    muatHalamanPesananKeuanganSekolah,
    muatRingkasanKeuanganSekolah,
    muatSemuaPesananKeuanganSekolah,
} from '../services/schoolReporting.js';
import '../styles/school-reports.css';

const VIEW = {
    pembayaran: ['Pembayaran sekolah', 'Riwayat pembayaran yang tercatat pada tenant ini.'],
    tagihan: ['Tagihan sekolah', 'Pesanan tertunda dan status pembayaran yang dikirim backend.'],
    laporan: ['Laporan keuangan', 'Ringkasan dan ekspor pesanan yang tercatat pada periode pilihan.'],
};
const STATUS = {
    creating: 'Dibuat',
    pending: 'Menunggu pembayaran',
    paid: 'Tercatat lunas',
    paid_review: 'Menunggu tinjauan',
    failed: 'Gagal',
};
const RUPIAH = (value) => new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    maximumFractionDigits: 0,
}).format(value);
const TANGGAL = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Waktu tidak tersedia'
        : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'UTC' }).format(date);
};
const tanggalUtc = (date) => {
    return date.toISOString().slice(0, 10);
};
const rentangDefault = () => {
    const end = new Date();
    const start = new Date(`${tanggalUtc(end)}T00:00:00.000Z`);
    start.setUTCDate(start.getUTCDate() - 89);
    return { startDate: tanggalUtc(start), endDate: tanggalUtc(end) };
};

function statusPembayaran(order) {
    if (order.payment_status) return order.payment_status;
    return STATUS[order.status] || 'Status tidak tersedia';
}

export default function SchoolFinancePage() {
    const { pathname } = useLocation();
    const { role, activeRole, tenantId } = useAuth();
    const roleAktif = activeRole || role;
    const sub = pathname === '/admin/laporan/keuangan'
        ? 'laporan'
        : pathname.split('/').filter(Boolean).at(-1);
    const [title, description] = VIEW[sub] || VIEW.pembayaran;
    const [dateDraft, setDateDraft] = useState(rentangDefault);
    const [filters, setFilters] = useState(() => ({ ...rentangDefault(), status: null }));
    const [statusDraft, setStatusDraft] = useState('');
    const [summary, setSummary] = useState(null);
    const [orders, setOrders] = useState([]);
    const [cursor, setCursor] = useState(null);
    const [hasMore, setHasMore] = useState(false);
    const [loading, setLoading] = useState(true);
    const [loadingMore, setLoadingMore] = useState(false);
    const [exporting, setExporting] = useState(false);
    const [error, setError] = useState('');
    const [reloadId, setReloadId] = useState(0);

    useEffect(() => {
        let active = true;
        if (roleAktif !== 'admin_sekolah' || !tenantId) {
            setLoading(false);
            return () => { active = false; };
        }
        setLoading(true);
        setError('');
        setOrders([]);
        setCursor(null);
        setHasMore(false);
        Promise.all([
            muatRingkasanKeuanganSekolah(filters),
            muatHalamanPesananKeuanganSekolah({ ...filters, limit: 50 }),
        ])
            .then(([nextSummary, page]) => {
                if (!active) return;
                setSummary(nextSummary);
                setOrders(page.rows);
                setCursor(page.nextCursor);
                setHasMore(page.hasMore);
            })
            .catch((cause) => {
                console.error('[school-finance] Gagal memuat laporan keuangan tenant:', cause);
                if (active) setError(cause?.message || 'Laporan keuangan tidak dapat dimuat. Periksa akses dan migrasi yang tersedia.');
            })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [roleAktif, tenantId, filters, reloadId]);

    const visibleOrders = useMemo(() => sub === 'tagihan'
        ? orders.filter((order) => ['creating', 'pending', 'paid_review'].includes(order.status))
        : orders, [orders, sub]);

    async function applyFilters(event) {
        event.preventDefault();
        setFilters({
            ...dateDraft,
            status: statusDraft || null,
        });
    }

    async function loadMore() {
        if (!cursor || loadingMore) return;
        setLoadingMore(true);
        setError('');
        try {
            const page = await muatHalamanPesananKeuanganSekolah({
                ...filters,
                cursor,
                limit: 50,
            });
            setOrders((current) => [...current, ...page.rows]);
            setCursor(page.nextCursor);
            setHasMore(page.hasMore);
        } catch (cause) {
            console.error('[school-finance] Gagal memuat halaman pesanan berikutnya:', cause);
            setError(cause?.message || 'Halaman pesanan berikutnya tidak dapat dimuat.');
        } finally {
            setLoadingMore(false);
        }
    }

    async function exportCsv() {
        if (exporting) return;
        setExporting(true);
        setError('');
        try {
            const allOrders = await muatSemuaPesananKeuanganSekolah(filters);
            const rows = [
                ['ID pesanan', 'Paket', 'Siklus', 'Dibuat', 'Subtotal (IDR)', 'Pajak (IDR)', 'Total (IDR)', 'Status pesanan', 'Status provider', 'Dibayar', 'Kedaluwarsa'],
                ...allOrders.map((order) => [
                    order.order_id, order.plan_name, order.billing_cycle, order.created_at,
                    order.subtotal, order.tax_amount, order.total, STATUS[order.status],
                    order.payment_status || '', order.paid_at || '', order.expires_at,
                ]),
            ];
            unduhBerkas(
                `laporan-keuangan-${filters.startDate}-${filters.endDate}.csv`,
                buatCsv(rows.map((row) => row.map(csvEscape))),
                'text/csv',
            );
        } catch (cause) {
            console.error('[school-finance] Ekspor laporan keuangan gagal:', cause);
            setError(cause?.message || 'Laporan keuangan tidak dapat diekspor.');
        } finally {
            setExporting(false);
        }
    }

    if (roleAktif !== 'admin_sekolah') {
        return <section className="school-report-card" role="alert"><h1>{title}</h1><p>Keuangan tenant hanya tersedia bagi admin sekolah.</p></section>;
    }
    if (!tenantId) {
        return <section className="school-report-card" role="alert"><h1>{title}</h1><p>Akun ini belum terhubung ke tenant.</p></section>;
    }

    return (
        <main className="school-reports" aria-labelledby="school-finance-title">
            <header className="school-reports-header">
                <p>Keuangan · tenant sekolah</p>
                <h1 id="school-finance-title">{title}</h1>
                <span>{description}</span>
            </header>
            <p className="school-report-note" role="note">
                Ini adalah laporan pesanan billing tercatat, bukan buku besar, bukti transfer, atau rekening koran. Checkout dan perubahan status pembayaran tetap dinonaktifkan; status “lunas” berasal dari backend tepercaya.
            </p>
            <form className="school-report-filters" onSubmit={applyFilters}>
                <label>Dari tanggal
                    <input type="date" value={dateDraft.startDate} max={dateDraft.endDate}
                        onChange={(event) => setDateDraft((current) => ({ ...current, startDate: event.target.value }))} required />
                </label>
                <label>Sampai tanggal
                    <input type="date" value={dateDraft.endDate} max={tanggalUtc(new Date())}
                        onChange={(event) => setDateDraft((current) => ({ ...current, endDate: event.target.value }))} required />
                </label>
                <label>Status
                    <select value={statusDraft} onChange={(event) => setStatusDraft(event.target.value)}>
                        <option value="">Semua status</option>
                        {Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
                    </select>
                </label>
                <button className="school-report-button" type="submit" disabled={loading}>Terapkan filter</button>
                <button className="school-report-button secondary" type="button" onClick={() => setReloadId((current) => current + 1)} disabled={loading}>
                    Muat ulang
                </button>
            </form>
            <p className="school-report-footnote">Rentang tanggal pesanan menggunakan UTC. Maksimal 366 hari per permintaan. Ringkasan mengikuti seluruh rentang tanggal; filter status hanya mempersempit daftar dan ekspor. Daftar dimuat per halaman, ekspor dibatasi 1.000 pesanan.</p>
            {error && <p className="school-report-error" role="alert">{error}</p>}
            {loading ? <p className="school-report-empty" role="status">Memuat laporan keuangan…</p> : (
                <>
                    {sub === 'laporan' && (
                        <button className="school-report-button" type="button" onClick={() => void exportCsv()} disabled={exporting}>
                            {exporting ? 'Menyiapkan ekspor…' : 'Ekspor semua hasil filter (CSV)'}
                        </button>
                    )}
                    {summary && (
                        <section className="school-report-stats" aria-label="Ringkasan pesanan pada rentang tanggal">
                            <article><span>Total pesanan</span><strong>{summary.order_count.toLocaleString('id-ID')}</strong></article>
                            <article><span>Pesanan tercatat lunas</span><strong>{summary.paid_count.toLocaleString('id-ID')} · {RUPIAH(summary.paid_amount)}</strong></article>
                            <article><span>Menunggu pembayaran</span><strong>{summary.pending_count.toLocaleString('id-ID')} · {RUPIAH(summary.pending_amount)}</strong></article>
                            <article><span>Menunggu tinjauan</span><strong>{summary.paid_review_count.toLocaleString('id-ID')} · {RUPIAH(summary.paid_review_amount)}</strong></article>
                            <article><span>Gagal</span><strong>{summary.failed_count.toLocaleString('id-ID')}</strong></article>
                        </section>
                    )}
                    <section className="school-report-card" aria-labelledby="school-finance-orders-title">
                        <div className="school-report-section-title">
                            <div><p>{filters.startDate} – {filters.endDate}</p><h2 id="school-finance-orders-title">{sub === 'tagihan' ? 'Tagihan terbuka dan tinjauan' : 'Riwayat pesanan'}</h2></div>
                        </div>
                        {!visibleOrders.length ? <p className="school-report-empty">Tidak ada pesanan yang cocok dengan rentang dan status pilihan.</p> : (
                            <div className="school-report-table-wrap"><table className="school-report-table">
                                <thead><tr><th scope="col">Paket / ID</th><th scope="col">Siklus</th><th scope="col">Dibuat</th><th scope="col">Status backend</th><th scope="col">Status provider</th><th scope="col">Subtotal</th><th scope="col">Pajak</th><th scope="col">Total</th></tr></thead>
                                <tbody>{visibleOrders.map((order) => <tr key={order.order_id}>
                                    <th scope="row">{order.plan_name}<small>{order.order_id}</small></th>
                                    <td>{order.billing_cycle}</td>
                                    <td>{TANGGAL(order.created_at)}</td>
                                    <td><span className={`school-report-status is-${order.status}`}>{STATUS[order.status]}</span></td>
                                    <td>{statusPembayaran(order)}</td>
                                    <td>{RUPIAH(order.subtotal)}</td><td>{RUPIAH(order.tax_amount)}</td><td>{RUPIAH(order.total)}</td>
                                </tr>)}</tbody>
                            </table></div>
                        )}
                        {hasMore && (
                            <div className="school-report-pagination">
                                <p>{orders.length.toLocaleString('id-ID')} pesanan dimuat.</p>
                                <button className="school-report-button secondary" type="button" onClick={() => void loadMore()} disabled={loadingMore}>
                                    {loadingMore ? 'Memuat…' : 'Muat pesanan berikutnya'}
                                </button>
                            </div>
                        )}
                    </section>
                </>
            )}
        </main>
    );
}
