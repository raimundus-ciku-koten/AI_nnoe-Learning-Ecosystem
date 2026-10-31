import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { muatGuruTenant, simpanPenugasanGuru } from '../services/teacherAssignments.js';
import '../styles/admin-users.css';

const LABEL_ROLE = {
    guru: 'Guru',
    guru_bk: 'Guru BK',
    guru_kokurikuler: 'Guru kokurikuler',
    guru_ekstrakurikuler: 'Guru ekstrakurikuler',
};

function parseList(value) {
    return value.split(/[\n,;]+/).map((item) => item.trim()).filter(Boolean);
}

export default function AdminAcademicPage() {
    const { pathname, search } = useLocation();
    const { role, activeRole, tenantId } = useAuth();
    const roleAktif = activeRole || role;
    const jenis = pathname.endsWith('/mapel') ? 'mapel' : 'kelas';
    const label = jenis === 'mapel' ? 'Mata Pelajaran' : 'Kelas dan Rombel';
    const [guru, setGuru] = useState([]);
    const [guruId, setGuruId] = useState('');
    const [draft, setDraft] = useState('');
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const guruDipilih = useMemo(() => guru.find((item) => item.uid === guruId), [guru, guruId]);

    useEffect(() => {
        let aktif = true;
        if (roleAktif !== 'admin_sekolah' || !tenantId) {
            setLoading(false);
            return () => { aktif = false; };
        }
        setLoading(true);
        setError('');
        muatGuruTenant(tenantId)
            .then((rows) => {
                if (!aktif) return;
                setGuru(rows);
                const requestedId = new URLSearchParams(search).get('guru');
                setGuruId(rows.some((item) => item.uid === requestedId)
                    ? requestedId
                    : rows[0]?.uid || '');
            })
            .catch((cause) => {
                console.error('[admin-akademik] Gagal memuat guru tenant:', cause);
                if (aktif) setError('Daftar guru belum dapat dimuat. Periksa akses tenant dan coba lagi.');
            })
            .finally(() => { if (aktif) setLoading(false); });
        return () => { aktif = false; };
    }, [roleAktif, search, tenantId]);

    useEffect(() => {
        setDraft(guruDipilih?.[jenis]?.join('\n') || '');
        setNotice('');
        setError('');
    }, [guruDipilih?.uid, jenis]);

    async function simpan(event) {
        event.preventDefault();
        if (!guruDipilih || saving) return;
        setSaving(true);
        setError('');
        setNotice('');
        try {
            const current = jenis === 'mapel' ? guruDipilih.kelas : guruDipilih.mapel;
            const values = parseList(draft);
            const result = await simpanPenugasanGuru({
                userId: guruDipilih.uid,
                mapel: jenis === 'mapel' ? values : current,
                kelas: jenis === 'kelas' ? values : current,
            });
            setGuru((rows) => rows.map((item) => item.uid === guruDipilih.uid
                ? {
                    ...item, mapel: result.mapel_ids || (jenis === 'mapel' ? values : current),
                    kelas: result.kelas_ids || (jenis === 'kelas' ? values : current)
                }
                : item));
            setNotice(`${label} berhasil disimpan untuk ${guruDipilih.nama}.`);
        } catch (cause) {
            console.error('[admin-akademik] Gagal menyimpan penugasan guru:', cause);
            setError(cause?.code === '42501'
                ? 'Perubahan ditolak. Pastikan guru aktif berada di sekolah Anda dan akun admin berwenang.'
                : cause?.message || 'Penugasan tidak dapat disimpan. Coba lagi.');
        } finally {
            setSaving(false);
        }
    }

    if (roleAktif !== 'admin_sekolah') {
        return (
            <section className="ale-admin-users-card" role="alert">
                <h1>Manajemen akademik</h1>
                <p>Pengelolaan penugasan guru hanya tersedia bagi admin sekolah pada tenant aktif.</p>
            </section>
        );
    }

    if (!tenantId) {
        return (
            <section className="ale-admin-users-card" role="alert">
                <h1>Tenant sekolah belum tersedia</h1>
                <p>Sesi akun tidak memiliki identitas tenant. Hubungi administrator platform.</p>
            </section>
        );
    }

    return (
        <main className="ale-admin-users">
            <header className="ale-admin-users-heading">
                <p className="ale-admin-users-kicker">Manajemen Akademik · tenant sekolah</p>
                <h1>{label}</h1>
                <p>Atur penugasan guru aktif pada sekolah Anda. Perubahan memperbarui izin akses kelas dan mata pelajaran setelah token sesi diperbarui.</p>
            </header>

            <section className="ale-admin-users-card" aria-labelledby="academic-assignment-title">
                <div className="ale-admin-users-toolbar">
                    <div>
                        <h2 id="academic-assignment-title">Penugasan guru</h2>
                        <p>{guru.length} guru aktif ditemukan pada tenant ini.</p>
                    </div>
                    <a className="ale-admin-users-button secondary" href="#/admin/pengguna/guru">Direktori Guru</a>
                </div>

                {error && <p className="ale-admin-users-error" role="alert">{error}</p>}
                {notice && <p className="ale-admin-users-notice" role="status">{notice}</p>}
                {loading ? <p className="ale-admin-users-empty" role="status">Memuat guru aktif…</p> : null}
                {!loading && !error && !guru.length ? (
                    <p className="ale-admin-users-empty">Belum ada guru aktif yang dapat diberi penugasan.</p>
                ) : null}

                {!loading && guru.length > 0 && (
                    <form className="ale-platform-user-form" onSubmit={simpan}>
                        <label className="academic-assignment-teacher">
                            Guru
                            <select value={guruId} onChange={(event) => setGuruId(event.target.value)} disabled={saving}>
                                {guru.map((item) => (
                                    <option key={item.uid} value={item.uid}>
                                        {item.nama}{item.email ? ` · ${item.email}` : ''} · {LABEL_ROLE[item.role] || 'Guru'}
                                    </option>
                                ))}
                            </select>
                        </label>
                        <label className="academic-assignment-values">
                            {label}
                            <textarea
                                rows={7}
                                value={draft}
                                onChange={(event) => setDraft(event.target.value)}
                                disabled={saving}
                                placeholder={jenis === 'mapel' ? 'Matematika\nBahasa Indonesia' : 'X-A\nX-B'}
                                aria-describedby="academic-assignment-help"
                            />
                        </label>
                        <p className="ale-admin-users-note academic-assignment-help" id="academic-assignment-help">
                            Tulis satu item per baris. Maksimal 30 item, masing-masing 120 karakter. Perubahan dicatat di audit tenant dan tidak mengubah peran pengguna.
                        </p>
                        <div className="ale-platform-user-form-actions">
                            <button className="ale-admin-users-button" type="submit" disabled={saving || !guruDipilih}>
                                {saving ? 'Menyimpan…' : `Simpan ${jenis === 'mapel' ? 'Mata Pelajaran' : 'Kelas'}`}
                            </button>
                        </div>
                    </form>
                )}
            </section>
        </main>
    );
}