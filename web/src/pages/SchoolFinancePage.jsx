import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { muatPesananKeuanganSekolah } from '../services/schoolReporting.js';
import '../styles/school-reports.css';

const VIEW = {
    pembayaran: ['Pembayaran sekolah', 'Riwayat pembayaran yang tercatat pada tenant ini.'],
    tagihan: ['Tagihan sekolah', 'Pesanan tertunda dan status pembayaran yang dikirim backend.'],
    laporan: ['Laporan keuangan', 'Ringkasan nilai pesanan yang tersimpan; bukan laporan akuntansi atau rekening koran.'],
};
const RUPIAH = (value) => new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR', maximumFractionDigits: 0 }).format(value);
const TANGGAL = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Waktu tidak tersedia'
        : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};
const STATUS = { creating: 'Dibuat', pending: 'Menunggu pembayaran', paid: 'Tercatat lunas', paid_review: 'Menunggu tinjauan', failed: 'Gagal' };

export default function SchoolFinancePage() {
    const { pathname } = useLocation();
    const { role, activeRole, tenantId } = useAuth();
    const roleAktif = activeRole || role;
    const sub = pathname.split('/').filter(Boolean).at(-1);
    const [title, description] = VIEW[sub] || VIEW.pembayaran;
    const [orders, setOrders] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let active = true;
        if (roleAktif !== 'admin_sekolah' || !tenantId) {
            setLoading(false);
            return () => { active = false; };
        }
        setLoading(true);
        setError('');
        muatPesananKeuanganSekolah()
            .then((rows) => { if (active) setOrders(rows); })
            .catch((cause) => {
                console.error('[school-finance] Gagal memuat pesanan tenant:', cause);
                if (active) setError('Riwayat pembayaran belum tersedia. Pastikan migrasi billing sudah diterapkan pada tenant.');
            })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [roleAktif, tenantId]);

    const visible = useMemo(() => sub === 'tagihan'
        ? orders.filter((order) => ['creating', 'pending', 'paid_review'].includes(order.status))
        : orders, [orders, sub]);
    const totals = useMemo(() => orders.reduce((result, order) => ({
        paidCount: result.paidCount + Number(order.status === 'paid'),
        pendingCount: result.pendingCount + Number(['creating', 'pending', 'paid_review'].includes(order.status)),
        paidTotal: result.paidTotal + (order.status === 'paid' ? order.total : 0),
    }), { paidCount: 0, pendingCount: 0, paidTotal: 0 }), [orders]);

    if (roleAktif !== 'admin_sekolah') {
        return <section className="school-report-card" role="alert"><h1>{title}</h1><p>Keuangan tenant hanya tersedia bagi admin sekolah.</p></section>;
    }
    if (!tenantId) {
        return <section className="school-report-card" role="alert"><h1>{title}</h1><p>Akun ini belum terhubung ke tenant.</p></section>;
    }

    return (
        <main className="school-reports" aria-labelledby="school-finance-title">
            <header className="school-reports-header"><p>Keuangan · tenant sekolah</p><h1 id="school-finance-title">{title}</h1><span>{description}</span></header>
            <p className="school-report-note" role="note">Checkout dan pembayaran online saat ini dinonaktifkan. Status “lunas” hanya mencerminkan pesanan yang telah dicatat backend, bukan konfirmasi bank atau laporan akuntansi.</p>
            {error && <p className="school-report-error" role="alert">{error}</p>}
            {loading ? <p className="school-report-empty" role="status">Memuat riwayat pesanan…</p> : (
                <>
                    <section className="school-report-stats" aria-label="Ringkasan pesanan tercatat">
                        <article><span>Pesanan terakhir (maks. 100)</span><strong>{orders.length}</strong></article>
                        <article><span>Menunggu / ditinjau</span><strong>{totals.pendingCount}</strong></article>
                        <article><span>Pesanan tercatat lunas</span><strong>{totals.paidCount}</strong></article>
                        <article><span>Total lunas · 100 terbaru</span><strong>{RUPIAH(totals.paidTotal)}</strong></article>
                    </section>
                    <section className="school-report-card" aria-labelledby="school-finance-orders-title">
                        <div className="school-report-section-title"><div><p>Supabase · read-only</p><h2 id="school-finance-orders-title">{sub === 'tagihan' ? 'Tagihan terbuka' : 'Riwayat pesanan'}</h2></div></div>
                        {!visible.length ? <p className="school-report-empty">Belum ada pesanan pada tenant ini.</p> : (
                            <div className="school-report-table-wrap"><table className="school-report-table">
                                <thead><tr><th scope="col">Paket</th><th scope="col">Siklus</th><th scope="col">Dibuat</th><th scope="col">Status</th><th scope="col">Total</th></tr></thead>
                                <tbody>{visible.map((order) => <tr key={order.order_id}>
                                    <th scope="row">{order.plan_name}<small>{order.order_id}</small></th>
                                    <td>{order.billing_cycle}</td><td>{TANGGAL(order.created_at)}</td>
                                    <td><span className={`school-report-status is-${order.status}`}>{STATUS[order.status]}</span></td>
                                    <td>{RUPIAH(order.total)}</td>
                                </tr>)}</tbody>
                            </table></div>
                        )}
                    </section>
                    <p className="school-report-footnote">Tidak ada tombol membayar, mengubah status, atau mengaktifkan entitlement. Perubahan pembayaran harus diproses backend tepercaya.</p>
                </>
            )}
        </main>
    );
}