import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import {
  muatKelasWali,
  muatLaporanKelasWali,
  muatRingkasanKepalaSekolah,
} from '../services/schoolLeadership.js';
import '../styles/school-leadership.css';

function formatNilai(value) {
  return value === null ? 'Belum tersedia' : `${Number(value).toFixed(1)} / 100`;
}

function KartuStatistik({ label, value }) {
  return (
    <article className="leadership-stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </article>
  );
}

export default function SchoolLeadershipPage() {
  const { role: baseRole, activeRole } = useAuth();
  const role = activeRole || baseRole;
  const isPrincipal = role === 'kepala_sekolah';
  const isHomeroom = role === 'wali_kelas';
  const [summary, setSummary] = useState(null);
  const [classes, setClasses] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    async function load() {
      setSummary(null);
      setClasses([]);
      setStudents([]);
      setSelectedClass('');
      setLoading(true);
      setError('');
      try {
        if (isPrincipal) {
          const result = await muatRingkasanKepalaSekolah();
          if (active) setSummary(result);
        } else if (isHomeroom) {
          const result = await muatKelasWali();
          if (active) {
            setClasses(result);
            setSelectedClass(result[0]?.id || '');
          }
        }
      } catch (loadError) {
        console.error('[school-leadership] Gagal memuat ringkasan:', loadError);
        if (active) setError('Data belum dapat dimuat. Periksa sesi, tenant, dan kebijakan akses sekolah.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void load();
    return () => { active = false; };
  }, [isHomeroom, isPrincipal]);

  useEffect(() => {
    if (!isHomeroom || !selectedClass) {
      setStudents([]);
      return undefined;
    }
    let active = true;
    async function loadClass() {
      setLoading(true);
      setError('');
      try {
        const result = await muatLaporanKelasWali(selectedClass);
        if (active) setStudents(result);
      } catch (loadError) {
        console.error('[school-leadership] Gagal memuat ringkasan kelas:', loadError);
        if (active) setError('Ringkasan kelas tidak dapat dimuat. Pastikan penugasan kelas masih berlaku.');
      } finally {
        if (active) setLoading(false);
      }
    }
    void loadClass();
    return () => { active = false; };
  }, [isHomeroom, selectedClass]);

  if (!isPrincipal && !isHomeroom) {
    return <main className="leadership-page"><h1>Akses terbatas</h1><p>Halaman ini hanya untuk kepala sekolah atau wali kelas.</p></main>;
  }

  return (
    <main className="leadership-page">
      <header>
        <p className="leadership-eyebrow">Pemantauan sekolah · baca-saja</p>
        <h1>{isPrincipal ? 'Ringkasan Sekolah' : 'Pemantauan Kelas Wali'}</h1>
        <p>{isPrincipal
          ? 'Statistik agregat seluruh data tersimpan pada tenant sekolah aktif, tanpa identitas atau nilai siswa perorangan. Rata-rata dan persentase disembunyikan bila kurang dari lima siswa memiliki data; ringkasan ini bukan rapor periode resmi.'
          : 'Data hanya berasal dari kelas yang ditugaskan kepada Anda. Jawaban tugas, umpan balik privat, catatan presensi, dan rapor resmi tidak ditampilkan.'}</p>
      </header>

      {error && <p className="leadership-error" role="alert">{error}</p>}
      {loading && <p role="status">Memuat data yang diizinkan…</p>}

      {isPrincipal && summary && !loading && (
        <section className="leadership-grid" aria-label="Statistik agregat sekolah">
          <KartuStatistik label="Kelas terdaftar" value={summary.jumlahKelas} />
          <KartuStatistik label="Siswa terdaftar" value={summary.jumlahSiswa} />
          <KartuStatistik label="Catatan presensi" value={summary.jumlahCatatanPresensi} />
          <KartuStatistik label="Kehadiran tercatat" value={summary.persentaseHadir === null ? 'Belum tersedia' : `${summary.persentaseHadir}%`} />
          <KartuStatistik label="Pengumpulan tugas dinilai" value={summary.pengumpulanDinilai} />
          <KartuStatistik label="Rata-rata skor pengumpulan" value={formatNilai(summary.rataNilaiTugas)} />
          <KartuStatistik label="Kuis dikerjakan" value={summary.kuisDikerjakan} />
          <KartuStatistik label="Rata-rata skor kuis" value={formatNilai(summary.rataNilaiKuis)} />
        </section>
      )}

      {isHomeroom && !loading && classes.length === 0 && !error && (
        <section className="leadership-empty">
          <h2>Belum ada kelas yang ditugaskan</h2>
          <p>Hubungi admin sekolah untuk menetapkan kelas yang menjadi tanggung jawab Anda.</p>
        </section>
      )}

      {isHomeroom && classes.length > 0 && (
        <section className="leadership-roster">
          <label>
            Kelas yang ditugaskan
            <select value={selectedClass} onChange={(event) => setSelectedClass(event.currentTarget.value)}>
              {classes.map((classroom) => (
                <option value={classroom.id} key={classroom.id}>
                  {[classroom.nama, classroom.tingkat, classroom.tahunAjaran].filter(Boolean).join(' · ')}
                </option>
              ))}
            </select>
          </label>
          {loading ? <p role="status">Memuat ringkasan kelas…</p> : error ? null : students.length === 0 ? (
            <p className="leadership-empty">Belum ada siswa aktif yang terdaftar pada kelas ini.</p>
          ) : (
            <div className="leadership-table-wrap">
              <table>
                <caption>Ringkasan per siswa untuk kelas yang dipilih</caption>
                <thead>
                  <tr>
                    <th scope="col">Siswa</th>
                    <th scope="col">Sesi tercatat</th>
                    <th scope="col">Hadir / izin / sakit / alpa</th>
                    <th scope="col">Tugas dinilai</th>
                    <th scope="col">Rata-rata tugas</th>
                    <th scope="col">Kuis</th>
                    <th scope="col">Rata-rata kuis</th>
                  </tr>
                </thead>
                <tbody>
                  {students.map((student) => (
                    <tr key={student.id}>
                      <th scope="row">{student.nama}</th>
                      <td>{student.presensi.sesi}</td>
                      <td>{student.presensi.hadir} / {student.presensi.izin} / {student.presensi.sakit} / {student.presensi.alpa}</td>
                      <td>{student.tugasDinilai}</td>
                      <td>{formatNilai(student.rataNilaiTugas)}</td>
                      <td>{student.kuisDikerjakan}</td>
                      <td>{formatNilai(student.rataNilaiKuis)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      )}
    </main>
  );
}
