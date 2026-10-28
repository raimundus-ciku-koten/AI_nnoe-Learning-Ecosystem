import React, { useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import {
  buatUjianOnline,
  daftarDraftUjian,
  hapusDraftUjian,
  kirimJawabanUjian,
  muatJawabanUraianGuru,
  muatHasilUjianGuru,
  muatKategoriUjianGuru,
  muatRingkasanUjianGuru,
  muatDraftUjian,
  muatSoalUjianGuru,
  muatUjianSiswa,
  mulaiUjianOnline,
  nilaiJawabanUraian,
  simpanDraftUjian,
} from '../services/onlineAssessments.js';
import { isTeacherRole } from '../services/roleAccess.js';
import '../styles/online-assessments.css';

const LABEL_JENIS_ASESMEN = {
  umum: 'Asesmen umum',
  diagnostik: 'Asesmen diagnostik',
  formatif: 'Asesmen formatif',
  sumatif: 'Asesmen sumatif',
};

function formatWaktu(value) {
  return new Date(value).toLocaleString('id-ID', {
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

function StudentAssessments({ userId }) {
  const [exams, setExams] = useState([]);
  const [drafts, setDrafts] = useState([]);
  const [active, setActive] = useState(null);
  const [answers, setAnswers] = useState({});
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [clock, setClock] = useState(Date.now());

  const refresh = async () => {
    try {
      setDrafts(daftarDraftUjian(userId));
    } catch (draftError) {
      setError(`Draft lokal tidak dapat dibaca: ${draftError.message}`);
    }
    try {
      setExams(await muatUjianSiswa());
      setError('');
    } catch (loadError) {
      setError(`Daftar ujian belum dapat disinkronkan: ${loadError.message}`);
    }
  };

  useEffect(() => {
    refresh().catch((loadError) => setError(loadError.message));
  }, [userId]);

  useEffect(() => {
    if (!active) return undefined;
    try {
      simpanDraftUjian(userId, active, answers, active.submissionId || '');
      setDrafts(daftarDraftUjian(userId));
    } catch (draftError) {
      setError(`Draft tidak dapat disimpan pada sesi browser: ${draftError.message}`);
    }
    return undefined;
  }, [active, answers, userId]);

  useEffect(() => {
    if (!active) return undefined;
    const timer = globalThis.setInterval(() => setClock(Date.now()), 1000);
    return () => globalThis.clearInterval(timer);
  }, [active]);

  const applySubmission = async (exam, submittedAnswers, submissionId) => {
    const result = await kirimJawabanUjian(exam.attemptId, submissionId, submittedAnswers);
    hapusDraftUjian(userId, exam.examId);
    setDrafts(daftarDraftUjian(userId));
    setActive(null);
    setAnswers({});
    setNotice(result.gradePending
      ? 'Jawaban berhasil diterima. Jawaban uraian menunggu penilaian guru.'
      : 'Jawaban berhasil diterima. Hasil akan tampil di menu Nilai Saya.');
  };

  useEffect(() => {
    const syncPending = async () => {
      if (!globalThis.navigator?.onLine || !active?.submissionId) return;
      setBusy(true);
      try {
        await applySubmission(active, answers, active.submissionId);
        setError('');
      } catch (syncError) {
        setError(`Pengumpulan belum terkonfirmasi: ${syncError.message}`);
      } finally {
        setBusy(false);
      }
    };
    globalThis.addEventListener('online', syncPending);
    return () => globalThis.removeEventListener('online', syncPending);
  }, [active, answers, userId]);

  const openExam = async (examId) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const cached = muatDraftUjian(userId, examId);
      if (cached) {
        setActive({ ...cached.exam, submissionId: cached.submissionId });
        setAnswers(cached.answers);
        setNotice(cached.submissionId
          ? 'Pengumpulan tersimpan di sesi browser dan menunggu konfirmasi server.'
          : 'Draft ujian dipulihkan dari sesi browser.');
      } else {
        const started = await mulaiUjianOnline(examId);
        setActive({
          ...started,
          assessmentType: exams.find((exam) => exam.exam_id === examId)?.assessment_type || 'umum',
        });
        setAnswers({});
      }
    } catch (openError) {
      setError(openError.message);
    } finally {
      setBusy(false);
    }
  };

  const submitExam = async () => {
    if (!active) return;
    const submissionId = active.submissionId || globalThis.crypto?.randomUUID?.();
    if (!submissionId) {
      setError('Browser ini tidak mendukung ID pengumpulan yang aman.');
      return;
    }
    const pendingExam = { ...active, submissionId };
    setActive(pendingExam);
    try {
      simpanDraftUjian(userId, pendingExam, answers, submissionId);
    } catch (storageError) {
      setError(`Draft tidak dapat disimpan: ${storageError.message}`);
      return;
    }
    if (!globalThis.navigator?.onLine) {
      setNotice('Tidak ada koneksi. Jawaban disimpan pada sesi browser dan akan dikirim saat koneksi kembali, selama server masih menerima ujian.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await applySubmission(pendingExam, answers, submissionId);
    } catch (submitError) {
      setError(`Pengumpulan belum terkonfirmasi. Draft tetap tersimpan: ${submitError.message}`);
    } finally {
      setBusy(false);
    }
  };

  if (active) {
    const remainingSeconds = Math.max(0, Math.ceil((Date.parse(active.deadline) - clock) / 1000));
    const expired = remainingSeconds === 0;
    return (
      <section className="ale-exam-card" aria-labelledby="exam-active-title">
        <div className="ale-exam-heading">
          <div>
            <p className="ale-exam-kicker">
              {LABEL_JENIS_ASESMEN[active.assessmentType] || 'Sedang mengerjakan'}
            </p>
            <h2 id="exam-active-title">{active.title}</h2>
          </div>
          <p className="ale-exam-deadline">
            Sisa {Math.floor(remainingSeconds / 60)}:{String(remainingSeconds % 60).padStart(2, '0')} ·
            batas server {formatWaktu(active.deadline)}
          </p>
        </div>
        <p className="ale-exam-notice">
          Jawaban disimpan pada sesi browser ini. Muat soal sebelum koneksi terputus; pengumpulan tetap harus diterima server sebelum batas waktu.
        </p>
        {active.questions.map((question, index) => (
          <fieldset className="ale-exam-question" key={question.id}>
            <legend>{index + 1}. {question.prompt}</legend>
            {question.kind === 'pilihan_ganda'
              ? question.choices.map((choice) => (
                <label className="ale-exam-choice" key={choice}>
                  <input
                    type="radio"
                    name={`answer-${question.id}`}
                    value={choice}
                    checked={answers[question.id] === choice}
                    disabled={busy || Boolean(active.submissionId)}
                    onChange={() => setAnswers((previous) => ({ ...previous, [question.id]: choice }))}
                  />
                  <span>{choice}</span>
                </label>
              ))
              : (
                <textarea
                  rows="4"
                  maxLength="1000"
                  value={answers[question.id] || ''}
                  readOnly={busy || Boolean(active.submissionId)}
                  onChange={(event) => setAnswers((previous) => ({
                    ...previous,
                    [question.id]: event.target.value,
                  }))}
                  aria-label={`Jawaban uraian nomor ${index + 1}`}
                />
              )}
          </fieldset>
        ))}
        {error && <p className="ale-exam-error" role="alert">{error}</p>}
        {notice && <p className="ale-exam-notice" role="status">{notice}</p>}
        <button
          type="button"
          className="ale-exam-primary"
          disabled={busy || (expired && !active.submissionId)}
          onClick={submitExam}
        >
          {busy ? 'Mengirim…' : active.submissionId ? 'Coba sinkronkan jawaban' : 'Kumpulkan jawaban'}
        </button>
        {expired && (
          <p className="ale-exam-error">
            {active.submissionId
              ? 'Batas waktu server telah berakhir. Coba sinkronkan pengumpulan yang tersimpan; server hanya akan menerima retry jika pengumpulan sebelumnya sudah diterima.'
              : 'Batas waktu server telah berakhir. Jawaban tidak dapat dikirim setelah tenggat.'}
          </p>
        )}
        <button
          type="button"
          className="ale-exam-secondary"
          onClick={() => { setActive(null); setAnswers({}); }}
        >
          Kembali ke daftar ujian
        </button>
        {expired && !active.submissionId && (
          <button
            type="button"
            className="ale-exam-secondary"
            onClick={() => {
              if (globalThis.confirm('Batas waktu ujian sudah lewat. Hapus draft yang tidak bisa dikirim?')) {
                hapusDraftUjian(userId, active.examId);
                setDrafts(daftarDraftUjian(userId));
                setActive(null);
                setAnswers({});
              }
            }}
          >
            Hapus draft kedaluwarsa
          </button>
        )}
      </section>
    );
  }

  return (
    <section className="ale-exam-card" aria-labelledby="exam-list-title">
      <div className="ale-exam-heading">
        <div>
          <p className="ale-exam-kicker">Ruang belajar</p>
          <h2 id="exam-list-title">Ujian Saya</h2>
        </div>
        <button type="button" className="ale-exam-secondary" onClick={() => refresh()} disabled={busy}>
          Muat ulang
        </button>
      </div>
      <p className="ale-exam-intro">Ujian ditampilkan setelah akun siswa ditautkan oleh admin sekolah ke data roster.</p>
      {error && <p className="ale-exam-error" role="alert">{error}</p>}
      {notice && <p className="ale-exam-notice" role="status">{notice}</p>}
      {!exams.length && !drafts.length && !error && <p>Belum ada ujian aktif untuk kelas Anda.</p>}
      <ul className="ale-exam-list">
        {exams.map((exam) => {
          const draft = drafts.find((item) => item.exam.examId === exam.exam_id);
          return (
            <li key={exam.exam_id}>
              <div>
                <strong>{exam.title}</strong>
                <span>{LABEL_JENIS_ASESMEN[exam.assessment_type] || LABEL_JENIS_ASESMEN.umum}</span>
                <span>Kelas {exam.kelas} · {formatWaktu(exam.starts_at)} · {exam.duration_minutes} menit</span>
                {draft?.submissionId && <span>Pengumpulan menunggu konfirmasi server</span>}
              </div>
              {exam.attempt_status !== 'submitted' && (
                <button type="button" disabled={busy} onClick={() => openExam(exam.exam_id)}>
                  {draft ? 'Lanjutkan' : exam.attempt_status === 'in_progress' ? 'Lanjutkan ujian' : 'Mulai ujian'}
                </button>
              )}
            </li>
          );
        })}
        {drafts.filter((draft) => !exams.some((exam) => exam.exam_id === draft.exam.examId)).map((draft) => (
          <li key={draft.exam.examId}>
            <div>
              <strong>{draft.exam.title}</strong>
              <span>Ujian tersimpan di sesi browser</span>
            </div>
            <button type="button" disabled={busy} onClick={() => openExam(draft.exam.examId)}>
              {draft.submissionId ? 'Sinkronkan' : 'Lanjutkan'}
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}

function TeacherAssessments({ tenantId, userId, assessmentType }) {
  const [questions, setQuestions] = useState([]);
  const [exams, setExams] = useState([]);
  const [reviews, setReviews] = useState([]);
  const [results, setResults] = useState([]);
  const [categories, setCategories] = useState([]);
  const [essayScores, setEssayScores] = useState({});
  const [title, setTitle] = useState('');
  const [kelas, setKelas] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [duration, setDuration] = useState(60);
  const [selected, setSelected] = useState([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refreshTeacherData = async () => {
    const [examRows, essayRows, resultRows] = await Promise.all([
      muatRingkasanUjianGuru(),
      muatJawabanUraianGuru(),
      muatHasilUjianGuru(),
    ]);
    const categoryRows = await muatKategoriUjianGuru();
    setExams(examRows);
    setReviews(essayRows);
    setResults(resultRows);
    setCategories(categoryRows);
  };

  useEffect(() => {
    muatSoalUjianGuru(tenantId, userId)
      .then(setQuestions)
      .catch((loadError) => setError(loadError.message));
    refreshTeacherData().catch((loadError) => setError(loadError.message));
  }, [tenantId, userId]);

  const classes = useMemo(
    () => [...new Set(questions.map((question) => question.kelas))].sort(),
    [questions],
  );
  const classQuestions = questions.filter((question) => question.kelas === kelas);

  const createExam = async (event) => {
    event.preventDefault();
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const examId = await buatUjianOnline({
        title,
        kelas,
        startsAt: new Date(startsAt).toISOString(),
        endsAt: new Date(endsAt).toISOString(),
        durationMinutes: Number(duration),
        questionIds: selected,
        assessmentType,
      });
      setNotice(`Ujian berhasil dijadwalkan. ID ujian: ${examId}`);
      setTitle('');
      setSelected([]);
      await refreshTeacherData();
    } catch (createError) {
      setError(createError.message);
    } finally {
      setBusy(false);
    }
  };

  const gradeEssay = async (attemptId) => {
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const score = await nilaiJawabanUraian(attemptId, Number(essayScores[attemptId]));
      setNotice(`Penilaian tersimpan. Nilai akhir ujian: ${score}.`);
      setEssayScores((previous) => {
        const next = { ...previous };
        delete next[attemptId];
        return next;
      });
      await refreshTeacherData();
    } catch (gradeError) {
      setError(gradeError.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <section className="ale-exam-card" aria-labelledby="exam-create-title">
      <p className="ale-exam-kicker">Asesmen dan penilaian</p>
      <h2 id="exam-create-title">
        {assessmentType === 'umum'
          ? 'Jadwalkan Ujian Online'
          : `${LABEL_JENIS_ASESMEN[assessmentType]} · Jadwalkan Ujian`}
      </h2>
      {assessmentType !== 'umum' && (
        <p className="ale-exam-intro">
          Kategori ini disimpan pada ujian dan terlihat pada daftar siswa. Gunakan instrumen
          dan kriteria yang telah ditetapkan sekolah; kategori tidak menetapkan diagnosis
          atau keputusan akademik otomatis.
        </p>
      )}
      <p className="ale-exam-intro">Soal disalin sebagai snapshot saat ujian dibuat. Kunci jawaban hanya digunakan di server untuk penilaian.</p>
      {!questions.length && !error && <p>Bank soal milik Anda masih kosong.</p>}
      <form className="ale-exam-form" onSubmit={createExam}>
        <label>Judul ujian
          <input required maxLength="160" value={title} onChange={(event) => setTitle(event.target.value)} />
        </label>
        <label>Kelas
          <select required value={kelas} onChange={(event) => { setKelas(event.target.value); setSelected([]); }}>
            <option value="">Pilih kelas</option>
            {classes.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>Mulai
          <input required type="datetime-local" value={startsAt} onChange={(event) => setStartsAt(event.target.value)} />
        </label>
        <label>Selesai menerima peserta
          <input required type="datetime-local" value={endsAt} onChange={(event) => setEndsAt(event.target.value)} />
        </label>
        <label>Durasi (menit)
          <input required type="number" min="1" max="300" value={duration} onChange={(event) => setDuration(event.target.value)} />
        </label>
        <fieldset className="ale-exam-select-questions">
          <legend>Pilih soal ({selected.length}/100)</legend>
          {classQuestions.map((question) => (
            <label key={question.id}>
              <input
                type="checkbox"
                checked={selected.includes(question.id)}
                disabled={!selected.includes(question.id) && selected.length >= 100}
                onChange={(event) => setSelected((previous) => (
                  event.target.checked
                    ? [...previous, question.id]
                    : previous.filter((id) => id !== question.id)
                ))}
              />
              <span>{question.pertanyaan} <small>({question.mapel} · {question.jenis})</small></span>
            </label>
          ))}
          {kelas && classQuestions.length === 0 && <p>Tidak ada soal untuk kelas ini.</p>}
        </fieldset>
        <button className="ale-exam-primary" type="submit" disabled={busy || !selected.length}>
          {busy ? 'Menyimpan…' : 'Jadwalkan ujian'}
        </button>
      </form>
      <h3>Ujian terjadwal</h3>
      {!exams.length && <p>Belum ada ujian yang dibuat.</p>}
      <ul className="ale-exam-list">
        {exams.map((exam) => (
          <li key={exam.exam_id}>
            <div>
              <strong>
                {exam.title} · Kelas {exam.kelas} · {
                  LABEL_JENIS_ASESMEN[
                    categories.find((category) => category.exam_id === exam.exam_id)?.assessment_type
                  ] || LABEL_JENIS_ASESMEN.umum
                }
              </strong>
              <span>{formatWaktu(exam.starts_at)}–{formatWaktu(exam.ends_at)} · {exam.duration_minutes} menit</span>
              <span>{exam.submitted_count}/{exam.participant_count} terkumpul · {exam.pending_review_count} menunggu penilaian uraian</span>
            </div>
            <span>{exam.status === 'active' ? 'Aktif' : 'Ditutup'}</span>
          </li>
        ))}
      </ul>
      <h3>Hasil peserta</h3>
      {!results.length && <p>Belum ada hasil yang dapat ditampilkan.</p>}
      <div className="ale-exam-results-wrap">
        <table className="ale-exam-results">
          <thead>
            <tr>
              <th scope="col">Siswa</th>
              <th scope="col">Ujian</th>
              <th scope="col">Dikumpulkan</th>
              <th scope="col">PG</th>
              <th scope="col">Nilai akhir</th>
            </tr>
          </thead>
          <tbody>
            {results.map((result) => (
              <tr key={result.attempt_id}>
                <td>{result.student_name}</td>
                <td>{result.title}</td>
                <td>{formatWaktu(result.submitted_at)}</td>
                <td>{result.objective_total ? `${result.objective_correct}/${result.objective_total}` : '—'}</td>
                <td>{result.grade_pending ? 'Menunggu uraian' : result.score ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <h3>Jawaban uraian menunggu penilaian</h3>
      {!reviews.length && <p>Tidak ada jawaban uraian yang menunggu penilaian.</p>}
      {reviews.map((review) => (
        <article className="ale-exam-review" key={review.attempt_id}>
          <h4>{review.student_name} · {review.title}</h4>
          <p>Kelas {review.kelas} · dikumpulkan {formatWaktu(review.submitted_at)}</p>
          {review.essay_responses.map((response, index) => (
            <div className="ale-exam-review-answer" key={`${review.attempt_id}-${index}`}>
              <strong>{response.prompt}</strong>
              <p>{response.answer || 'Tidak dijawab'}</p>
            </div>
          ))}
          <label>Nilai rata-rata seluruh jawaban uraian (0–100)
            <input
              type="number"
              min="0"
              max="100"
              step="0.01"
              value={essayScores[review.attempt_id] ?? ''}
              onChange={(event) => setEssayScores((previous) => ({
                ...previous,
                [review.attempt_id]: event.target.value,
              }))}
            />
          </label>
          <p className="ale-exam-intro">Nilai yang diberikan dirata-ratakan untuk soal uraian lalu digabung dengan nilai pilihan ganda sesuai jumlah soal.</p>
          <button
            className="ale-exam-primary"
            type="button"
            disabled={busy || essayScores[review.attempt_id] === undefined || essayScores[review.attempt_id] === ''}
            onClick={() => gradeEssay(review.attempt_id)}
          >
            Simpan nilai uraian
          </button>
        </article>
      ))}
      {error && <p className="ale-exam-error" role="alert">{error}</p>}
      {notice && <p className="ale-exam-notice" role="status">{notice}</p>}
    </section>
  );
}

export default function OnlineAssessmentPage() {
  const location = useLocation();
  const { role: baseRole, activeRole, tenantId, user } = useAuth();
  const role = activeRole || baseRole;
  const requestedType = location.pathname.split('/').pop();
  const assessmentType = ['diagnostik', 'formatif', 'sumatif'].includes(requestedType)
    ? requestedType
    : 'umum';

  if (role === 'siswa' && user?.uid) return <StudentAssessments userId={user.uid} />;
  if (isTeacherRole(role) && user?.uid && tenantId) {
    return (
      <TeacherAssessments
        tenantId={tenantId}
        userId={user.uid}
        assessmentType={assessmentType}
      />
    );
  }
  return (
    <section className="ale-exam-card">
      <h2>Ujian Online</h2>
      <p>Modul ini tersedia untuk akun guru atau siswa aktif pada sekolah yang terhubung. Akun siswa harus ditautkan terlebih dahulu oleh admin sekolah.</p>
    </section>
  );
}
