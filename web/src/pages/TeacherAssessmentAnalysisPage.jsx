import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { muatHasilUjianGuru } from '../services/onlineAssessments.js';
import { ringkasHasilUjian } from '../services/assessmentAnalysis.js';
import '../styles/online-assessments.css';

function formatMetric(value, suffix = '') {
  return value === null ? 'Belum tersedia' : `${value}${suffix}`;
}

export default function TeacherAssessmentAnalysisPage() {
  const { role } = useAuth();
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    let active = true;
    setResults([]);
    if (role !== 'guru') {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    setError('');
    muatHasilUjianGuru()
      .then((rows) => { if (active) setResults(rows); })
      .catch((loadError) => {
        console.error('[teacher-assessment-analysis] Gagal memuat analisis ujian:', loadError);
        if (active) setError(loadError?.message || 'Analisis hasil ujian tidak dapat dimuat.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [role]);

  const analyses = useMemo(() => ringkasHasilUjian(results), [results]);
  const totals = useMemo(() => analyses.reduce((summary, exam) => ({
    exams: summary.exams + 1,
    submissions: summary.submissions + exam.submissions,
    pendingReview: summary.pendingReview + exam.pendingReview,
  }), { exams: 0, submissions: 0, pendingReview: 0 }), [analyses]);

  if (role !== 'guru') {
    return (
      <section className="ale-exam-card" role="alert">
        <h1>Akses analisis hasil tidak tersedia</h1>
        <p>Analisis ini hanya tersedia bagi akun guru yang diizinkan oleh layanan asesmen.</p>
      </section>
    );
  }

  return (
    <section className="ale-exam-card" aria-labelledby="teacher-assessment-analysis-title">
      <p className="ale-exam-kicker">Asesmen dan penilaian</p>
      <h1 id="teacher-assessment-analysis-title">Analisis Hasil Ujian</h1>
      <p className="ale-exam-intro">
        Ringkasan dihitung dari pengumpulan ujian yang dibuat akun guru ini. Nilai rata-rata
        hanya mencakup hasil yang sudah dinilai; akurasi pilihan ganda dihitung dari jawaban
        benar dibanding total soal pilihan ganda.
      </p>
      <p className="ale-exam-notice" role="note">
        Data berasal dari RPC hasil yang saat ini mengirim semua hasil guru tanpa pagination server.
        Ringkasan tidak mencakup ujian atau hasil di luar cakupan RPC tersebut.
      </p>
      {error && <p className="ale-exam-error" role="alert">{error}</p>}
      {loading && <p role="status">Memuat hasil untuk dianalisis…</p>}
      {!loading && !error && (
        <div className="ale-exam-analysis-summary" aria-label="Ringkasan analisis">
          <article><span>Ujian dengan hasil</span><strong>{totals.exams}</strong></article>
          <article><span>Pengumpulan</span><strong>{totals.submissions}</strong></article>
          <article><span>Menunggu penilaian uraian</span><strong>{totals.pendingReview}</strong></article>
        </div>
      )}
      {!loading && !error && analyses.length === 0 && <p>Belum ada hasil ujian untuk dianalisis.</p>}
      {!loading && !error && analyses.length > 0 && (
        <div className="ale-exam-results-wrap">
          <table className="ale-exam-results">
            <thead>
              <tr>
                <th scope="col">Ujian</th>
                <th scope="col">Kelas</th>
                <th scope="col">Pengumpulan</th>
                <th scope="col">Rata-rata nilai akhir</th>
                <th scope="col">Akurasi pilihan ganda</th>
                <th scope="col">Menunggu penilaian</th>
              </tr>
            </thead>
            <tbody>
              {analyses.map((exam) => (
                <tr key={exam.examId}>
                  <td>{exam.title}</td>
                  <td>{exam.className}</td>
                  <td>{exam.submissions}</td>
                  <td>{formatMetric(exam.averageScore)}</td>
                  <td>{exam.objectiveAccuracy === null
                    ? 'Belum tersedia'
                    : `${exam.objectiveAccuracy}% (${exam.objectiveCorrect}/${exam.objectiveTotal})`}</td>
                  <td>{exam.pendingReview}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  );
}
