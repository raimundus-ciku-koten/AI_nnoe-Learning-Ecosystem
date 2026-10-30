import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { usePlatformControls } from '../context/PlatformControlContext.jsx';
import { setPlatformControl } from '../services/platformAdminApi.js';

const FEATURES = [
    {
        key: 'aiAssistant',
        label: 'Asisten AI',
        description: 'Kontrol server untuk entry point Asisten AI yang memeriksa feature flag platform.',
    },
    {
        key: 'aiGeneration',
        label: 'Generator AI',
        description: 'Kontrol server untuk entry point generator pembelajaran yang memeriksa feature flag platform.',
    },
];

export default function PlatformAIManagementPage() {
    const { role } = useAuth();
    const controls = usePlatformControls();
    const [savedFeatures, setSavedFeatures] = useState(null);
    const [busy, setBusy] = useState('');
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');
    const features = savedFeatures || controls.features;

    useEffect(() => {
        setSavedFeatures(null);
    }, [controls.features]);

    async function ubahFitur(feature, enabled) {
        if (busy) return;
        if (!enabled && !window.confirm(`Nonaktifkan ${FEATURES.find((item) => item.key === feature)?.label}?`)) return;
        setBusy(feature);
        setError('');
        setNotice('');
        try {
            const result = await setPlatformControl({ setting: 'feature', feature, enabled });
            const nextFeatures = result?.state?.features;
            if (typeof nextFeatures?.aiAssistant !== 'boolean'
                || typeof nextFeatures?.aiGeneration !== 'boolean') {
                throw new Error('Respons kontrol AI dari server tidak valid.');
            }
            setSavedFeatures(nextFeatures);
            setNotice(result.changed
                ? 'Kontrol AI diperbarui dan dicatat pada audit server.'
                : 'Kontrol sudah memiliki status tersebut; tidak ada perubahan baru.');
        } catch (cause) {
            console.error('[platform-ai] Gagal memperbarui kontrol AI:', cause);
            setError(cause?.code === '42501'
                ? 'Akses ditolak. Pastikan sesi superadmin masih aktif.'
                : cause?.message || 'Kontrol AI tidak dapat diperbarui.');
        } finally {
            setBusy('');
        }
    }

    if (role !== 'superadmin') {
        return (
            <main className="platform-tenants">
                <section className="platform-tenants-card" role="alert">
                    <h1>Manajemen AI platform</h1>
                    <p>Kontrol AI global hanya tersedia untuk superadmin.</p>
                </section>
            </main>
        );
    }

    return (
        <main className="platform-tenants">
            <header className="platform-tenants-heading">
                <p className="platform-tenants-kicker">AI dan layanan · kontrol platform</p>
                <h1>Manajemen AI Platform</h1>
                <p>Kelola feature flag AI melalui RPC superadmin yang mencatat perubahan pada audit server.</p>
            </header>

            {controls.error && <p className="platform-tenants-error" role="alert">{controls.error}</p>}
            {error && <p className="platform-tenants-error" role="alert">{error}</p>}
            {notice && <p className="platform-ops-note" role="status">{notice}</p>}

            <section className="platform-tenants-card" aria-labelledby="platform-ai-controls-title">
                <div className="platform-tenants-toolbar">
                    <div>
                        <h2 id="platform-ai-controls-title">Kontrol kemampuan AI</h2>
                        <p>Status dibaca dari konfigurasi Supabase aktif.</p>
                    </div>
                    {controls.loading && <span role="status">Memuat kontrol…</span>}
                </div>
                <div className="platform-ops-counts">
                    {FEATURES.map(({ key, label, description }) => (
                        <article key={key}>
                            <span>{label}</span>
                            <strong>{features[key] ? 'Aktif' : 'Nonaktif'}</strong>
                            <p>{description}</p>
                            <button
                                className="platform-tenants-button"
                                type="button"
                                disabled={controls.loading || Boolean(busy) || Boolean(controls.error)}
                                onClick={() => void ubahFitur(key, !features[key])}
                            >
                                {busy === key ? 'Menyimpan…' : features[key] ? 'Nonaktifkan' : 'Aktifkan'}
                            </button>
                        </article>
                    ))}
                </div>
                <p className="platform-ops-note">
                    Perubahan berlaku pada entry point yang memeriksa feature flag ini. Kontrol ini tidak mencabut kunci API pribadi yang disimpan sementara di browser pengguna.
                </p>
            </section>

            <section className="platform-tenants-card" aria-labelledby="platform-ai-provider-title">
                <h2 id="platform-ai-provider-title">Provider, kunci, dan telemetry</h2>
                <p>
                    Aplikasi belum menyediakan proxy AI Supabase Edge yang terhubung ke provider platform. Alur provider yang tersedia menggunakan kunci pribadi sementara di browser pengguna; nilai kunci tidak tersedia untuk superadmin.
                </p>
                <ul>
                    <li><strong>Status kunci provider platform:</strong> tidak dapat diverifikasi dari aplikasi.</li>
                    <li><strong>Jumlah permintaan, token, dan biaya AI:</strong> belum tersedia sebagai telemetry server tepercaya.</li>
                    <li><strong>Data provider:</strong> jangan memasukkan data pribadi siswa pada permintaan provider eksternal.</li>
                </ul>
                <p className="platform-ops-note">
                    Untuk pengelolaan AI terpusat, diperlukan layanan server-side, secret manager, limit per tenant, dan pencatatan usage tanpa prompt atau data pribadi.
                </p>
            </section>

            <nav className="platform-tenants-toolbar" aria-label="Navigasi operasi platform">
                <a className="platform-tenants-button secondary" href="#/platform/tenant/sekolah">Direktori tenant</a>
                <a className="platform-tenants-button secondary" href="#/platform/laporan/penggunaan">Snapshot platform</a>
                <a className="platform-tenants-button secondary" href="#/platform/keamanan/audit">Audit platform</a>
            </nav>

            <p className="platform-ops-note">
                Aktivitas perubahan dicatat menggunakan identitas sesi superadmin oleh backend; nama pemilik tidak ditanam statis pada antarmuka.
            </p>
        </main>
    );
}
