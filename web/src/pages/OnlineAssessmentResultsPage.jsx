import React, { useEffect, useState } from 'react';
import { muatNilaiUjianSiswa } from '../services/onlineAssessments.js';
import '../styles/online-assessments.css';

export default function OnlineAssessmentResultsPage() {
  const [results, setResults] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    muatNilaiUjianSiswa()
      .then(setResults)
      .catch((loadError) => setError(loadError.message));
  }, []);

  return (
    <section className="ale-exam-card" aria-labelledby="student-results-title">
      <p className="ale-exam-kicker">Ruang belajar</p>
      <h2 id="student-results-title">Nilai Ujian Saya</h2>
      <p className="ale-exam-intro">Hasil hanya tersedia untuk akun siswa yang telah ditautkan ke roster sekolah.</p>
      {error && <p className="ale-exam-error" role="alert">{error}</p>}
      {!results.length && !error && <p>Belum ada hasil ujian yang dikembalikan.</p>}
      <ul className="ale-exam-list">
        {results.map((result) => (
          <li key={result.exam_id}>
            <div>
              <strong>{result.title}</strong>
              <span>Kelas {result.kelas} · dikumpulkan {new Date(result.submitted_at).toLocaleString('id-ID')}</span>
            </div>
            <strong>{result.grade_pending ? 'Menunggu penilaian uraian' : result.score ?? 'Nilai belum tersedia'}</strong>
          </li>
        ))}
      </ul>
    </section>
  );
}
