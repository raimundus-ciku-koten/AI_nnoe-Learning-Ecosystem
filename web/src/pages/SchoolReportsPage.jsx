import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { buatCsv, csvEscape, unduhBerkas } from '../lib/berkas.js';
import { muatRingkasanUjianSekolah } from '../services/onlineAssessments.js';
import { muatLaporanKehadiranSekolah } from '../services/schoolReporting.js';
import '../styles/school-reports.css';

const LABEL = {
    akademik: ['Laporan Akademik', 'Ringkasan kehadiran scan dan aktivitas ujian yang tersedia pada tenant.'],
    kinerja: ['Laporan Kinerja', 'Indikator aktivitas asesmen yang tercatat, bukan penilaian mutu mengajar.'],
    ekspor: ['Ekspor Laporan', 'Unduh ringkasan tenant yang sedang ditampilkan dalam CSV.'],
};

const waktu = (value) => {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Waktu tidak tersedia'
        : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
};

export default function SchoolReportsPage() {
    const { pathname } = useLocation();
    const { role, activeRole, tenantId } = useAuth();
    const roleAktif = activeRole || role;
    const sub = pathname.split('/').filter(Boolean).at(-1);
    const [title, description] = LABEL[sub] || LABEL.akademik;
    const [attendance, setAttendance] = useState([]);
    const [exams, setExams] = useState([]);
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
        Promise.all([muatLaporanKehadiranSekolah(), muatRingkasanUjianSekolah()])
            .then(([attendanceRows, examRows]) => {
                if (!active) return;
                setAttendance(attendanceRows);
                setExams(examRows);
            })
            .catch((cause) => {
                console.error('[school-reports] Gagal memuat laporan tenant:', cause);
                if (active) setError('Laporan belum tersedia. Pastikan migrasi kehadiran dan ringkasan ujian sudah diterapkan pada tenant.');
            })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [roleAktif, tenantId]);

    const attendanceTotal = useMemo(() => attendance.reduce((sum, row) => sum + row.hadir_scan, 0), [attendance]);
    const examTotals = useMemo(() => exams.reduce((total, exam) => ({
        packages: total.packages + 1,
        submissions: total.submissions + exam.submitted_count,
        participants: total.participants + exam.participant_count,
    }), { packages: 0, submissions: 0, participants: 0 }), [exams]);

    function eksporCsv() {
        const rows = [
            ['jenis', 'tanggal', 'kelas_atau_paket', 'guru', 'jumlah_hadir_scan', 'peserta', 'submission', 'status'],
            ...attendance.map((row) => ['Kehadiran scan', row.tanggal, row.kelas, '', row.hadir_scan, '', '', '']),
            ...exams.map((exam) => ['Aktivitas ujian', exam.starts_at, `${exam.title} · ${exam.kelas}`,
                exam.teacher_name, '', exam.participant_count, exam.submitted_count, exam.status]),
        ];
        const csv = buatCsv(rows.map((row) => row.map((cell) => csvEscape(cell))));
        unduhBerkas(`laporan-sekolah-${new Date().toISOString().slice(0, 10)}.csv`, csv, 'text/csv');
    }

    if (roleAktif !== 'admin_sekolah') {
        return <section className="school-report-card" role="alert"><h1>{title}</h1><p>Laporan tenant hanya tersedia bagi admin sekolah.</p></section>;
    }
    if (!tenantId) {
        return <section className="school-report-card" role="alert"><h1>{title}</h1><p>Akun ini belum terhubung ke tenant.</p></section>;
    }

    return (
        <main className="school-reports" aria-labelledby="school-reports-title">
            <header className="school-reports-header">
                <p>Laporan sekolah · data tenant</p>
                <h1 id="school-reports-title">{title}</h1>
                <span>{description}</span>
            </header>
            <p className="school-report-note" role="note">
                Kehadiran di bawah hanya menghitung catatan hadir hasil scan; ketiadaan catatan bukan status alfa. Aktivitas ujian hanya metadata agregat dan tidak menampilkan identitas siswa atau jawaban.
            </p>
            {error && <p className="school-report-error" role="alert">{error}</p>}
            {loading ? <p className="school-report-empty" role="status">Memuat laporan tenant…</p> : (
                <>
                    {sub === 'ekspor' && <button className="school-report-button" type="button" onClick={eksporCsv}>Unduh CSV</button>}
                    <section className="school-report-stats" aria-label="Ringkasan akademik tenant">
                        <article><span>Catatan hadir scan (90 hari)</span><strong>{attendanceTotal.toLocaleString('id-ID')}</strong></article>
                        <article><span>Paket ujian</span><strong>{examTotals.packages.toLocaleString('id-ID')}</strong></article>
                        <article><span>Peserta ujian</span><strong>{examTotals.participants.toLocaleString('id-ID')}</strong></article>
                        <article><span>Submission</span><strong>{examTotals.submissions.toLocaleString('id-ID')}</strong></article>
                    </section>
                    <section className="school-report-card" aria-labelledby="school-attendance-report-title">
                        <div className="school-report-section-title"><div><p>90 hari terakhir</p><h2 id="school-attendance-report-title">Kehadiran hasil scan</h2></div></div>
                        {!attendance.length ? <p className="school-report-empty">Belum ada catatan hadir hasil scan dalam periode ini.</p> : (
                            <div className="school-report-table-wrap"><table className="school-report-table">
                                <thead><tr><th scope="col">Tanggal</th><th scope="col">Kelas</th><th scope="col">Catatan hadir scan</th></tr></thead>
                                <tbody>{attendance.map((row) => <tr key={`${row.tanggal}:${row.kelas}`}>
                                    <td>{new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeZone: 'UTC' }).format(new Date(`${row.tanggal}T00:00:00Z`))}</td>
                                    <th scope="row">{row.kelas}</th><td>{row.hadir_scan.toLocaleString('id-ID')}</td>
                                </tr>)}</tbody>
                            </table></div>
                        )}
                    </section>
                    <section className="school-report-card" aria-labelledby="school-exam-report-title">
                        <div className="school-report-section-title"><div><p>Data ujian tenant</p><h2 id="school-exam-report-title">Aktivitas asesmen</h2></div></div>
                        {!exams.length ? <p className="school-report-empty">Belum ada ringkasan ujian tenant.</p> : (
                            <div className="school-report-table-wrap"><table className="school-report-table">
                                <thead><tr><th scope="col">Paket / kelas</th><th scope="col">Guru</th><th scope="col">Jadwal</th><th scope="col">Peserta</th><th scope="col">Submission</th><th scope="col">Status</th></tr></thead>
                                <tbody>{exams.map((exam) => <tr key={exam.exam_id}>
                                    <th scope="row">{exam.title}<small>{exam.kelas}</small></th><td>{exam.teacher_name}</td>
                                    <td>{waktu(exam.starts_at)}</td><td>{exam.participant_count}</td>
                                    <td>{exam.submitted_count}/{exam.attempt_count}</td><td>{exam.status === 'active' ? 'Aktif' : 'Ditutup'}</td>
                                </tr>)}</tbody>
                            </table></div>
                        )}
                    </section>
                    {sub === 'kinerja' && <p className="school-report-note" role="note">Laporan ini hanya menggambarkan aktivitas asesmen yang tercatat; bukan evaluasi kinerja atau mutu mengajar guru.</p>}
                </>
            )}
        </main>
    );
}