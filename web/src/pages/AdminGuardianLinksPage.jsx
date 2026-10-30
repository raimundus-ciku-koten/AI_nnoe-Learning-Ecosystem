import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import {
    lepasTautanWali,
    muatAkunWaliTenant,
    muatSiswaTenantUntukWali,
    muatTautanWaliTenant,
    tautkanWali,
} from '../services/guardianPortal.js';
import '../styles/guardian-portal.css';

const LABEL_RELASI = { ibu: 'Ibu', ayah: 'Ayah', wali: 'Wali' };

export default function AdminGuardianLinksPage() {
    const { role, activeRole, tenantId } = useAuth();
    const roleAktif = activeRole || role;
    const canManage = roleAktif === 'admin_sekolah' && Boolean(tenantId);
    const [accounts, setAccounts] = useState([]);
    const [students, setStudents] = useState([]);
    const [links, setLinks] = useState([]);
    const [guardianId, setGuardianId] = useState('');
    const [studentId, setStudentId] = useState('');
    const [relationship, setRelationship] = useState('wali');
    const [search, setSearch] = useState('');
    const [loading, setLoading] = useState(true);
    const [busy, setBusy] = useState(false);
    const [error, setError] = useState('');
    const [notice, setNotice] = useState('');

    const refresh = useCallback(async () => {
        if (!canManage) {
            setLoading(false);
            return;
        }
        setLoading(true);
        setError('');
        try {
            const [guardianRows, studentRows, linkRows] = await Promise.all([
                muatAkunWaliTenant(), muatSiswaTenantUntukWali(), muatTautanWaliTenant(),
            ]);
            setAccounts(guardianRows);
            setStudents(studentRows);
            setLinks(linkRows);
            setGuardianId((current) => guardianRows.some((row) => row.user_id === current)
                ? current : guardianRows[0]?.user_id || '');
            setStudentId((current) => studentRows.some((row) => row.student_id === current)
                ? current : studentRows[0]?.student_id || '');
        } catch (cause) {
            console.error('[guardian-links] Gagal memuat relasi orang tua:', cause);
            setError(cause?.code === '42501'
                ? 'Akses pengelolaan relasi orang tua ditolak untuk tenant ini.'
                : 'Data orang tua dan siswa belum dapat dimuat. Pastikan migrasi portal wali telah diterapkan.');
        } finally {
            setLoading(false);
        }
    }, [canManage]);

    useEffect(() => { void refresh(); }, [refresh]);

    const visibleLinks = useMemo(() => {
        const term = search.trim().toLocaleLowerCase('id');
        return links.filter((link) => !term ||
            `${link.student_nama} ${link.kelas} ${link.guardian_nama} ${link.guardian_email}`
                .toLocaleLowerCase('id').includes(term));
    }, [links, search]);

    async function submit(event) {
        event.preventDefault();
        if (!guardianId || !studentId || busy) return;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            await tautkanWali(studentId, guardianId, relationship);
            setNotice('Orang tua berhasil ditautkan. Perubahan tercatat pada audit sekolah.');
            await refresh();
        } catch (cause) {
            console.error('[guardian-links] Gagal menautkan orang tua:', cause);
            setError(cause?.code === '23505'
                ? 'Akun orang tua ini sudah tertaut ke siswa tersebut.'
                : cause?.message || 'Tautan tidak dapat disimpan. Periksa tenant dan status akun.');
        } finally {
            setBusy(false);
        }
    }

    async function unlink(link) {
        if (busy || !window.confirm(`Lepaskan ${link.guardian_nama} dari ${link.student_nama}?`)) return;
        setBusy(true);
        setError('');
        setNotice('');
        try {
            await lepasTautanWali(link.student_id, link.guardian_user_id);
            setNotice('Tautan dilepas dan perubahan tercatat pada audit sekolah.');
            await refresh();
        } catch (cause) {
            console.error('[guardian-links] Gagal melepas orang tua:', cause);
            setError(cause?.message || 'Tautan tidak dapat dilepas. Coba muat ulang.');
        } finally {
            setBusy(false);
        }
    }

    if (!canManage) {
        return <section className="guardian-card" role="alert"><h1>Akses dibatasi</h1><p>Pengelolaan relasi keluarga hanya tersedia bagi admin sekolah pada tenant aktif.</p></section>;
    }

    return (
        <main className="guardian-page" aria-labelledby="guardian-admin-title">
            <header className="guardian-header">
                <p>Manajemen pengguna · tenant sekolah</p>
                <h1 id="guardian-admin-title">Tautkan orang tua ke siswa</h1>
                <span>Relasi hanya berlaku pada sekolah ini. Orang tua dapat membaca ringkasan siswa, catatan hadir hasil scan, dan nilai ujian akhir.</span>
            </header>

            <section className="guardian-card" aria-labelledby="guardian-form-title">
                <div className="guardian-section-heading">
                    <div><p>Relasi baru</p><h2 id="guardian-form-title">Pilih akun dan siswa</h2></div>
                </div>
                {error && <p className="guardian-message is-error" role="alert">{error}</p>}
                {notice && <p className="guardian-message is-notice" role="status">{notice}</p>}
                {loading ? <p className="guardian-empty" role="status">Memuat roster dan akun orang tua…</p> : (
                    <form className="guardian-form" onSubmit={submit}>
                        <label>Akun orang tua
                            <select value={guardianId} onChange={(event) => setGuardianId(event.target.value)} disabled={busy || !accounts.length} required>
                                {accounts.map((account) => <option key={account.user_id} value={account.user_id}>{account.nama}{account.email ? ` · ${account.email}` : ''}</option>)}
                            </select>
                        </label>
                        <label>Siswa
                            <select value={studentId} onChange={(event) => setStudentId(event.target.value)} disabled={busy || !students.length} required>
                                {students.map((student) => <option key={student.student_id} value={student.student_id}>{student.nama} · {student.kelas}</option>)}
                            </select>
                        </label>
                        <label>Hubungan
                            <select value={relationship} onChange={(event) => setRelationship(event.target.value)} disabled={busy}>
                                <option value="ibu">Ibu</option><option value="ayah">Ayah</option><option value="wali">Wali</option>
                            </select>
                        </label>
                        <button type="submit" disabled={busy || !accounts.length || !students.length}>
                            {busy ? 'Menyimpan…' : 'Simpan tautan'}
                        </button>
                        {!accounts.length && <p className="guardian-empty">Belum ada akun orang tua aktif di tenant ini.</p>}
                        {!students.length && <p className="guardian-empty">Belum ada siswa pada roster tenant ini.</p>}
                    </form>
                )}
            </section>

            <section className="guardian-card" aria-labelledby="guardian-links-title">
                <div className="guardian-section-heading guardian-links-toolbar">
                    <div><p>Relasi aktif</p><h2 id="guardian-links-title">Orang tua tertaut</h2></div>
                    <label className="guardian-search">Cari nama atau kelas
                        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ketik nama atau kelas" />
                    </label>
                    <button type="button" className="guardian-button is-secondary" onClick={() => void refresh()} disabled={loading || busy}>Muat ulang</button>
                </div>
                {loading ? <p className="guardian-empty" role="status">Memuat tautan…</p> : !visibleLinks.length ? (
                    <p className="guardian-empty">{links.length ? 'Tidak ada relasi yang cocok dengan pencarian.' : 'Belum ada relasi orang tua yang tercatat.'}</p>
                ) : (
                    <div className="guardian-table-wrap">
                        <table className="guardian-table">
                            <thead><tr><th scope="col">Siswa</th><th scope="col">Orang tua</th><th scope="col">Hubungan</th><th scope="col">Aksi</th></tr></thead>
                            <tbody>{visibleLinks.map((link) => (
                                <tr key={`${link.student_id}:${link.guardian_user_id}`}>
                                    <th scope="row">{link.student_nama}<small>{link.kelas}</small></th>
                                    <td>{link.guardian_nama}<small>{link.guardian_email}</small></td>
                                    <td>{LABEL_RELASI[link.relationship]}</td>
                                    <td><button type="button" className="guardian-button is-danger" onClick={() => void unlink(link)} disabled={busy}>Lepaskan</button></td>
                                </tr>
                            ))}</tbody>
                        </table>
                    </div>
                )}
                <p className="guardian-footnote">Akun dan siswa harus aktif pada tenant yang sama. Tautan dan pelepasan dicatat dalam audit backend.</p>
            </section>
        </main>
    );
}