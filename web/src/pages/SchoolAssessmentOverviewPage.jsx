import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { isSchoolAdminRole } from '../services/roleAccess.js';
import { muatRingkasanAsesmenSekolah } from '../services/schoolAssessmentOverview.js';
import '../styles/online-assessments.css';

const VIEW_COPY = {
  paket: {
    title: 'Paket ujian',
    intro: 'Tinjau ujian yang disusun guru, termasuk jumlah butir dan durasinya. Paket dan snapshot soal tidak dapat diubah dari halaman admin ini.',
  },
  jadwal: {
    title: 'Jadwal ujian',
    intro: 'Jadwal berikut berasal dari ujian yang dibuat guru di tenant sekolah ini.',
  },
  monitoring: {
    title: 'Monitoring ujian',
    intro: 'Pantau jumlah peserta tertaut, jawaban terkumpul, dan jawaban uraian yang masih menunggu penilaian. Nama dan jawaban siswa tidak ditampilkan.',
  },
  analisis: {
    title: 'Analisis hasil ujian',
    intro: 'Ringkasan agregat ini hanya mencakup ujian online di aplikasi. Ini bukan rapor atau laporan akademik resmi dan tidak menampilkan nilai individual.',
  },
};

function formatWaktu(value) {
  return new Intl.DateTimeFormat('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function viewForPath(path) {
  const key = path.split('/').filter(Boolean).at(-1);
  return VIEW_COPY[key] ? key : 'monitoring';
}

export default function SchoolAssessmentOverviewPage() {
  const { role, activeRole, tenantId } = useAuth();
  const location = useLocation();
  const currentRole = activeRole || role;
  const allowed = isSchoolAdminRole(currentRole);
  const view = viewForPath(location.pathname);
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    if (!tenantId) throw new Error('Sesi admin sekolah tidak memiliki tenant aktif.');
    setLoading(true);
    setError('');
    try {
      setRows(await muatRingkasanAsesmenSekolah());
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (!allowed) {
      setLoading(false);
      return undefined;
    }
    let current = true;
    refresh().catch((cause) => {
      console.error('[school-assessment-overview] Gagal memuat halaman asesmen admin:', cause);
      if (current) setError('Ringkasan asesmen tidak dapat dimuat. Periksa sesi admin, tenant, dan izin server.');
    });
    return () => { current = false; };
  }, [allowed, refresh]);

  const totals = useMemo(() => rows.reduce((summary, row) => ({
    exams: summary.exams + 1,
    participants: summary.participants + row.participant_count,
    submitted: summary.submitted + row.submitted_count,
    pending: summary.pending + row.pending_review_count,
  }), { exams: 0, participants: 0, submitted: 0, pending: 0 }), [rows]);

  if (!allowed) {
    return (
      <section className="ale-exam-card" role="alert">
        <h1>Manajemen asesmen sekolah</h1>
        <p>Halaman ini hanya tersedia bagi admin sekolah yang berwenang.</p>
      </section>
    );
  }

  return (
    <main className="ale-exam-card" aria-labelledby="school-assessment-title">
      <p className="ale-exam-kicker">Asesmen · tenant sekolah</p>
      <h1 id="school-assessment-title">{VIEW_COPY[view].title}</h1>
      <p className="ale-exam-intro">{VIEW_COPY[view].intro}</p>
      <p className="ale-exam-notice">
        Data dibatasi oleh tenant aktif dan berasal dari Ujian Online. Guru tetap bertanggung jawab
        atas penyusunan ujian dan penilaian jawaban uraian.
      </p>
      {error && <p className="ale-exam-error" role="alert">{error}</p>}
      <button
        type="button"
        className="ale-exam-secondary"
        disabled={loading}
        onClick={() => refresh().catch((cause) => {
          console.error('[school-assessment-overview] Gagal memuat ulang ringkasan:', cause);
          setError('Ringkasan terbaru tidak dapat dimuat. Periksa koneksi dan izin tenant.');
        })}
      >
        {loading ? 'Memuat…' : 'Muat ulang'}
      </button>
      <dl className="school-assessment-summary" aria-label="Ringkasan tenant">
        <div><dt>Ujian</dt><dd>{totals.exams}</dd></div>
        <div><dt>Peserta tertaut</dt><dd>{totals.participants}</dd></div>
        <div><dt>Jawaban terkumpul</dt><dd>{totals.submitted}</dd></div>
        <div><dt>Menunggu penilaian</dt><dd>{totals.pending}</dd></div>
      </dl>
      <h2>Daftar ujian sekolah</h2>
      {loading && <p role="status">Memuat data tenant…</p>}
      {!loading && !error && !rows.length && (
        <p>Belum ada ujian online pada tenant ini. Guru dapat menyusun ujian melalui modul Ujian Online.</p>
      )}
      <ul className="ale-exam-list">
        {rows.map((exam) => (
          <li key={exam.exam_id}>
            <div>
              <strong>{exam.title} · Kelas {exam.kelas}</strong>
              <span>{formatWaktu(exam.starts_at)}–{formatWaktu(exam.ends_at)} · {exam.duration_minutes} menit</span>
              <span>{exam.question_count} soal · {exam.submitted_count}/{exam.participant_count} jawaban terkumpul · {exam.pending_review_count} menunggu penilaian</span>
            </div>
            <span>{exam.status === 'active' ? 'Aktif' : 'Ditutup'}</span>
          </li>
        ))}
      </ul>
      <p className="ale-exam-intro">
        Bank soal tersedia sebagai tinjauan tenant.{' '}
        <Link to="/asesmen/bank-soal">Buka Bank Soal</Link>
      </p>
    </main>
  );
}
