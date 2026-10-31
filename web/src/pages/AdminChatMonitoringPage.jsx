import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { muatRingkasanChatSekolah } from '../services/schoolChatMonitoring.js';
import '../styles/guardian-portal.css';

const LABEL = [
    ['conversation_count', 'Percakapan tenant'],
    ['active_conversations_30d', 'Aktif dalam 30 hari'],
    ['messages_7d', 'Pesan dalam 7 hari'],
    ['messages_30d', 'Pesan dalam 30 hari'],
];

export default function AdminChatMonitoringPage() {
    const { role, activeRole, tenantId } = useAuth();
    const roleAktif = activeRole || role;
    const [summary, setSummary] = useState(null);
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
        muatRingkasanChatSekolah()
            .then((result) => { if (active) setSummary(result); })
            .catch((cause) => {
                console.error('[admin-chat] Gagal memuat agregat chat tenant:', cause);
                if (active) setError('Ringkasan belum tersedia. Pastikan migrasi monitoring chat diterapkan dan admin memiliki tenant aktif.');
            })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [roleAktif, tenantId]);

    if (roleAktif !== 'admin_sekolah') {
        return <section className="guardian-card" role="alert"><h1>Monitoring chat dibatasi</h1><p>Agregat chat hanya tersedia bagi admin sekolah pada tenant aktif.</p></section>;
    }
    if (!tenantId) {
        return <section className="guardian-card" role="alert"><h1>Tenant belum tersedia</h1><p>Akun ini belum terhubung ke tenant sekolah.</p></section>;
    }

    return (
        <main className="guardian-page" aria-labelledby="admin-chat-monitoring-title">
            <header className="guardian-header">
                <p>Monitoring · tenant sekolah</p>
                <h1 id="admin-chat-monitoring-title">Aktivitas chat</h1>
                <span>Ringkasan volume komunikasi pada tenant aktif.</span>
            </header>
            <p className="guardian-message is-notice" role="note">Privasi percakapan dijaga: halaman ini tidak menampilkan nama anggota, isi pesan, atau detail chat.</p>
            {error && <p className="guardian-message is-error" role="alert">{error}</p>}
            {loading && <p className="guardian-empty" role="status">Memuat ringkasan…</p>}
            {summary && (
                <section className="chat-monitoring-grid" aria-label="Agregat chat tenant">
                    {LABEL.map(([key, label]) => (
                        <article className="chat-monitoring-stat" key={key}>
                            <span>{label}</span>
                            <strong>{summary[key].toLocaleString('id-ID')}</strong>
                        </article>
                    ))}
                </section>
            )}
            <p className="guardian-footnote">Jumlah dihitung saat halaman dibuka, bukan laporan historis atau indikator kualitas percakapan.</p>
        </main>
    );
}