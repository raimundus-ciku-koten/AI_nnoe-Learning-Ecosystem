import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Ikon from '../components/Ikon.jsx';
import { muatJadwalSiswa, muatMateriSiswa } from '../services/studentLearning.js';
import '../styles/online-assessments.css';

const HARI = ['Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu'];

export default function StudentLearningPage() {
  const { role, activeRole, user } = useAuth();
  const { pathname } = useLocation();
  const peranAktif = activeRole || role;
  const isSchedule = pathname === '/siswa/jadwal';
  const [schedule, setSchedule] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const requestKey = peranAktif === 'siswa' && user?.uid
    ? `${user.uid}:${isSchedule ? 'schedule' : 'materials'}`
    : '';
  const [loadedRequestKey, setLoadedRequestKey] = useState('');
  const loadRequest = useRef(0);

  const muat = useCallback(async () => {
    const requestId = ++loadRequest.current;
    if (peranAktif !== 'siswa') {
      setLoading(false);
      setLoaded(true);
      setLoadedRequestKey('');
      return;
    }
    setSchedule([]);
    setMaterials([]);
    setLoadedRequestKey('');
    setLoading(true);
    setError('');
    try {
      const result = isSchedule ? await muatJadwalSiswa() : await muatMateriSiswa();
      if (requestId !== loadRequest.current) return;
      if (isSchedule) setSchedule(result);
      else setMaterials(result);
      setLoadedRequestKey(requestKey);
      setLoaded(true);
    } catch (loadError) {
      if (requestId !== loadRequest.current) return;
      console.error('[student-learning] Gagal memuat ruang belajar siswa:', loadError);
      setError(loadError?.code === '42501'
        ? 'Akun siswa belum aktif atau belum ditautkan oleh administrator sekolah.'
        : 'Data belum dapat dimuat. Periksa koneksi, lalu coba lagi.');
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, [isSchedule, peranAktif, requestKey]);

  useEffect(() => {
    muat();
    return () => { loadRequest.current += 1; };
  }, [muat]);

  if (peranAktif !== 'siswa') {
    return (
      <section className="ale-exam-card" role="alert">
        <h1>Ruang Belajar</h1>
        <p>Halaman ini hanya tersedia saat Anda masuk sebagai siswa.</p>
        <a href="#/dashboard">Kembali ke Dashboard</a>
      </section>
    );
  }

  const dataReady = loadedRequestKey === requestKey;
  const visibleSchedule = dataReady ? schedule : [];
  const visibleMaterials = dataReady ? materials : [];

  return (
    <section className="ale-exam-card" aria-labelledby="student-learning-title">
      <p className="ale-exam-kicker">Ruang belajar</p>
      <div className="ale-exam-heading">
        <div>
          <h1 id="student-learning-title">{isSchedule ? 'Jadwal Kelas' : 'Materi Belajar'}</h1>
          <p className="ale-exam-intro">
            {isSchedule
              ? 'Jadwal kelas yang diterbitkan guru untuk roster sekolah yang tertaut ke akun Anda.'
              : 'Bahan ajar yang diterbitkan guru untuk roster sekolah yang tertaut ke akun Anda.'}
          </p>
        </div>
        <nav aria-label="Ruang belajar siswa">
          <a className="ale-exam-secondary" href="#/siswa/jadwal">Jadwal</a>{' '}
          <a className="ale-exam-secondary" href="#/siswa/materi">Materi</a>
        </nav>
      </div>

      {error && (
        <div className="ale-exam-error" role="alert">
          <p>{error}</p>
          <button type="button" className="ale-exam-secondary" onClick={muat}>Coba lagi</button>
        </div>
      )}
      {loading && <p role="status">Memuat ruang belajar…</p>}
      {!loading && !error && loaded && isSchedule && dataReady && visibleSchedule.length === 0 && (
        <div className="ale-exam-review">
          <h2>Jadwal belum tersedia</h2>
          <p>Jadwal akan muncul setelah guru menerbitkan sesi untuk kelas Anda. Jika akun belum ditautkan ke roster sekolah, hubungi administrator sekolah.</p>
        </div>
      )}
      {!loading && !error && loaded && !isSchedule && dataReady && visibleMaterials.length === 0 && (
        <div className="ale-exam-review">
          <h2>Materi belum tersedia</h2>
          <p>Materi akan muncul setelah guru menerbitkannya untuk kelas Anda. Jika akun belum ditautkan ke roster sekolah, hubungi administrator sekolah.</p>
        </div>
      )}
      {!loading && !error && isSchedule && dataReady && visibleSchedule.length > 0 && (
        <div className="ale-exam-results-wrap">
          {HARI.map((hari, index) => {
            const entries = visibleSchedule.filter((entry) => entry.day_of_week === index + 1);
            if (!entries.length) return null;
            return (
              <section key={hari} aria-labelledby={`student-day-${index + 1}`}>
                <h2 id={`student-day-${index + 1}`}>{hari}</h2>
                <ul className="ale-exam-list">
                  {entries.map((entry) => (
                    <li key={entry.id}>
                      <div>
                        <strong>{entry.mapel}</strong>
                        <span>Kelas {entry.kelas}{entry.ruang ? ` · ${entry.ruang}` : ''}</span>
                      </div>
                      <span>{String(entry.starts_at).slice(0, 5)}–{String(entry.ends_at).slice(0, 5)}</span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      {!loading && !error && !isSchedule && dataReady && visibleMaterials.length > 0 && (
        <ul className="ale-exam-list">
          {visibleMaterials.map((material) => (
            <li key={material.id}>
              <div>
                <strong>{material.title}</strong>
                <span>{material.mapel} · Kelas {material.kelas}</span>
                {material.description && <span>{material.description}</span>}
              </div>
              <a href={material.resource_url} target="_blank" rel="noopener noreferrer">
                <Ikon nama="external" /> Buka materi
              </a>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
