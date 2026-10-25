import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { isTeacherRole } from '../services/roleAccess.js';
import { muatDaftarRuangKelas } from '../services/learningClassrooms.js';
import {
  buatRubrikKelas,
  buatVersiRubrikKelas,
  muatRubrikKelas,
} from '../services/classroomRubrics.js';
import '../styles/classroom-rubrics.css';

const LEVELS = [
  ['1', 'Perlu bimbingan'],
  ['2', 'Mulai berkembang'],
  ['3', 'Sesuai harapan'],
  ['4', 'Sangat baik'],
];

const KRITERIA_AWAL = {
  name: '',
  levels: { '1': '', '2': '', '3': '', '4': '' },
};

const FORM_AWAL = {
  classroomId: '',
  title: '',
  summary: '',
  criteria: [{ ...KRITERIA_AWAL, levels: { ...KRITERIA_AWAL.levels } }],
};

function tanggal(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Tanggal tidak tersedia'
    : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium' }).format(date);
}

export default function ClassroomRubricsPage() {
  const { user, role, activeRole, tenantId } = useAuth();
  const currentRole = activeRole || role;
  const canUse = isTeacherRole(currentRole);
  const [classes, setClasses] = useState([]);
  const [rubrics, setRubrics] = useState([]);
  const [form, setForm] = useState(FORM_AWAL);
  const [revisionId, setRevisionId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const load = useCallback(async () => {
    if (!canUse || !user?.uid || !tenantId) {
      setClasses([]);
      setRubrics([]);
      setError('Pustaka rubrik memerlukan akun guru aktif dan tenant sekolah.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const [availableClasses, availableRubrics] = await Promise.all([
        muatDaftarRuangKelas(tenantId),
        muatRubrikKelas(tenantId, user.uid),
      ]);
      setClasses(availableClasses);
      setRubrics(availableRubrics);
      setForm((current) => ({
        ...current,
        classroomId: availableClasses.some((room) => room.id === current.classroomId)
          ? current.classroomId
          : availableClasses[0]?.id || '',
      }));
    } catch (cause) {
      console.error('[classroom-rubrics] Gagal memuat pustaka rubrik:', cause);
      setError('Rubrik atau kelas belum dapat dimuat. Periksa koneksi, akses kelas, dan status migrasi database.');
    } finally {
      setLoading(false);
    }
  }, [canUse, tenantId, user?.uid]);

  useEffect(() => { load(); }, [load]);

  const classById = useMemo(
    () => new Map(classes.map((room) => [room.id, room])),
    [classes],
  );

  function resetForm() {
    setForm({
      ...FORM_AWAL,
      classroomId: classes[0]?.id || '',
      criteria: [{ ...KRITERIA_AWAL, levels: { ...KRITERIA_AWAL.levels } }],
    });
    setRevisionId('');
    setError('');
    setNotice('');
  }

  function prepareRevision(rubric) {
    const newest = rubric.versi[0];
    if (!newest || rubric.pemilikId !== user?.uid) return;
    setForm({
      classroomId: rubric.classroomId,
      title: rubric.judul,
      summary: newest.ringkasan,
      criteria: newest.kriteria.map((criterion) => ({
        name: criterion.name,
        levels: { ...criterion.levels },
      })),
    });
    setRevisionId(rubric.id);
    setError('');
    setNotice('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }

  function updateCriterion(index, field, value, level) {
    setForm((current) => ({
      ...current,
      criteria: current.criteria.map((criterion, criterionIndex) => {
        if (criterionIndex !== index) return criterion;
        if (field === 'name') return { ...criterion, name: value };
        return {
          ...criterion,
          levels: { ...criterion.levels, [level]: value },
        };
      }),
    }));
  }

  function addCriterion() {
    setForm((current) => {
      if (current.criteria.length >= 12) return current;
      return {
        ...current,
        criteria: [...current.criteria, {
          ...KRITERIA_AWAL,
          levels: { ...KRITERIA_AWAL.levels },
        }],
      };
    });
  }

  async function save(event) {
    event.preventDefault();
    if (!canUse || !user?.uid || !tenantId) {
      setError('Hanya guru aktif pada tenant sekolah yang dapat mengelola rubrik.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (revisionId) {
        const version = await buatVersiRubrikKelas(
          tenantId, user.uid, revisionId, form,
        );
        setForm({
          ...FORM_AWAL,
          classroomId: classes[0]?.id || '',
          criteria: [{ ...KRITERIA_AWAL, levels: { ...KRITERIA_AWAL.levels } }],
        });
        setRevisionId('');
        setNotice(`Versi ${version} berhasil disimpan. Versi sebelumnya tetap tersimpan.`);
      } else {
        await buatRubrikKelas(tenantId, user.uid, form);
        setForm({
          ...FORM_AWAL,
          classroomId: classes[0]?.id || '',
          criteria: [{ ...KRITERIA_AWAL, levels: { ...KRITERIA_AWAL.levels } }],
        });
        setRevisionId('');
        setNotice('Rubrik dan versi pertama berhasil disimpan.');
      }
      await load();
    } catch (cause) {
      console.error('[classroom-rubrics] Gagal menyimpan rubrik:', cause);
      setError(cause instanceof Error
        ? cause.message
        : 'Rubrik tidak dapat disimpan. Periksa penugasan kelas dan konfigurasi database.');
    } finally {
      setSaving(false);
    }
  }

  if (!canUse) {
    return (
      <main className="classroom-rubrics-page">
        <h1>Rubrik &amp; Instrumen</h1>
        <p role="alert">Halaman ini hanya tersedia untuk peran guru.</p>
      </main>
    );
  }

  return (
    <main className="classroom-rubrics-page">
      <header className="classroom-rubrics-header">
        <p className="classroom-rubrics-kicker">Asesmen dan penilaian</p>
        <h1>Rubrik &amp; Instrumen</h1>
        <p>
          Susun kriteria dengan empat deskripsi tingkat capaian untuk kelas yang
          Anda ampu. Setiap revisi tersimpan sebagai versi baru dan tidak
          mengubah versi sebelumnya.
        </p>
      </header>

      {error && <p className="classroom-rubrics-message is-error" role="alert">{error}</p>}
      {notice && <p className="classroom-rubrics-message is-success" role="status">{notice}</p>}

      <section className="classroom-rubrics-editor" aria-labelledby="rubric-editor-title">
        <div className="classroom-rubrics-section-heading">
          <div>
            <p className="classroom-rubrics-kicker">{revisionId ? 'Riwayat versi' : 'Instrumen baru'}</p>
            <h2 id="rubric-editor-title">{revisionId ? 'Buat revisi rubrik' : 'Buat rubrik'}</h2>
          </div>
          {revisionId && (
            <button type="button" className="rubric-button is-secondary" onClick={resetForm}>
              Batal revisi
            </button>
          )}
        </div>
        <p className="classroom-rubrics-note">
          Jangan masukkan nama siswa atau catatan konseling, kesehatan, dan
          informasi pribadi ke dalam instrumen.
        </p>
        <form onSubmit={save}>
          <div className="classroom-rubrics-fields">
            <label>
              Kelas yang diampu
              <select
                required
                value={form.classroomId}
                onChange={(event) => setForm((current) => ({
                  ...current, classroomId: event.target.value,
                }))}
                disabled={loading || saving || Boolean(revisionId)}
              >
                <option value="">Pilih kelas</option>
                {classes.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.nama}{room.mapel ? ` · ${room.mapel}` : ''}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Nama rubrik
              <input
                required
                maxLength={160}
                value={form.title}
                onChange={(event) => setForm((current) => ({
                  ...current, title: event.target.value,
                }))}
              />
            </label>
            <label className="classroom-rubrics-wide">
              Tujuan atau ringkasan penggunaan
              <textarea
                maxLength={2000}
                rows={3}
                value={form.summary}
                onChange={(event) => setForm((current) => ({
                  ...current, summary: event.target.value,
                }))}
              />
            </label>
          </div>

          <div className="classroom-rubric-criteria-list">
            {form.criteria.map((criterion, index) => (
              <fieldset className="classroom-rubric-criterion" key={index}>
                <legend>Kriteria {index + 1}</legend>
                <label>
                  Nama kriteria
                  <input
                    required
                    maxLength={120}
                    value={criterion.name}
                    onChange={(event) => updateCriterion(index, 'name', event.target.value)}
                  />
                </label>
                <div className="classroom-rubric-levels">
                  {LEVELS.map(([key, label]) => (
                    <label key={key}>
                      <span>Level {key} · {label}</span>
                      <textarea
                        required
                        maxLength={500}
                        rows={3}
                        value={criterion.levels[key]}
                        onChange={(event) => updateCriterion(
                          index, 'level', event.target.value, key,
                        )}
                      />
                    </label>
                  ))}
                </div>
              </fieldset>
            ))}
          </div>

          <div className="classroom-rubrics-actions">
            <button
              type="button"
              className="rubric-button is-secondary"
              onClick={addCriterion}
              disabled={saving || form.criteria.length >= 12}
            >
              Tambah kriteria
            </button>
            <button
              type="submit"
              className="rubric-button"
              disabled={loading || saving || classes.length === 0}
            >
              {saving ? 'Menyimpan…' : revisionId ? 'Simpan versi baru' : 'Simpan rubrik'}
            </button>
          </div>
          {classes.length === 0 && !loading && (
            <p className="classroom-rubrics-empty">
              Belum ada kelas yang dapat dipilih. Pastikan akun guru telah
              ditugaskan sebagai guru kelas pada Ruang Kelas.
            </p>
          )}
        </form>
      </section>

      <section className="classroom-rubrics-list" aria-labelledby="rubric-list-title">
        <div className="classroom-rubrics-section-heading">
          <div>
            <p className="classroom-rubrics-kicker">Kelas yang ditugaskan</p>
            <h2 id="rubric-list-title">Pustaka rubrik</h2>
          </div>
          <button type="button" className="rubric-button is-secondary" onClick={load} disabled={loading}>
            {loading ? 'Memuat…' : 'Muat ulang'}
          </button>
        </div>
        {loading ? (
          <p aria-live="polite">Memuat rubrik…</p>
        ) : rubrics.length === 0 ? (
          <p className="classroom-rubrics-empty">
            Belum ada rubrik untuk kelas yang dapat Anda akses. Rubrik yang
            dibuat guru lain hanya dapat dibaca oleh guru yang ditugaskan pada
            kelas yang sama.
          </p>
        ) : (
          <div className="classroom-rubric-cards">
            {rubrics.map((rubric) => {
              const newest = rubric.versi[0];
              const room = classById.get(rubric.classroomId);
              return (
                <article className="classroom-rubric-card" key={rubric.id}>
                  <div className="classroom-rubric-card-heading">
                    <div>
                      <p className="classroom-rubrics-kicker">
                        {room ? `${room.nama}${room.mapel ? ` · ${room.mapel}` : ''}` : 'Kelas'}
                      </p>
                      <h3>{rubric.judul}</h3>
                    </div>
                    <span className="classroom-rubric-version">
                      {newest ? `Versi ${newest.versi}` : 'Versi belum tersedia'}
                    </span>
                  </div>
                  {newest && (
                    <>
                      {newest.ringkasan && <p>{newest.ringkasan}</p>}
                      <p className="classroom-rubric-meta">
                        Diperbarui {tanggal(newest.dibuatPada)} · {newest.kriteria.length} kriteria
                      </p>
                      <ol className="classroom-rubric-criteria-preview">
                        {newest.kriteria.map((criterion, index) => (
                          <li key={`${criterion.name}-${index}`}>
                            <strong>{criterion.name}</strong>
                            <span>{criterion.levels['1']} → {criterion.levels['4']}</span>
                          </li>
                        ))}
                      </ol>
                    </>
                  )}
                  {rubric.versi.length > 1 && (
                    <details className="classroom-rubric-history">
                      <summary>Riwayat versi ({rubric.versi.length} terbaru)</summary>
                      <ol>
                        {rubric.versi.map((version) => (
                          <li key={version.id}>
                            <strong>Versi {version.versi} · {tanggal(version.dibuatPada)}</strong>
                            {version.ringkasan && <p>{version.ringkasan}</p>}
                            <ul>
                              {version.kriteria.map((criterion, index) => (
                                <li key={`${criterion.name}-${index}`}>
                                  <strong>{criterion.name}</strong>
                                  <span>{criterion.levels['1']} → {criterion.levels['4']}</span>
                                </li>
                              ))}
                            </ul>
                          </li>
                        ))}
                      </ol>
                    </details>
                  )}
                  {rubric.pemilikId === user?.uid && (
                    <button
                      type="button"
                      className="rubric-button is-secondary"
                      onClick={() => prepareRevision(rubric)}
                    >
                      Buat revisi
                    </button>
                  )}
                </article>
              );
            })}
          </div>
        )}
      </section>

      <aside className="classroom-rubrics-disclaimer">
        Rubrik ini adalah instrumen kerja guru; fitur belum memberi skor siswa,
        menyimpan bukti penilaian individual, atau menerbitkan nilai resmi.
        Untuk menggunakan instrumen dalam penilaian, ikuti prosedur dan
        persetujuan sekolah.
      </aside>
    </main>
  );
}
