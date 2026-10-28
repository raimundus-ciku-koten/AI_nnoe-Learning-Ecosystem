import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { isSchoolAdminRole } from '../services/roleAccess.js';
import { muatRingkasanKontenSekolah } from '../services/schoolContentOverview.js';
import '../styles/online-assessments.css';

const METRIC_ORDER = [
  'classroom_materials_current',
  'classroom_materials_30d',
  'school_announcements_30d',
];

export default function SchoolContentOverviewPage() {
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
      setMetrics(await muatRingkasanKontenSekolah());
    } catch (cause) {
      console.error('[school-content-overview] Gagal memuat konten sekolah:', cause);
      setError('Ringkasan konten tidak dapat dimuat. Periksa sesi admin, tenant, dan izin server.');
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
        <h1>Konten sekolah</h1>
        <p>Halaman ini hanya tersedia bagi admin sekolah yang berwenang.</p>
      </section>
    );
  }

  return (
    <main className="ale-exam-card" aria-labelledby="school-content-title">
      <p className="ale-exam-kicker">Konten · tenant sekolah</p>
      <h1 id="school-content-title">Ringkasan Materi Sekolah</h1>
      <p className="ale-exam-intro">
        Hitungan materi yang disimpan pada Ruang Kelas dan pengumuman sekolah.
        Halaman ini tidak membuka isi materi, judul, atau data pembuat.
      </p>
      <p className="ale-exam-notice">
        Angka bukan jumlah materi yang telah ditinjau atau dipublikasikan secara terpisah.
        Arsip perencanaan terenkripsi dan perpustakaan digital belum termasuk.
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
      {loading && <p role="status">Memuat ringkasan konten tenant…</p>}
      {metrics && (
        <dl className="school-assessment-summary" aria-label="Ringkasan materi sekolah">
          {METRIC_ORDER.map((key) => (
            <div key={key}>
              <dt>{metrics[key].label}</dt>
              <dd>{metrics[key].value}</dd>
            </div>
          ))}
        </dl>
      )}
    </main>
  );
}
