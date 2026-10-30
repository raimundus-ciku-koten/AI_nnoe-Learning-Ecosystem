import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import {
    muatAnakTertaut,
    muatNilaiAnak,
    muatPresensiAnak,
} from '../services/guardianPortal.js';
import '../styles/guardian-portal.css';

function tanggal(value, withTime = false) {
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? 'Waktu tidak tersedia'
        : new Intl.DateTimeFormat('id-ID', withTime
            ? { dateStyle: 'medium', timeStyle: 'short' }
            : { dateStyle: 'long' }).format(date);
}

export default function ParentPortalPage() {
    const { role, activeRole } = useAuth();
    const { pathname } = useLocation();
    const roleAktif = activeRole || role;
    const modeNilai = pathname.endsWith('/nilai-kehadiran');
    const [anak, setAnak] = useState([]);
    const [studentId, setStudentId] = useState('');
    const [presensi, setPresensi] = useState([]);
    const [nilai, setNilai] = useState([]);
    const [loadingAnak, setLoadingAnak] = useState(true);
    const [loadingRingkasan, setLoadingRingkasan] = useState(false);
    const [error, setError] = useState('');
    const requestId = useRef(0);

    useEffect(() => {
        let aktif = true;
        if (!['ortu', 'orang_tua'].includes(roleAktif)) {
            setLoadingAnak(false);
            return () => { aktif = false; };
        }
        muatAnakTertaut()
            .then((rows) => {
                if (!aktif) return;
                setAnak(rows);
                setStudentId((current) => rows.some((row) => row.student_id === current)
                    ? current : rows[0]?.student_id || '');
            })
            .catch((cause) => {
                console.error('[parent-portal] Gagal memuat anak tertaut:', cause);
                if (aktif) setError('Data anak belum dapat dimuat. Pastikan relasi keluarga sudah ditautkan sekolah.');
            })
            .finally(() => { if (aktif) setLoadingAnak(false); });
        return () => { aktif = false; };
    }, [roleAktif]);

    useEffect(() => {
        const currentRequest = ++requestId.current;
        if (!studentId || !modeNilai) {
            setPresensi([]);
            setNilai([]);
            setLoadingRingkasan(false);
            return () => { requestId.current += 1; };
        }
        setLoadingRingkasan(true);
        setError('');
        Promise.all([muatPresensiAnak(studentId), muatNilaiAnak(studentId)])
            .then(([attendanceRows, resultRows]) => {
                if (requestId.current !== currentRequest) return;
                setPresensi(attendanceRows);
                setNilai(resultRows);
            })
            .catch((cause) => {
                if (requestId.current !== currentRequest) return;
                console.error('[parent-portal] Gagal memuat presensi/nilai:', cause);
                setError('Nilai dan presensi belum dapat dimuat. Muat ulang halaman atau hubungi sekolah.');
            })
            .finally(() => {
                if (requestId.current === currentRequest) setLoadingRingkasan(false);
            });
        return () => { requestId.current += 1; };
    }, [modeNilai, studentId]);

    const siswaTerpilih = useMemo(() => anak.find((row) => row.student_id === studentId), [anak, studentId]);

    if (!['ortu', 'orang_tua'].includes(roleAktif)) {
        return <section className="guardian-card" role="alert"><h1>Portal orang tua</h1><p>Halaman ini hanya tersedia untuk akun orang tua.</p></section>;
    }

    return (
        <main className="guardian-page" aria-labelledby="parent-portal-title">
            <header className="guardian-header">
                <p>Ruang keluarga · data tertaut</p>
                <h1 id="parent-portal-title">{modeNilai ? 'Nilai dan kehadiran' : 'Ringkasan anak'}</h1>
                <span>Informasi hanya berasal dari siswa yang ditautkan secara resmi oleh sekolah.</span>
            </header>
            <nav className="guardian-tabs" aria-label="Portal orang tua">
                <a href="#/orang-tua/anak" aria-current={!modeNilai ? 'page' : undefined}>Ringkasan anak</a>
                <a href="#/orang-tua/nilai-kehadiran" aria-current={modeNilai ? 'page' : undefined}>Nilai dan kehadiran</a>
            </nav>

            {error && <p className="guardian-message is-error" role="alert">{error}</p>}
            {loadingAnak ? <p className="guardian-empty" role="status">Memuat data tertaut…</p> : null}
            {!loadingAnak && !error && !anak.length && (
                <section className="guardian-card guardian-empty-state">
                    <h2>Belum ada siswa tertaut</h2>
                    <p>Minta admin sekolah menautkan akun orang tua ini ke roster siswa yang benar.</p>
                </section>
            )}
            {!loadingAnak && anak.length > 0 && (
                <>
                    {anak.length > 1 && (
                        <label className="guardian-child-select">Pilih anak
                            <select value={studentId} onChange={(event) => setStudentId(event.target.value)}>
                                {anak.map((row) => <option key={row.student_id} value={row.student_id}>{row.nama} · {row.kelas}</option>)}
                            </select>
                        </label>
                    )}
                    {siswaTerpilih && !modeNilai && (
                        <section className="guardian-card guardian-child-card" aria-labelledby="guardian-child-name">
                            <p>Profil siswa tertaut</p>
                            <h2 id="guardian-child-name">{siswaTerpilih.nama}</h2>
                            <dl><div><dt>Kelas</dt><dd>{siswaTerpilih.kelas}</dd></div><div><dt>Hubungan</dt><dd>{siswaTerpilih.relationship}</dd></div></dl>
                            <a className="guardian-button" href="#/orang-tua/nilai-kehadiran">Lihat nilai dan kehadiran</a>
                        </section>
                    )}
                    {modeNilai && (
                        <>
                            <section className="guardian-card" aria-labelledby="guardian-attendance-title">
                                <div className="guardian-section-heading"><div><p>{siswaTerpilih?.nama} · {siswaTerpilih?.kelas}</p><h2 id="guardian-attendance-title">Catatan kehadiran</h2></div></div>
                                <p className="guardian-footnote">Daftar ini memuat presensi hadir yang tercatat melalui scan. Tidak adanya catatan bukan berarti siswa tercatat alfa.</p>
                                {loadingRingkasan ? <p role="status" className="guardian-empty">Memuat presensi…</p>
                                    : presensi.length ? <ul className="guardian-record-list">{presensi.map((row) => (
                                        <li key={`${row.tanggal}:${row.waktu}`}><span><strong>Hadir</strong><small>{tanggal(row.waktu, true)}</small></span><time>{tanggal(row.tanggal)}</time></li>
                                    ))}</ul> : <p className="guardian-empty">Belum ada catatan hadir hasil scan.</p>}
                            </section>
                            <section className="guardian-card" aria-labelledby="guardian-results-title">
                                <div className="guardian-section-heading"><div><p>Hasil yang telah dipublikasikan</p><h2 id="guardian-results-title">Nilai ujian</h2></div></div>
                                {loadingRingkasan ? <p role="status" className="guardian-empty">Memuat nilai…</p>
                                    : nilai.length ? <ul className="guardian-record-list">{nilai.map((row) => (
                                        <li key={row.exam_id}><span><strong>{row.title}</strong><small>Kelas {row.kelas} · {tanggal(row.submitted_at, true)}</small></span>
                                            <b>{row.grade_pending ? 'Menunggu penilaian' : row.score == null ? 'Belum tersedia' : `${new Intl.NumberFormat('id-ID', { maximumFractionDigits: 2 }).format(Number(row.score))}`}</b>
                                        </li>
                                    ))}</ul> : <p className="guardian-empty">Belum ada nilai ujian yang dipublikasikan.</p>}
                            </section>
                        </>
                    )}
                </>
            )}
        </main>
    );
}