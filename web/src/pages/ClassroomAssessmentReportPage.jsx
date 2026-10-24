import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { buatCsv, csvEscape, unduhBerkas } from '../lib/berkas.js';
import {
  PERAN_GURU_KELAS,
  muatDaftarRuangKelas,
  muatHasilKuisGuru,
  muatKuisRuangKelas,
  muatPengumpulanTugas,
  muatTugasRuangKelas,
} from '../services/learningClassrooms.js';
import {
  buatBarisAnalisisPenilaian,
  ringkasAnalisisPenilaian,
  ringkasPenilaianPerAktivitas,
} from '../services/classroomAssessmentReport.js';
import '../styles/classroom-assessment-report.css';

function formatTanggal(value) {
  if (!value) return '—';
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' })
    .format(new Date(value));
}

function formatNilai(value) {
  return value === null ? 'Belum dinilai' : `${value}`;
}

export default function ClassroomAssessmentReportPage() {
  const { user, role, activeRole, tenantId } = useAuth();
  const location = useLocation();
  const currentRole = activeRole || role;
  const isTeacher = PERAN_GURU_KELAS.includes(currentRole);
  const isReportRoute = location.pathname === '/laporan/penilaian';
  const [classes, setClasses] = useState([]);
  const [rows, setRows] = useState([]);
  const [classFilter, setClassFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!isTeacher || !user?.uid || !tenantId) {
      setClasses([]);
      setRows([]);
      setError('Analisis penilaian hanya tersedia bagi guru dengan sekolah aktif.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const availableClasses = await muatDaftarRuangKelas(tenantId);
      const reports = await Promise.all(availableClasses.map(async (room) => {
        const [assignments, quizzes, submissions, quizResults] = await Promise.all([
          muatTugasRuangKelas(room.id, tenantId),
          muatKuisRuangKelas(room.id, tenantId),
          muatPengumpulanTugas(room.id, currentRole),
          muatHasilKuisGuru(room.id),
        ]);
        return { room, assignments, submissions, quizzes, quizResults };
      }));
      setClasses(availableClasses);
      setRows(buatBarisAnalisisPenilaian(reports));
    } catch (cause) {
      console.error('[assessment-report] Gagal memuat analisis penilaian:', cause);
      setError(cause instanceof Error
        ? cause.message
        : 'Analisis penilaian gagal dimuat. Periksa koneksi dan izin kelas.');
    } finally {
      setLoading(false);
    }
  }, [currentRole, isTeacher, tenantId, user?.uid]);

  useEffect(() => {
    void load();
  }, [load]);

  const visibleRows = useMemo(() => {
    const term = search.trim().toLocaleLowerCase('id-ID');
    return rows.filter((row) =>
      (classFilter === 'all' || row.classroomId === classFilter) &&
      (typeFilter === 'all' || row.activityType === typeFilter) &&
      (!term || [row.studentName, row.activityName, row.classroomName, row.subject]
        .some((value) => value.toLocaleLowerCase('id-ID').includes(term))));
  }, [classFilter, rows, search, typeFilter]);
  const summary = useMemo(() => ringkasAnalisisPenilaian(visibleRows), [visibleRows]);
  const activities = useMemo(() => ringkasPenilaianPerAktivitas(visibleRows), [visibleRows]);

  function exportCsv() {
    const header = [
      'Kelas', 'Mata pelajaran', 'Jenis', 'Aktivitas', 'Nama siswa',
      'Nilai', 'Status', 'Waktu pengumpulan', 'Umpan balik',
    ];
    const data = visibleRows.map((row) => [
      row.classroomName,
      row.subject,
      row.activityType,
      row.activityName,
      row.studentName,
      row.score ?? '',
      row.score === null ? 'Menunggu penilaian' : 'Dinilai',
      formatTanggal(row.submittedAt),
      row.feedback,
    ]);
    unduhBerkas(
      'laporan-penilaian-kelas.csv',
      buatCsv([header, ...data].map((line) => line.map((value) => csvEscape(value)))),
      'text/csv',
    );
  }

  return (
    <main className="assessment-report">
      <header className="assessment-report-hero">
        <p className="assessment-report-kicker">Ruang Kelas · Asesmen</p>
        <h1>{isReportRoute ? 'Laporan Penilaian' : 'Analisis Hasil'}</h1>
        <p>
          Ringkasan ini menggabungkan nilai tugas dan kuis yang dikumpulkan di Ruang Kelas
          pada kelas yang Anda ampu. Nilai hanya dihitung untuk pengumpulan yang sudah dinilai.
        </p>
        <p className="assessment-report-notice">
          Laporan ini bukan rapor resmi, tidak mencakup nilai di luar Ruang Kelas, dan tidak
          menetapkan kriteria ketuntasan otomatis. Data dibatasi hingga 100 tugas dan 100 kuis
          terbaru per kelas.
        </p>
      </header>

      {error && <p className="assessment-report-error" role="alert">{error}</p>}
      <section className="assessment-report-panel" aria-label="Filter analisis">
        <div className="assessment-report-filters">
          <label>
            Kelas
            <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
              <option value="all">Semua kelas yang diampu</option>
              {classes.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.nama}{room.mapel ? ` · ${room.mapel}` : ''}
                </option>
              ))}
            </select>
          </label>
          <label>
            Jenis aktivitas
            <select value={typeFilter} onChange={(event) => setTypeFilter(event.target.value)}>
              <option value="all">Tugas dan kuis</option>
              <option value="Tugas">Tugas</option>
              <option value="Kuis">Kuis</option>
            </select>
          </label>
          <label>
            Cari aktivitas atau siswa
            <input
              type="search"
              value={search}
              onChange={(event) => setSearch(event.target.value)}
              placeholder="Nama siswa, kelas, atau aktivitas"
            />
          </label>
        </div>
        <div className="assessment-report-actions">
          <button type="button" className="assessment-report-secondary" onClick={() => void load()} disabled={loading}>
            {loading ? 'Memuat…' : 'Muat ulang'}
          </button>
          <button type="button" onClick={exportCsv} disabled={loading || visibleRows.length === 0}>
            Ekspor CSV
          </button>
        </div>
      </section>

      {loading ? (
        <p className="assessment-report-empty" role="status">Memuat hasil penilaian kelas…</p>
      ) : (
        <>
          <section className="assessment-report-metrics" aria-label="Ringkasan nilai">
            <article><span>Pengumpulan</span><strong>{summary.jumlahPengumpulan}</strong></article>
            <article><span>Sudah dinilai</span><strong>{summary.jumlahDinilai}</strong></article>
            <article><span>Menunggu penilaian</span><strong>{summary.jumlahMenunggu}</strong></article>
            <article><span>Rata-rata nilai dinilai</span><strong>{summary.rataRata ?? '—'}</strong></article>
          </section>
          {classes.length === 0 ? (
            <p className="assessment-report-empty">Belum ada Ruang Kelas yang ditugaskan ke akun ini.</p>
          ) : visibleRows.length === 0 ? (
            <p className="assessment-report-empty">Belum ada pengumpulan yang cocok dengan filter.</p>
          ) : (
            <>
              <section className="assessment-report-panel">
                <h2>Ringkasan per aktivitas</h2>
                <div className="assessment-report-table-wrap">
                  <table>
                    <thead><tr>
                      <th>Kelas</th><th>Jenis</th><th>Aktivitas</th><th>Pengumpulan</th>
                      <th>Dinilai</th><th>Menunggu</th><th>Rata-rata nilai</th>
                    </tr></thead>
                    <tbody>{activities.map((activity) => (
                      <tr key={`${activity.classroomId}:${activity.activityType}:${activity.activityName}`}>
                        <td>{activity.classroomName}</td>
                        <td>{activity.activityType}</td>
                        <td>{activity.activityName}</td>
                        <td>{activity.jumlahPengumpulan}</td>
                        <td>{activity.jumlahDinilai}</td>
                        <td>{activity.jumlahMenunggu}</td>
                        <td>{activity.rataRata ?? '—'}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </section>
              <section className="assessment-report-panel">
                <h2>Rincian pengumpulan</h2>
                <div className="assessment-report-table-wrap">
                  <table>
                    <thead><tr>
                      <th>Siswa</th><th>Kelas</th><th>Aktivitas</th><th>Nilai</th><th>Dikumpulkan</th>
                    </tr></thead>
                    <tbody>{visibleRows.map((row) => (
                      <tr key={row.id}>
                        <td>{row.studentName}</td>
                        <td>{row.classroomName}</td>
                        <td>{row.activityType}: {row.activityName}</td>
                        <td>{formatNilai(row.score)}</td>
                        <td>{formatTanggal(row.submittedAt)}</td>
                      </tr>
                    ))}</tbody>
                  </table>
                </div>
              </section>
            </>
          )}
        </>
      )}
    </main>
  );
}
