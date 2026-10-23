import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { isTeacherRole } from '../navigasi.js';
import Ikon from '../components/Ikon.jsx';
import { muatPenugasanGuru } from '../services/teacherAssignments.js';
import '../styles/teacher-assignments.css';

export default function TeacherAssignmentsPage() {
  const { user, role, tenantId } = useAuth();
  const [assignments, setAssignments] = useState({ kelas: [], mapel: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    if (!isTeacherRole(role) || !user?.uid || !tenantId) {
      setAssignments({ kelas: [], mapel: [] });
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    setError('');
    muatPenugasanGuru(user.uid)
      .then((result) => { if (active) setAssignments(result); })
      .catch((loadError) => {
        console.error('[teacher-assignments] Gagal memuat penugasan:', loadError);
        if (active) setError(loadError?.message || 'Penugasan mengajar tidak dapat dimuat.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [role, tenantId, user?.uid]);

  if (!isTeacherRole(role)) {
    return (
      <section className="ale-kartu teacher-assignments-denied" role="alert">
        <h1>Akses penugasan guru tidak tersedia</h1>
        <p>Halaman ini hanya tersedia bagi akun guru.</p>
      </section>
    );
  }

  if (!user?.uid || !tenantId) {
    return (
      <section className="ale-kartu teacher-assignments-denied" role="alert">
        <h1>Konteks sekolah belum tersedia</h1>
        <p>Akun guru belum terhubung ke sekolah aktif.</p>
      </section>
    );
  }

  return (
    <main className="teacher-assignments">
      <header className="teacher-assignments-header">
        <div>
          <p className="teacher-assignments-kicker"><Ikon nama="journal-bookmark" /> Data dasar guru</p>
          <h1>Kelas &amp; Mapel Saya</h1>
          <p>Tinjau penugasan yang sudah ditetapkan untuk akun Anda di sekolah aktif.</p>
        </div>
        <a href="#/dashboard">Kembali ke Dashboard</a>
      </header>

      <p className="teacher-assignments-note" role="note">
        Halaman ini hanya membaca penugasan pada profil akun Anda. Untuk menambah atau mengubah
        kelas dan mata pelajaran, hubungi administrator sekolah; halaman ini tidak mengubah peran
        atau penugasan.
      </p>

      {error && <p className="teacher-assignments-error" role="alert">{error}</p>}
      {loading && <p role="status">Memuat penugasan mengajar…</p>}

      {!loading && !error && (
        <div className="teacher-assignments-grid">
          <section className="ale-kartu teacher-assignments-card" aria-labelledby="teacher-classes-title">
            <p className="teacher-assignments-eyebrow">Rombongan belajar</p>
            <h2 id="teacher-classes-title">Kelas yang ditugaskan</h2>
            {assignments.kelas.length === 0
              ? <p>Belum ada kelas yang ditetapkan untuk akun ini.</p>
              : (
                <ul>
                  {assignments.kelas.map((className) => <li key={className}>{className}</li>)}
                </ul>
              )}
          </section>
          <section className="ale-kartu teacher-assignments-card" aria-labelledby="teacher-subjects-title">
            <p className="teacher-assignments-eyebrow">Mata pelajaran</p>
            <h2 id="teacher-subjects-title">Mapel yang ditugaskan</h2>
            {assignments.mapel.length === 0
              ? <p>Belum ada mata pelajaran yang ditetapkan untuk akun ini.</p>
              : (
                <ul>
                  {assignments.mapel.map((subject) => <li key={subject}>{subject}</li>)}
                </ul>
              )}
          </section>
        </div>
      )}
    </main>
  );
}
