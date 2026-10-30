import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { buatCsvRingkasanUjianSekolah, muatRingkasanUjianSekolah } from '../services/onlineAssessments.js';
import Ikon from '../components/Ikon.jsx';
import '../styles/online-assessments.css';

const VIEWS = {
    ujian: ['Monitoring Ujian', 'Pantau progres ujian tenant secara agregat dan terbatas sesuai peran.'],
    paket: ['Paket Ujian', 'Daftar ujian yang dijadwalkan oleh guru di sekolah Anda.'],
    jadwal: ['Jadwal Ujian', 'Jadwal mulai dan berakhir per paket ujian tenant.'],
    monitoring: ['Monitoring Ujian', 'Pantau progres peserta secara agregat tanpa membuka jawaban atau nama siswa.'],
    analisis: ['Analisis Hasil', 'Ringkasan pengumpulan dan status penilaian uraian di tingkat sekolah.'],
};

function waktu(value) {
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? 'Waktu tidak tersedia'
        : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function AdminAssessmentPage() {
    const { pathname } = useLocation();
    const { role, activeRole, tenantId } = useAuth();
    const roleAktif = activeRole || role;
    const section = pathname.split('/').filter(Boolean).at(-1);
    const [title, description] = VIEWS[section] || VIEWS.monitoring;
    const [exams, setExams] = useState([]);
    const [search, setSearch] = useState('');
    const [status, setStatus] = useState('all');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState('');
    const [reload, setReload] = useState(0);
    const [lastLoaded, setLastLoaded] = useState(null);

    useEffect(() => {
        let active = true;
        if (roleAktif !== 'admin_sekolah' || !tenantId) {
            setLoading(false);
            return () => { active = false; };
        }
        setLoading(true);
        setError('');
        muatRingkasanUjianSekolah()
            .then((rows) => {
                if (!active) return;
                setExams(rows);
                setLastLoaded(new Date());
            })
            .catch((cause) => {
                console.error('[admin-assessment] Gagal memuat ringkasan ujian tenant:', cause);
                if (active) setError('Ringkasan ujian belum tersedia. Pastikan migrasi monitoring admin telah diterapkan pada tenant ini.');
            })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [roleAktif, tenantId, reload]);

    const visible = useMemo(() => {
        const term = search.trim().toLocaleLowerCase('id');
        return exams.filter((exam) => (status === 'all' || exam.status === status)
            && (!term || `${exam.title} ${exam.kelas} ${exam.teacher_name}`.toLocaleLowerCase('id').includes(term)));
    }, [exams, search, status]);
    const totals = useMemo(() => visible.reduce((result, exam) => ({
        packages: result.packages + 1,
        participants: result.participants + exam.participant_count,
        submitted: result.submitted + exam.submitted_count,
        pending: result.pending + exam.pending_review_count,
    }), { packages: 0, participants: 0, submitted: 0, pending: 0 }), [visible]);

    function eksporCsv() {
        const csv = buatCsvRingkasanUjianSekolah(visible);
        const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8' }));
        const link = document.createElement('a');
        link.href = url;
        link.download = `monitoring-ujian-${new Date().toISOString().slice(0, 10)}.csv`;
        document.body.append(link);
        link.click();
        link.remove();
        URL.revokeObjectURL(url);
    }

    if (roleAktif !== 'admin_sekolah') {
        return (
            <section className="ale-exam-card" role="alert">
                <h1>{title}</h1>
                <p>Monitoring ujian sekolah hanya tersedia bagi Admin Sekolah pada tenant aktif.</p>
            </section>
        );
    }

    if (!tenantId) {
        return (
            <section className="ale-exam-card" role="alert">
                <h1>{title}</h1>
                <p>Akun ini belum terhubung ke tenant sekolah.</p>
            </section>
        );
    }

    return (
        <main className="admin-assessment-page">
            <header className="admin-assessment-header">
                <p className="ale-exam-kicker"><Ikon nama="check" /> Manajemen Asesmen · tenant sekolah</p>
                <h1>{title}</h1>
                <p>{description}</p>
            </header>

            <p className="admin-assessment-privacy" role="note">
                Ringkasan hanya berisi metadata ujian dan hitungan agregat. Nama siswa, jawaban, kunci, dan nilai individual tidak ditampilkan. Guru tetap mengelola paket dan penilaian uraian miliknya sendiri.
            </p>

            {error && <p className="ale-exam-error" role="alert">{error}</p>}

            <section className="admin-assessment-stats" aria-label="Ringkasan ujian tenant">
                <article><span>Paket ditampilkan</span><strong>{loading ? '…' : totals.packages}</strong></article>
                <article><span>Roster per paket</span><strong>{loading ? '…' : totals.participants}</strong></article>
                <article><span>Submission</span><strong>{loading ? '…' : totals.submitted}</strong></article>
                <article><span>Uraian menunggu tinjauan</span><strong>{loading ? '…' : totals.pending}</strong></article>
            </section>

            <section className="ale-exam-card admin-assessment-list" aria-labelledby="admin-assessment-list-title">
                <div className="admin-assessment-toolbar">
                    <div>
                        <h2 id="admin-assessment-list-title">Ujian sekolah</h2>
                        <p>{loading ? 'Memuat ringkasan…' : `${visible.length} paket sesuai filter`}</p>
                    </div>
                    <label>
                        <span className="admin-assessment-sr-only">Cari ujian, kelas, atau guru</span>
                        <input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari ujian, kelas, atau guru" />
                    </label>
                    <label>
                        <span className="admin-assessment-sr-only">Filter status</span>
                        <select value={status} onChange={(event) => setStatus(event.target.value)}>
                            <option value="all">Semua status</option>
                            <option value="active">Aktif</option>
                            <option value="closed">Ditutup</option>
                        </select>
                    </label>
                    <div className="ale-exam-link-actions">
                        <button className="ale-exam-secondary" type="button" disabled={loading} onClick={() => setReload((value) => value + 1)}>
                            {loading ? 'Memuat ulang…' : 'Muat ulang'}
                        </button>
                        <button className="ale-exam-primary" type="button" disabled={loading || !visible.length} onClick={eksporCsv}>
                            Ekspor CSV
                        </button>
                    </div>
                </div>

                {loading && <p role="status">Memuat ujian tenant…</p>}
                {lastLoaded && !loading && (
                    <p className="admin-assessment-updated" role="status">
                        Data diperbarui {waktu(lastLoaded.toISOString())}. Ekspor hanya memuat metadata dan hitungan agregat yang sedang ditampilkan.
                    </p>
                )}
                {!loading && !error && !visible.length && (
                    <p className="ale-exam-empty">{exams.length ? 'Tidak ada ujian yang cocok dengan filter.' : 'Belum ada ujian pada tenant ini.'}</p>
                )}
                {visible.length > 0 && (
                    <div className="ale-exam-results-wrap">
                        <table className="ale-exam-results admin-assessment-table">
                            <thead>
                                <tr>
                                    <th scope="col">Paket / kelas</th>
                                    <th scope="col">Guru</th>
                                    <th scope="col">Jadwal</th>
                                    <th scope="col">Peserta</th>
                                    <th scope="col">Submission</th>
                                    <th scope="col">Tinjauan uraian</th>
                                    <th scope="col">Status</th>
                                </tr>
                            </thead>
                            <tbody>
                                {visible.map((exam) => (
                                    <tr key={exam.exam_id}>
                                        <th scope="row">{exam.title}<small>Kelas {exam.kelas}</small></th>
                                        <td>{exam.teacher_name}</td>
                                        <td>{waktu(exam.starts_at)}<small>Selesai {waktu(exam.ends_at)} · {exam.duration_minutes} menit</small></td>
                                        <td>{exam.participant_count}</td>
                                        <td>{exam.submitted_count}/{exam.attempt_count}</td>
                                        <td>{exam.pending_review_count}</td>
                                        <td>{exam.status === 'active' ? 'Aktif' : 'Ditutup'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                )}
            </section>
        </main>
    );
}