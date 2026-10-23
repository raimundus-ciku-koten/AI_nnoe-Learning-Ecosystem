import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { muatRingkasanAnakWali } from '../services/guardianPortal.js';
import { isGuardianRole } from '../navigasi.js';
import '../styles/online-assessments.css';

function formatDate(value) {
  if (!value) return 'Belum ada presensi hadir tercatat';
  const parsed = new Date(`${value}T00:00:00`);
  return Number.isNaN(parsed.getTime())
    ? 'Tanggal tidak tersedia'
    : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(parsed);
}

function scoreText(score) {
  return score === null || score === undefined
    ? 'Belum ada nilai yang selesai dinilai'
    : `Rata-rata ujian yang telah dinilai: ${Number(score).toLocaleString('id-ID')}`;
}

export default function ParentPortalPage() {
  const { role } = useAuth();
  const { pathname } = useLocation();
  const viewingAttendance = pathname === '/orang-tua/nilai-kehadiran';
  const [children, setChildren] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isGuardianRole(role)) {
      setLoading(false);
      return undefined;
    }
    let active = true;
    muatRingkasanAnakWali()
      .then((rows) => {
        if (active) setChildren(rows);
      })
      .catch((loadError) => {
        if (active) setError(loadError.message || 'Ringkasan anak gagal dimuat.');
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => { active = false; };
  }, [role]);

  if (!isGuardianRole(role)) {
    return (
      <section className="ale-exam-card" role="alert">
        <h2>Portal orang tua/wali</h2>
        <p>Informasi ini hanya tersedia untuk akun wali aktif.</p>
      </section>
    );
  }

  return (
    <section className="ale-exam-card" aria-labelledby="parent-portal-title">
      <p className="ale-exam-kicker">Perkembangan anak</p>
      <h2 id="parent-portal-title">
        {viewingAttendance ? 'Nilai dan kehadiran anak' : 'Ringkasan anak'}
      </h2>
      <p className="ale-exam-intro">
        Data hanya mencakup siswa yang ditautkan dan diotorisasi sekolah untuk akun ini.
        Jumlah presensi di bawah menghitung catatan hadir; tidak menunjukkan jumlah hari tidak hadir.
      </p>
      {error && <p className="ale-exam-error" role="alert">{error}</p>}
      {loading && <p role="status">Memuat ringkasan…</p>}
      {!loading && !error && children.length === 0 && (
        <p>Belum ada siswa yang ditautkan. Hubungi admin sekolah untuk verifikasi dan penautan akun.</p>
      )}
      {!loading && !error && children.length > 0 && (
        <ul className="ale-exam-list">
          {children.map((child) => (
            <li key={child.student_id}>
              <div>
                <strong>{child.nama} · Kelas {child.kelas}</strong>
                <span>
                  Hadir tercatat: {Number(child.attendance_present_count) || 0}
                  {' · '}Presensi hadir terakhir: {formatDate(child.last_present_on)}
                </span>
                <span>
                  Ujian terkumpul: {Number(child.submitted_exam_count) || 0}
                  {' · '}Menunggu penilaian: {Number(child.pending_grade_count) || 0}
                </span>
                <span>{scoreText(child.average_exam_score)}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
      <p className="ale-exam-intro">
        Ringkasan mengikuti data yang tersedia di sekolah. Untuk koreksi data atau tindak lanjut,
        hubungi sekolah melalui kanal komunikasi resmi.
      </p>
    </section>
  );
}
