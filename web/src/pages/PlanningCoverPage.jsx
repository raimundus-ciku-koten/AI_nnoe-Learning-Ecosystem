import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import Ikon from '../components/Ikon.jsx';
import { adalahPeranGuru } from '../navigasi.js';
import { muatPengaturanTenant } from '../services/tenantSettings.js';
import { muatPenugasanGuru } from '../services/teacherAssignments.js';
import '../styles/planning-cover.css';

const EMPTY_ASSIGNMENT = { kelas: [], mapel: [] };

export default function PlanningCoverPage() {
    const { user, role, activeRole, tenantId, profile } = useAuth();
    const roleAktif = activeRole || role;
    const guru = adalahPeranGuru(roleAktif);
    const [sekolah, setSekolah] = useState(profile?.sekolah || '');
    const [penugasan, setPenugasan] = useState(EMPTY_ASSIGNMENT);
    const [form, setForm] = useState({
        judul: 'PERANGKAT AJAR',
        mapel: '',
        kelas: '',
        fase: '',
        semester: 'Ganjil',
        tahunAjaran: '',
    });
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');

    useEffect(() => {
        let aktif = true;
        if (!guru || !user?.uid || !tenantId) {
            setLoading(false);
            return () => { aktif = false; };
        }
        Promise.all([
            muatPengaturanTenant(tenantId),
            muatPenugasanGuru(user.uid),
        ]).then(([settings, assignment]) => {
            if (!aktif) return;
            setSekolah(settings.nama || profile?.sekolah || '');
            setPenugasan(assignment);
            setForm((current) => ({
                ...current,
                mapel: current.mapel || assignment.mapel[0] || '',
                kelas: current.kelas || assignment.kelas[0] || '',
                semester: settings.semester || current.semester,
                tahunAjaran: settings.tahunAjaran || current.tahunAjaran,
            }));
        }).catch((cause) => {
            console.error('[planning-cover] Gagal memuat konteks sekolah:', cause);
            if (aktif) setError('Konteks sekolah belum dapat dimuat. Anda tetap dapat mengisi cover secara manual.');
        }).finally(() => { if (aktif) setLoading(false); });
        return () => { aktif = false; };
    }, [guru, profile?.sekolah, tenantId, user?.uid]);

    function ubah(field, value) {
        setForm((current) => ({ ...current, [field]: value }));
    }

    const siapCetak = Boolean(form.judul.trim() && form.mapel.trim() && form.kelas.trim() && form.tahunAjaran.trim());

    if (!guru) {
        return (
            <main className="planning-cover-denied" role="alert">
                <h1>Cover Perangkat</h1>
                <p>Cover perangkat ajar hanya tersedia bagi akun guru.</p>
            </main>
        );
    }

    return (
        <main className="planning-cover-page">
            <header className="planning-cover-header">
                <div>
                    <p className="planning-cover-kicker"><Ikon nama="file" /> Perencanaan Pembelajaran</p>
                    <h1>Cover Perangkat</h1>
                    <p>Siapkan sampul perangkat ajar dari konteks sekolah dan penugasan Anda.</p>
                </div>
                <button type="button" className="planning-cover-print" disabled={!siapCetak} onClick={() => window.print()}>
                    <Ikon nama="print" /> Cetak / Simpan PDF
                </button>
            </header>

            <div className="planning-cover-layout">
                <section className="planning-cover-form no-print" aria-labelledby="cover-form-title">
                    <div className="planning-cover-section-heading">
                        <h2 id="cover-form-title">Data cover</h2>
                        <span>{loading ? 'Memuat…' : 'Pratinjau langsung'}</span>
                    </div>
                    {error && <p className="planning-cover-message" role="status">{error}</p>}
                    <label>
                        Judul perangkat
                        <input maxLength={100} value={form.judul} onChange={(event) => ubah('judul', event.target.value)} />
                    </label>
                    <label>
                        Mata pelajaran
                        {penugasan.mapel.length ? (
                            <select value={form.mapel} onChange={(event) => ubah('mapel', event.target.value)}>
                                <option value="">Pilih mata pelajaran</option>
                                {penugasan.mapel.map((item) => <option key={item} value={item}>{item}</option>)}
                            </select>
                        ) : <input maxLength={80} value={form.mapel} onChange={(event) => ubah('mapel', event.target.value)} />}
                    </label>
                    <div className="planning-cover-form-row">
                        <label>
                            Kelas
                            {penugasan.kelas.length ? (
                                <select value={form.kelas} onChange={(event) => ubah('kelas', event.target.value)}>
                                    <option value="">Pilih kelas</option>
                                    {penugasan.kelas.map((item) => <option key={item} value={item}>{item}</option>)}
                                </select>
                            ) : <input maxLength={30} value={form.kelas} onChange={(event) => ubah('kelas', event.target.value)} />}
                        </label>
                        <label>Fase <input maxLength={4} value={form.fase} onChange={(event) => ubah('fase', event.target.value)} /></label>
                    </div>
                    <div className="planning-cover-form-row">
                        <label>
                            Semester
                            <select value={form.semester} onChange={(event) => ubah('semester', event.target.value)}>
                                <option>Ganjil</option><option>Genap</option>
                            </select>
                        </label>
                        <label>Tahun ajaran <input maxLength={9} value={form.tahunAjaran} onChange={(event) => ubah('tahunAjaran', event.target.value)} /></label>
                    </div>
                    <p className="planning-cover-note">Pratinjau tidak disimpan ke server. Gunakan Cetak / Simpan PDF untuk menghasilkan berkas cover.</p>
                </section>

                <section className="planning-cover-sheet" aria-label="Pratinjau cover perangkat">
                    <div className="planning-cover-sheet-frame">
                        <p className="planning-cover-school">{sekolah || 'NAMA SEKOLAH'}</p>
                        <div className="planning-cover-mark" aria-hidden="true">ALE</div>
                        <p className="planning-cover-label">{form.judul || 'PERANGKAT AJAR'}</p>
                        <h2>{form.mapel || 'MATA PELAJARAN'}</h2>
                        <div className="planning-cover-details">
                            <span>KELAS {form.kelas || '—'}</span>
                            {form.fase && <span>FASE {form.fase}</span>}
                            <span>SEMESTER {form.semester.toUpperCase()}</span>
                            <span>TAHUN AJARAN {form.tahunAjaran || '—'}</span>
                        </div>
                        <div className="planning-cover-author">
                            <span>Disusun oleh</span>
                            <strong>{user?.displayName || 'Nama Guru'}</strong>
                        </div>
                        <p className="planning-cover-footer">AI_nnoe Learning Ecosystem</p>
                    </div>
                </section>
            </div>
        </main>
    );
}