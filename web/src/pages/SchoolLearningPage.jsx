import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import {
  beriUmpanBalikTugas,
  buatJadwalMateri,
  hapusJadwalMateri,
  kirimJawabanTugas,
  muatKelasRosterGuru,
  muatPengumpulanTugasStaf,
  muatPengumpulanTugasSiswa,
  muatJadwalMateriStaf,
  muatJadwalMateriSiswa,
  ubahJadwalMateri,
} from '../services/schoolLearning.js';
import '../styles/online-assessments.css';

const STAFF_ROLES = new Set([
  'admin_sekolah', 'operator', 'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler',
]);
const TEACHER_ROLES = new Set(['guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler']);
const EMPTY_DRAFT = {
  kind: 'schedule',
  className: '',
  title: '',
  body: '',
  startsAt: '',
  dueAt: '',
  published: false,
};
const KIND_LABELS = { schedule: 'Jadwal', task: 'Tugas', material: 'Materi' };

function localInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function toIso(value) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toISOString();
}

function formatDate(value) {
  if (!value) return 'Tidak ditentukan';
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Waktu tidak valid'
    : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function draftFromItem(item) {
  return {
    kind: item.kind,
    className: item.className,
    title: item.title,
    body: item.body,
    startsAt: localInputValue(item.startsAt),
    dueAt: localInputValue(item.dueAt),
    published: item.published,
  };
}

export default function SchoolLearningPage() {
  const { pathname } = useLocation();
  const { user, role, tenantId } = useAuth();
  const isStudent = role === 'siswa';
  const canManage = STAFF_ROLES.has(role);
  const isTeacher = TEACHER_ROLES.has(role);
  const allowedKinds = useMemo(() => {
    if (pathname.endsWith('/materi') || pathname.endsWith('/bahan-ajar')) return ['material'];
    return ['schedule', 'task'];
  }, [pathname]);
  const title = isStudent
    ? allowedKinds[0] === 'material' ? 'Materi Belajar' : 'Jadwal dan Tugas'
    : allowedKinds[0] === 'material' ? 'Pengelolaan Materi Ajar' : 'Jadwal dan Tugas Sekolah';
  const [items, setItems] = useState([]);
  const [rosterClasses, setRosterClasses] = useState([]);
  const [draft, setDraft] = useState(() => ({ ...EMPTY_DRAFT, kind: allowedKinds[0] }));
  const [editingId, setEditingId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [studentSubmissions, setStudentSubmissions] = useState({});
  const [answerDrafts, setAnswerDrafts] = useState({});
  const [taskSubmissions, setTaskSubmissions] = useState({});
  const [expandedTaskId, setExpandedTaskId] = useState('');
  const [loadingTaskId, setLoadingTaskId] = useState('');
  const [savingTaskId, setSavingTaskId] = useState('');
  const [feedbackDrafts, setFeedbackDrafts] = useState({});
  const [savingFeedbackId, setSavingFeedbackId] = useState('');

  useEffect(() => {
    setDraft({ ...EMPTY_DRAFT, kind: allowedKinds[0] });
    setEditingId('');
  }, [allowedKinds]);

  const loadData = useCallback(async () => {
    const [rows, submissions, classes] = isStudent
      ? await Promise.all([
        muatJadwalMateriSiswa(),
        allowedKinds.includes('task') ? muatPengumpulanTugasSiswa() : Promise.resolve([]),
      ]).then(([itemsForStudent, taskSubmissions]) => [itemsForStudent, taskSubmissions, []])
      : await Promise.all([
        muatJadwalMateriStaf(tenantId),
        isTeacher ? muatKelasRosterGuru(tenantId, user?.uid) : Promise.resolve([]),
      ]).then(([staffItems, classesForTeacher]) => [staffItems, null, classesForTeacher]);
    return {
      rows: rows.filter((item) => allowedKinds.includes(item.kind)),
      submissions,
      classes,
    };
  }, [allowedKinds, isStudent, isTeacher, tenantId, user?.uid]);

  const refresh = useCallback(async () => {
    setError('');
    const { rows, submissions, classes } = await loadData();
    setItems(rows);
    setRosterClasses(classes);
    if (isStudent) {
      setStudentSubmissions(Object.fromEntries(submissions.map((submission) => [
        submission.taskId,
        submission,
      ])));
    }
  }, [isStudent, loadData]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    if (!isStudent && !tenantId) {
      setLoading(false);
      return undefined;
    }
    loadData()
      .then(({ rows, submissions, classes }) => {
        if (!active) return;
        setItems(rows);
        setRosterClasses(classes);
        if (isStudent) {
          setStudentSubmissions(Object.fromEntries(submissions.map((submission) => [
            submission.taskId,
            submission,
          ])));
        }
      })
      .catch((loadError) => {
        console.error('[school-learning] Gagal memuat jadwal atau materi:', loadError);
        if (active) setError(loadError.message || 'Jadwal dan materi gagal dimuat.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [isStudent, tenantId, loadData]);

  const reset = () => {
    setDraft({
      ...EMPTY_DRAFT,
      kind: allowedKinds[0],
      className: isTeacher ? rosterClasses[0] || '' : '',
    });
    setEditingId('');
  };

  const save = async (event) => {
    event.preventDefault();
    if (!canManage) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const values = {
        ...draft,
        startsAt: toIso(draft.startsAt),
        dueAt: toIso(draft.dueAt),
      };
      if (editingId) {
        await ubahJadwalMateri(tenantId, editingId, user?.uid, values);
        setNotice('Jadwal atau materi berhasil diperbarui.');
      } else {
        await buatJadwalMateri(tenantId, user?.uid, values);
        setNotice(draft.published ? 'Kegiatan belajar berhasil diterbitkan.' : 'Draf berhasil disimpan.');
      }
      reset();
      await refresh();
    } catch (saveError) {
      setError(saveError.message || 'Jadwal atau materi tidak dapat disimpan.');
    } finally {
      setSaving(false);
    }
  };

  const edit = (item) => {
    setEditingId(item.id);
    setDraft(draftFromItem(item));
    setError('');
    setNotice('');
  };

  const remove = async (item) => {
    if (!canManage || !globalThis.confirm(`Hapus ${KIND_LABELS[item.kind].toLowerCase()} "${item.title}"?`)) {
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await hapusJadwalMateri(tenantId, item.id);
      if (editingId === item.id) reset();
      setNotice('Kegiatan belajar berhasil dihapus.');
      await refresh();
    } catch (deleteError) {
      setError(deleteError.message || 'Kegiatan belajar tidak dapat dihapus.');
    } finally {
      setSaving(false);
    }
  };

  const submitTask = async (taskId) => {
    setSavingTaskId(taskId);
    setError('');
    setNotice('');
    try {
      await kirimJawabanTugas(taskId, answerDrafts[taskId] ?? studentSubmissions[taskId]?.answer ?? '');
      await refresh();
      setNotice('Jawaban berhasil dikumpulkan. Anda dapat memperbaruinya sebelum tenggat.');
    } catch (submitError) {
      setError(submitError.message || 'Jawaban tidak dapat dikumpulkan.');
    } finally {
      setSavingTaskId('');
    }
  };

  const toggleTaskSubmissions = async (taskId) => {
    if (expandedTaskId === taskId) {
      setExpandedTaskId('');
      return;
    }
    setExpandedTaskId(taskId);
    setLoadingTaskId(taskId);
    setError('');
    try {
      const rows = await muatPengumpulanTugasStaf(taskId);
      setTaskSubmissions((current) => ({ ...current, [taskId]: rows }));
      setFeedbackDrafts((current) => ({
        ...current,
        ...Object.fromEntries(rows.map((submission) => [
          submission.id,
          current[submission.id] ?? submission.feedback ?? '',
        ])),
      }));
    } catch (loadError) {
      setError(loadError.message || 'Daftar pengumpulan tidak dapat dimuat.');
    } finally {
      setLoadingTaskId('');
    }
  };

  const saveFeedback = async (submissionId) => {
    setSavingFeedbackId(submissionId);
    setError('');
    setNotice('');
    try {
      await beriUmpanBalikTugas(submissionId, feedbackDrafts[submissionId] ?? '');
      if (expandedTaskId) {
        const rows = await muatPengumpulanTugasStaf(expandedTaskId);
        setTaskSubmissions((current) => ({ ...current, [expandedTaskId]: rows }));
      }
      setNotice('Umpan balik tersimpan.');
    } catch (reviewError) {
      setError(reviewError.message || 'Umpan balik tidak dapat disimpan.');
    } finally {
      setSavingFeedbackId('');
    }
  };

  if (!isStudent && !canManage) {
    return <section className="ale-exam-card" role="alert">Akses ke modul pembelajaran tidak tersedia.</section>;
  }
  if (!isStudent && !tenantId) {
    return (
      <section className="ale-exam-card" role="alert">
        <h2>{title}</h2>
        <p>Akun belum terhubung ke sekolah yang aktif.</p>
      </section>
    );
  }

  return (
    <section className="ale-exam-card" aria-labelledby="school-learning-title">
      <p className="ale-exam-kicker">Pembelajaran sekolah</p>
      <h2 id="school-learning-title">{title}</h2>
      <p className="ale-exam-intro">
        {isStudent
          ? 'Yang ditampilkan hanya kegiatan terbit untuk kelas siswa yang terhubung ke akun ini.'
          : isTeacher
            ? 'Buat jadwal, tugas, atau materi berbasis teks untuk kelas pada roster akun Anda. Akses siswa dibatasi oleh tautan akun dan kelas di database.'
            : 'Buat jadwal, tugas, atau materi berbasis teks untuk kelas di sekolah aktif. Akses siswa dibatasi oleh tautan akun dan kelas di database.'}
      </p>
      {error && <p className="ale-exam-error" role="alert">{error}</p>}
      {notice && <p className="ale-exam-notice" role="status">{notice}</p>}
      {canManage && (
        <form className="ale-exam-form" onSubmit={save}>
          {allowedKinds.length > 1 && (
            <label>Jenis kegiatan
              <select
                value={draft.kind}
                onChange={(event) => setDraft((current) => ({ ...current, kind: event.target.value }))}
                disabled={Boolean(editingId)}
              >
                {allowedKinds.map((kind) => <option key={kind} value={kind}>{KIND_LABELS[kind]}</option>)}
              </select>
            </label>
          )}
          <label>Kelas
            {isTeacher ? (
              <select
                required
                value={draft.className}
                disabled={loading || rosterClasses.length === 0 || saving}
                onChange={(event) => setDraft((current) => ({ ...current, className: event.target.value }))}
              >
                <option value="">Pilih kelas pada roster Anda</option>
                {rosterClasses.map((className) => <option key={className} value={className}>{className}</option>)}
              </select>
            ) : (
              <input
                required
                maxLength={30}
                value={draft.className}
                onChange={(event) => setDraft((current) => ({ ...current, className: event.target.value }))}
                placeholder="Contoh: 7A"
              />
            )}
          </label>
          <label>Judul
            <input
              required
              maxLength={200}
              value={draft.title}
              onChange={(event) => setDraft((current) => ({ ...current, title: event.target.value }))}
            />
          </label>
          <label>Informasi pembelajaran
            <textarea
              required
              maxLength={10000}
              rows={5}
              value={draft.body}
              onChange={(event) => setDraft((current) => ({ ...current, body: event.target.value }))}
            />
          </label>
          {draft.kind === 'schedule' && (
            <label>Waktu kegiatan
              <input
                required
                type="datetime-local"
                value={draft.startsAt}
                onChange={(event) => setDraft((current) => ({ ...current, startsAt: event.target.value }))}
              />
            </label>
          )}
          {draft.kind === 'task' && (
            <label>Tenggat pengumpulan
              <input
                required
                type="datetime-local"
                value={draft.dueAt}
                onChange={(event) => setDraft((current) => ({ ...current, dueAt: event.target.value }))}
              />
            </label>
          )}
          <label className="ale-learning-publish">
            <input
              type="checkbox"
              checked={draft.published}
              onChange={(event) => setDraft((current) => ({ ...current, published: event.target.checked }))}
            />
            Terbitkan agar dapat dilihat siswa
          </label>
          <div>
            <button
              className="ale-exam-primary"
              type="submit"
              disabled={saving || loading || (isTeacher && rosterClasses.length === 0)}
            >
              {saving ? 'Menyimpan…' : editingId ? 'Simpan perubahan' : 'Simpan'}
            </button>
            {editingId && (
              <button className="ale-exam-secondary" type="button" disabled={saving} onClick={reset}>
                Batal
              </button>
            )}
          </div>
        </form>
      )}
      {loading && <p role="status">Memuat jadwal dan materi…</p>}
      {!loading && !error && items.length === 0 && (
        <p>{isStudent
          ? 'Belum ada kegiatan belajar terbit untuk akun dan kelas Anda.'
          : 'Belum ada kegiatan belajar untuk ditampilkan.'}</p>
      )}
      {!loading && !error && items.length > 0 && (
        <ul className="ale-exam-list">
          {items.map((item) => (
            <li key={item.id} className="ale-learning-item">
              <div>
                <span>{KIND_LABELS[item.kind]} · Kelas {item.className} · {item.published ? 'Terbit' : 'Draf'}</span>
                <strong>{item.title}</strong>
                <p>{item.body}</p>
                {item.startsAt && <span>Waktu: {formatDate(item.startsAt)}</span>}
                {item.dueAt && <span>Tenggat: {formatDate(item.dueAt)}</span>}
                {isStudent && item.kind === 'task' && (() => {
                  const submission = studentSubmissions[item.id];
                  const expired = item.dueAt && new Date(item.dueAt).getTime() < Date.now();
                  return (
                    <div className="ale-learning-submission">
                      {submission && (
                        <p role="status">
                          Terkumpul {formatDate(submission.submittedAt)}
                          {submission.reviewedAt ? ` · Ditinjau ${formatDate(submission.reviewedAt)}` : ''}
                        </p>
                      )}
                      {submission?.feedback && (
                        <p className="ale-learning-feedback"><strong>Umpan balik guru:</strong> {submission.feedback}</p>
                      )}
                      <label>Jawaban tugas
                        <textarea
                          rows={4}
                          maxLength={10000}
                          value={answerDrafts[item.id] ?? submission?.answer ?? ''}
                          onChange={(event) => setAnswerDrafts((current) => ({
                            ...current,
                            [item.id]: event.target.value,
                          }))}
                          disabled={Boolean(expired) || savingTaskId === item.id}
                          placeholder="Tulis jawaban Anda di sini"
                        />
                      </label>
                      <button
                        className="ale-exam-primary"
                        type="button"
                        disabled={Boolean(expired) || savingTaskId === item.id}
                        onClick={() => submitTask(item.id)}
                      >
                        {expired ? 'Tenggat berakhir' : savingTaskId === item.id
                          ? 'Mengirim…'
                          : submission ? 'Perbarui jawaban' : 'Kumpulkan tugas'}
                      </button>
                    </div>
                  );
                })()}
              </div>
              {canManage && (
                <div>
                  <button type="button" disabled={saving} onClick={() => edit(item)}>Ubah</button>
                  <button type="button" disabled={saving} onClick={() => remove(item)}>Hapus</button>
                  {item.kind === 'task' && item.published && (
                    <button
                      type="button"
                      disabled={loadingTaskId === item.id}
                      onClick={() => toggleTaskSubmissions(item.id)}
                    >
                      {loadingTaskId === item.id ? 'Memuat…'
                        : expandedTaskId === item.id ? 'Tutup pengumpulan' : 'Tinjau jawaban'}
                    </button>
                  )}
                </div>
              )}
              {canManage && item.kind === 'task' && expandedTaskId === item.id && (
                <div className="ale-learning-reviews">
                  {(taskSubmissions[item.id] || []).length === 0
                    ? <p>Belum ada jawaban yang dikumpulkan.</p>
                    : taskSubmissions[item.id].map((submission) => (
                      <article key={submission.id} className="ale-learning-review">
                        <strong>{submission.studentName} · Kelas {submission.className}</strong>
                        <span>Dikumpulkan {formatDate(submission.submittedAt)}</span>
                        <p>{submission.answer}</p>
                        <label>Umpan balik
                          <textarea
                            rows={3}
                            maxLength={5000}
                            value={feedbackDrafts[submission.id] ?? ''}
                            onChange={(event) => setFeedbackDrafts((current) => ({
                              ...current,
                              [submission.id]: event.target.value,
                            }))}
                          />
                        </label>
                        <button
                          className="ale-exam-secondary"
                          type="button"
                          disabled={savingFeedbackId === submission.id}
                          onClick={() => saveFeedback(submission.id)}
                        >
                          {savingFeedbackId === submission.id ? 'Menyimpan…' : 'Simpan umpan balik'}
                        </button>
                      </article>
                    ))}
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
