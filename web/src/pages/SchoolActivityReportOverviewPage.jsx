import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { isSchoolAdminRole } from '../services/roleAccess.js';
import { muatRingkasanAktivitasLaporanSekolah } from '../services/schoolActivityReportOverview.js';
import '../styles/online-assessments.css';

const METRIC_ORDER = [
  'classrooms_current',
  'lesson_journals_30d',
  'attendance_sessions_30d',
  'assignments_30d',
  'quizzes_30d',
];

export default function SchoolActivityReportOverviewPage() {
  const { role, activeRole, tenantId } = useAuth();
  const allowed = isSchoolAdminRole(activeRole || role);
  const [metrics, setMetrics] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const refresh = useCallback(async () => {
    setLoading(true);
    setError('');
    setMetrics(null);
    try {
      if (!tenantId) throw new Error('Sesi admin sekolah tidak memiliki tenant aktif.');
      setMetrics(await muatRingkasanAktivitasLaporanSekolah());
    } catch (cause) {
      console.error('[school-activity-report] Gagal memuat laporan aktivitas sekolah:', cause);
      setError('Ringkasan tidak dapat dimuat. Periksa sesi admin, tenant, dan izin server.');
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    if (!allowed) {
      setLoading(false);
      return undefined;
    }
    void refresh();
    return undefined;
  }, [allowed, refresh]);

  if (!allowed) {
    return (
      <section className="ale-exam-card" role="alert">
        <h1>Ringkasan aktivitas sekolah</h1>
        <p>Halaman ini hanya tersedia bagi admin sekolah yang berwenang.</p>
      </section>
    );
  }

  return (
    <main className="ale-exam-card" aria-labelledby="school-activity-report-title">
      <p className="ale-exam-kicker">Laporan · tenant sekolah</p>
      <h1 id="school-activity-report-title">Ringkasan Aktivitas Kelas</h1>
      <p className="ale-exam-intro">
        Jumlah data yang tercatat di modul Ruang Kelas untuk tenant aktif.
        Tidak ada nama, nilai, catatan individu, atau isi tugas yang ditampilkan.
      </p>
      <p className="ale-exam-notice">
        Jendela 30 hari dihitung dari tanggal saat ini. Ringkasan ini hanya mencakup
        lima sumber yang tercantum dan bukan laporan akademik, audit lengkap, atau laporan
        kinerja guru.
      </p>
      {error && <p className="ale-exam-error" role="alert">{error}</p>}
      <button
        className="ale-exam-secondary"
        type="button"
        disabled={loading}
        onClick={() => void refresh()}
      >
        {loading ? 'Memuat…' : 'Muat ulang'}
      </button>
      {loading && <p role="status">Memuat ringkasan tenant…</p>}
      {metrics && (
        <dl className="school-assessment-summary" aria-label="Jumlah aktivitas modul kelas">
          {METRIC_ORDER.filter((key) => metrics[key]).map((key) => {
            const metric = metrics[key];
            return (
              <div key={key}>
                <dt>{metric.label}</dt>
                <dd>{metric.value}</dd>
              </div>
            );
          })}
        </dl>
      )}
    </main>
  );
}
