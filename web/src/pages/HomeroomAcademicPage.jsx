import React, { useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { muatLegerUjianWali } from '../services/onlineAssessments.js';
import ReportCardPage from './ReportCardPage.jsx';
import './role-workspaces.css';

const STATUS = {
    not_scheduled: 'Belum ada ujian',
    not_started: 'Belum dikerjakan',
    in_progress: 'Sedang dikerjakan',
    submitted: 'Dikumpulkan',
};

function formatTanggal(value) {
    if (!value) return 'Belum dijadwalkan';
    const date = new Date(value);
    return Number.isNaN(date.getTime())
        ? 'Tanggal tidak tersedia'
        : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(date);
}

export default function HomeroomAcademicPage() {
    const location = useLocation();
    const isReport = location.pathname === '/wali-kelas/rapor';
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(!isReport);
    const [error, setError] = useState('');
    const [search, setSearch] = useState('');
    const [reloadCount, setReloadCount] = useState(0);

    useEffect(() => {
        if (isReport) return undefined;
        let active = true;
        setLoading(true);
        setError('');
        muatLegerUjianWali()
            .then((data) => { if (active) setRows(data); })
            .catch((cause) => { if (active) setError(cause.message || 'Leger belum dapat dimuat.'); })
            .finally(() => { if (active) setLoading(false); });
        return () => { active = false; };
    }, [isReport, reloadCount]);

    const filteredRows = useMemo(() => {
        const query = search.trim().toLocaleLowerCase('id-ID');
        if (!query) return rows;
        return rows.filter((row) => [row.studentName, row.kelas, row.examTitle]
            .some((value) => String(value || '').toLocaleLowerCase('id-ID').includes(query)));
    }, [rows, search]);

    const summary = useMemo(() => ({
        students: new Set(rows.map((row) => row.studentId)).size,
        submitted: rows.filter((row) => row.status === 'submitted').length,
        pending: rows.filter((row) => row.gradePending).length,
    }), [rows]);

    return (
        <div className="role-workspace">
            <header className="role-workspace__heading">
                <div>
                    <p className="role-workspace__eyebrow">Wali kelas · Akademik</p>
                    <h1>Leger nilai dan rapor</h1>
                    <p>Data ujian ditampilkan dari ruang kelas yang ditugaskan kepada akun Anda.</p>
                </div>
            </header>

            <nav className="role-workspace__tabs" aria-label="Akademik wali kelas">
                <Link className={!isReport ? 'is-active' : ''} aria-current={!isReport ? 'page' : undefined} to="/wali-kelas/leger">Leger nilai ujian</Link>
                <Link className={isReport ? 'is-active' : ''} aria-current={isReport ? 'page' : undefined} to="/wali-kelas/rapor">Rapor kelas</Link>
            </nav>

            {isReport ? <ReportCardPage /> : (
                <>
                    <section className="role-workspace__notice" role="note">
                        <strong>Leger ujian</strong>
                        <span>Nilai tertunda tidak ditampilkan sampai pemeriksaan jawaban selesai. Nilai ini belum mencakup mata pelajaran non-ujian.</span>
                    </section>

                    <section className="role-workspace__metrics" aria-label="Ringkasan leger">
                        <div><span>Peserta didik</span><strong>{loading ? '…' : summary.students}</strong></div>
                        <div><span>Ujian dikumpulkan</span><strong>{loading ? '…' : summary.submitted}</strong></div>
                        <div><span>Nilai menunggu pemeriksaan</span><strong>{loading ? '…' : summary.pending}</strong></div>
                    </section>

                    <section className="role-workspace__panel">
                        <div className="role-workspace__panel-head">
                            <div>
                                <h2>Hasil ujian per peserta didik</h2>
                                <p>Gunakan nama, kelas, atau judul ujian untuk menyaring daftar.</p>
                            </div>
                            <label className="role-workspace__search">
                                <span className="sr-only">Cari leger</span>
                                <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari peserta atau ujian" />
                            </label>
                        </div>

                        {loading && <p className="role-workspace__state" role="status">Memuat leger dari server…</p>}
                        {!loading && error && (
                            <div className="role-workspace__state role-workspace__state--error" role="alert">
                                <p>{error}</p>
                                <button type="button" onClick={() => setReloadCount((count) => count + 1)}>Coba muat ulang</button>
                            </div>
                        )}
                        {!loading && !error && filteredRows.length === 0 && (
                            <p className="role-workspace__state">{rows.length ? 'Tidak ada hasil yang cocok.' : 'Belum ada data ujian untuk kelas yang ditugaskan.'}</p>
                        )}
                        {!loading && !error && filteredRows.length > 0 && (
                            <div className="role-workspace__table-wrap">
                                <table className="role-workspace__table">
                                    <thead><tr>
                                        <th scope="col">Peserta didik</th><th scope="col">Kelas</th><th scope="col">Ujian</th>
                                        <th scope="col">Status</th><th scope="col">Nilai ujian</th>
                                    </tr></thead>
                                    <tbody>{filteredRows.map((row) => (
                                        <tr key={`${row.studentId}-${row.examId || 'none'}`}>
                                            <td data-label="Peserta didik">{row.studentName}</td>
                                            <td data-label="Kelas">{row.kelas}</td>
                                            <td data-label="Ujian">
                                                <strong>{row.examTitle || 'Belum ada ujian'}</strong>
                                                <small>{formatTanggal(row.startsAt)}</small>
                                            </td>
                                            <td data-label="Status"><span className={`role-workspace__status role-workspace__status--${row.status}`}>{STATUS[row.status]}</span></td>
                                            <td data-label="Nilai ujian">
                                                {row.gradePending ? <span>Menunggu pemeriksaan</span>
                                                    : row.score !== null ? <strong>{row.score}</strong>
                                                        : row.objectiveTotal > 0 ? `${row.objectiveCorrect}/${row.objectiveTotal} benar` : 'Belum tersedia'}
                                            </td>
                                        </tr>
                                    ))}</tbody>
                                </table>
                            </div>
                        )}
                    </section>
                </>
            )}
        </div>
    );
}