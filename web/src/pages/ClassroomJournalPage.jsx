import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { PERAN_GURU_KELAS, muatDaftarRuangKelas } from '../services/learningClassrooms.js';
import {
  createClassroomJournal,
  deleteClassroomJournal,
  listClassroomJournals,
  updateClassroomJournal,
} from '../services/classroomJournals.js';
import { daftarArsipPerencanaan } from './perencanaan/services/repository.js';
import '../styles/classroom-journals.css';

const JENIS_RENCANA = {
  rpe: 'RPE',
  atp: 'ATP',
  prota: 'Program Tahunan',
  prosem: 'Program Semester',
  kktp: 'KKTP',
  modul: 'Modul Ajar',
};

function hariIni() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function tanggal(value) {
  return new Intl.DateTimeFormat('id-ID', { dateStyle: 'long' }).format(
    new Date(`${value}T00:00:00`),
  );
}

const FORM_AWAL = {
  lessonDate: hariIni(),
  topic: '',
  objectives: '',
  activities: '',
  reflection: '',
  followUp: '',
  planningRef: null,
};

const TUJUAN_CATATAN_CEPAT = 'Tujuan pembelajaran belum dicatat melalui Catatan Kelas Cepat.';

function kunciRencana(reference) {
  if (!reference) return '';
  return `${reference.packageId}:${reference.documentType}:${reference.unit || ''}`;
}

function labelRencana(plan) {
  const type = JENIS_RENCANA[plan.jenis] || plan.jenis;
  return `${type}${plan.noUnit ? ` · Unit ${plan.noUnit}` : ''} — ${plan.mapel || 'Mapel tidak tercatat'} · ${plan.kelas || 'Kelas tidak tercatat'} · ${plan.tahunAjaran || 'Tahun ajaran tidak tercatat'}`;
}

function labelRencanaTerkait(reference, plans) {
  const plan = plans.find((item) => kunciRencana({
    packageId: item.paketId,
    documentType: item.jenis,
    unit: item.jenis === 'modul' ? String(item.noUnit) : null,
  }) === kunciRencana(reference));
  if (plan) return labelRencana(plan);
  const type = JENIS_RENCANA[reference.documentType] || reference.documentType;
  return `${type}${reference.unit ? ` · Unit ${reference.unit}` : ''} — referensi arsip`;
}

export default function ClassroomJournalPage({
  quickMode = false,
  realizationMode = false,
}) {
  const { user, role, activeRole, tenantId } = useAuth();
  const currentRole = activeRole || role;
  const canUse = PERAN_GURU_KELAS.includes(currentRole);
  const context = useMemo(() => ({
    userId: user?.uid,
    role,
    activeRole: currentRole,
    tenantId,
  }), [currentRole, role, tenantId, user?.uid]);
  const [classes, setClasses] = useState([]);
  const [selectedClassId, setSelectedClassId] = useState('');
  const [entries, setEntries] = useState([]);
  const [plans, setPlans] = useState([]);
  const [form, setForm] = useState(FORM_AWAL);
  const [editingId, setEditingId] = useState('');
  const [search, setSearch] = useState('');
  const [filterDate, setFilterDate] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    if (!canUse || !user?.uid || !tenantId) {
      setClasses([]);
      setEntries([]);
      setPlans([]);
      setError('Jurnal mengajar memerlukan akun guru aktif dan tenant sekolah.');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError('');
    try {
      const availableClasses = await muatDaftarRuangKelas(tenantId);
      const [assigned, availablePlans] = await Promise.all([
        Promise.all(availableClasses.map(async (room) => ({
          room,
          journals: await listClassroomJournals(context, room.id),
        }))),
        realizationMode ? daftarArsipPerencanaan(user.uid) : Promise.resolve([]),
      ]);
      if (!Array.isArray(availablePlans)) {
        throw new Error('Daftar arsip perencanaan yang diterima tidak valid.');
      }
      if (availablePlans.some((plan) => !plan ||
          typeof plan.paketId !== 'string' || !plan.paketId.trim() ||
          !Object.hasOwn(JENIS_RENCANA, plan.jenis) ||
          (plan.jenis === 'modul' && !String(plan.noUnit ?? '').trim()))) {
        throw new Error('Dokumen pada arsip perencanaan memiliki identitas yang tidak valid.');
      }
      setClasses(availableClasses);
      setPlans(availablePlans);
      setEntries(assigned.flatMap(({ room, journals }) =>
        journals.map((journal) => ({ ...journal, classroomName: room.nama, classroomSubject: room.mapel }))));
      setSelectedClassId((current) =>
        availableClasses.some((room) => room.id === current)
          ? current
          : availableClasses[0]?.id || '');
    } catch (cause) {
      console.error('[classroom-journals] Gagal memuat jurnal mengajar:', cause);
      setError(cause instanceof Error
        ? cause.message
        : 'Jurnal mengajar tidak dapat dimuat. Periksa koneksi dan izin kelas.');
    } finally {
      setLoading(false);
    }
  }, [canUse, context, realizationMode, tenantId, user?.uid]);

  useEffect(() => {
    void load();
  }, [load]);

  function resetForm() {
    setForm({ ...FORM_AWAL, lessonDate: hariIni() });
    setEditingId('');
  }

  async function submit(event) {
    event.preventDefault();
    if (!selectedClassId) {
      setError('Pilih kelas yang ditugaskan sebelum menyimpan jurnal.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const journalInput = quickMode && !form.objectives.trim()
        ? { ...form, objectives: TUJUAN_CATATAN_CEPAT }
        : form;
      const saved = editingId
        ? await updateClassroomJournal(context, selectedClassId, editingId, journalInput)
        : await createClassroomJournal(context, selectedClassId, journalInput);
      const classroom = classes.find((room) => room.id === selectedClassId);
      setEntries((current) => [
        {
          ...saved,
          classroomName: classroom?.nama || '',
          classroomSubject: classroom?.mapel || '',
        },
        ...current.filter((entry) => entry.id !== saved.id),
      ].sort((a, b) => b.lessonDate.localeCompare(a.lessonDate)));
      resetForm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Jurnal mengajar gagal disimpan.');
    } finally {
      setSaving(false);
    }
  }

  function edit(entry) {
    setSelectedClassId(entry.classroomId);
    setEditingId(entry.id);
    setForm({
      lessonDate: entry.lessonDate,
      topic: entry.topic,
      objectives: entry.objectives,
      activities: entry.activities,
      reflection: entry.reflection,
      followUp: entry.followUp,
      planningRef: entry.planningRef,
    });
    document.getElementById('classroom-journal-topic')?.focus();
  }

  async function remove(entry) {
    if (!window.confirm(`Hapus jurnal "${entry.topic}" dari ${entry.classroomName}?`)) return;
    setError('');
    try {
      await deleteClassroomJournal(context, entry.classroomId, entry.id);
      setEntries((current) => current.filter((item) => item.id !== entry.id));
      if (editingId === entry.id) resetForm();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Jurnal mengajar gagal dihapus.');
    }
  }

  const visibleEntries = entries.filter((entry) => {
    const matchesDate = !filterDate || entry.lessonDate === filterDate;
    const content = `${entry.topic} ${entry.objectives} ${entry.activities} ${entry.reflection} ${entry.followUp} ${entry.classroomName} ${entry.classroomSubject}`
      .toLocaleLowerCase('id');
    return matchesDate && content.includes(search.trim().toLocaleLowerCase('id'));
  });

  if (!canUse) {
    return (
      <main className="ale-journals">
        <section className="ale-journals-error" role="alert">
          <h1>Akses jurnal mengajar dibatasi</h1>
          <p>Jurnal hanya tersedia untuk guru yang ditugaskan ke kelasnya.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="ale-journals">
      <header className="ale-journals-hero">
        <p className="ale-journals-kicker">Pelaksanaan pembelajaran</p>
        <h1>
          {realizationMode
            ? 'Realisasi terhadap Rencana'
            : quickMode ? 'Catatan Kelas Cepat' : 'Jurnal Mengajar'}
        </h1>
        <p>
          {realizationMode
            ? 'Hubungkan jurnal pelaksanaan dengan dokumen perencanaan milik Anda. Kecocokan dipilih manual dan bukan validasi atau pengesahan resmi.'
            : quickMode
              ? 'Catat topik dan kegiatan kelas dengan ringkas. Catatan disimpan sebagai jurnal kelas yang sama dan langsung muncul pada riwayat serta laporan aktivitas.'
              : 'Dokumentasikan pembelajaran berdasarkan kelas yang ditugaskan kepada Anda. Jurnal ini terpisah dari presensi, nilai, dan laporan resmi.'}
        </p>
        <nav className="ale-journals-actions" aria-label="Modul kelas terkait">
          {realizationMode ? (
            <>
              <a href="#/pelaksanaan/jurnal">Buka jurnal mengajar</a>
              <a href="#/laporan/arsip-perencanaan">Buka arsip perencanaan</a>
            </>
          ) : quickMode ? (
            <a href="#/pelaksanaan/jurnal">Buka jurnal lengkap</a>
          ) : (
            <>
              <a href="#/pelaksanaan/catatan-cepat">Buat catatan cepat</a>
              <a href="#/pelaksanaan/realisasi">Catat realisasi rencana</a>
            </>
          )}
          <a href="#/laporan/harian-bulanan">Buka laporan aktivitas kelas</a>
          <a href="#/ruang-kelas">Buka Ruang Kelas</a>
        </nav>
      </header>

      <div className="ale-journals-privacy">
        Jurnal ini dapat dibaca dan dikelola oleh akun guru penulis yang masih ditugaskan
        ke kelas tersebut. Jangan masukkan kredensial, data kesehatan, atau informasi
        identitas pribadi siswa.
      </div>

      {error && (
        <div className="ale-journals-error" role="alert">
          <span>{error}</span>
          <button type="button" className="secondary" onClick={() => void load()} disabled={loading}>
            Coba lagi
          </button>
        </div>
      )}

      <div className="ale-journals-layout">
        <form className="ale-journals-form" onSubmit={submit}>
          <h2>
            {editingId ? 'Ubah jurnal' : realizationMode
              ? 'Catat pelaksanaan dan pilih rencana'
              : quickMode ? 'Catat aktivitas kelas' : 'Catat pembelajaran'}
          </h2>
          <label htmlFor="classroom-journal-class">Kelas yang ditugaskan</label>
          <select
            id="classroom-journal-class"
            required
            value={selectedClassId}
            onChange={(event) => {
              setSelectedClassId(event.target.value);
              setEditingId('');
            }}
            disabled={loading || classes.length === 0}
          >
            <option value="">Pilih kelas</option>
            {classes.map((room) => (
              <option key={room.id} value={room.id}>
                {room.nama}{room.mapel ? ` · ${room.mapel}` : ''}
              </option>
            ))}
          </select>
          <label htmlFor="classroom-journal-date">Tanggal pembelajaran</label>
          <input
            id="classroom-journal-date"
            type="date"
            required
            value={form.lessonDate}
            onChange={(event) => setForm({ ...form, lessonDate: event.target.value })}
          />
          <label htmlFor="classroom-journal-topic">Topik / materi</label>
          <input
            id="classroom-journal-topic"
            required
            maxLength={200}
            value={form.topic}
            onChange={(event) => setForm({ ...form, topic: event.target.value })}
            placeholder="Topik pembelajaran"
          />
          {realizationMode && (
            <>
              <label htmlFor="classroom-journal-plan">Dokumen rencana terkait</label>
              <select
                id="classroom-journal-plan"
                required
                value={kunciRencana(form.planningRef)}
                onChange={(event) => {
                  const plan = plans.find((item) => kunciRencana({
                    packageId: item.paketId,
                    documentType: item.jenis,
                    unit: item.jenis === 'modul' ? String(item.noUnit) : null,
                  }) === event.target.value);
                  setForm({
                    ...form,
                    planningRef: plan ? {
                      packageId: plan.paketId,
                      documentType: plan.jenis,
                      unit: plan.jenis === 'modul' ? String(plan.noUnit) : null,
                    } : null,
                  });
                }}
                disabled={loading || plans.length === 0}
              >
                <option value="">Pilih dokumen pada arsip Anda</option>
                {plans.map((plan) => {
                  const reference = {
                    packageId: plan.paketId,
                    documentType: plan.jenis,
                    unit: plan.jenis === 'modul' ? String(plan.noUnit) : null,
                  };
                  return (
                    <option key={kunciRencana(reference)} value={kunciRencana(reference)}>
                      {labelRencana(plan)}
                    </option>
                  );
                })}
              </select>
              {!loading && plans.length === 0 && (
                <p className="ale-journals-empty">
                  Belum ada dokumen perencanaan di arsip akun ini. Simpan dokumen melalui
                  Perencanaan terlebih dahulu.
                </p>
              )}
            </>
          )}
          {quickMode ? (
            <>
              <label htmlFor="classroom-journal-activities">Ringkasan kegiatan kelas</label>
              <textarea
                id="classroom-journal-activities"
                required
                maxLength={6000}
                rows={4}
                value={form.activities}
                onChange={(event) => setForm({ ...form, activities: event.target.value })}
                placeholder="Tuliskan kegiatan yang benar-benar berlangsung."
              />
              <details>
                <summary>Lengkapi tujuan, refleksi, atau tindak lanjut (opsional)</summary>
                <label htmlFor="classroom-journal-objectives">Tujuan pembelajaran</label>
                <textarea
                  id="classroom-journal-objectives"
                  maxLength={3000}
                  rows={3}
                  value={form.objectives}
                  onChange={(event) => setForm({ ...form, objectives: event.target.value })}
                  placeholder="Tujuan belum dicatat jika bagian ini dikosongkan."
                />
                <label htmlFor="classroom-journal-reflection">Refleksi pembelajaran</label>
                <textarea
                  id="classroom-journal-reflection"
                  maxLength={4000}
                  rows={3}
                  value={form.reflection}
                  onChange={(event) => setForm({ ...form, reflection: event.target.value })}
                  placeholder="Apa yang berjalan baik dan perlu diperbaiki?"
                />
                <label htmlFor="classroom-journal-follow-up">Tindak lanjut</label>
                <textarea
                  id="classroom-journal-follow-up"
                  maxLength={4000}
                  rows={3}
                  value={form.followUp}
                  onChange={(event) => setForm({ ...form, followUp: event.target.value })}
                  placeholder="Rencana tindak lanjut pembelajaran."
                />
              </details>
            </>
          ) : (
            <>
              <label htmlFor="classroom-journal-objectives">Tujuan pembelajaran</label>
              <textarea
                id="classroom-journal-objectives"
                required
                maxLength={3000}
                rows={3}
                value={form.objectives}
                onChange={(event) => setForm({ ...form, objectives: event.target.value })}
                placeholder="Apa yang diharapkan dikuasai siswa?"
              />
              <label htmlFor="classroom-journal-activities">Kegiatan dan pelaksanaan</label>
              <textarea
                id="classroom-journal-activities"
                required
                maxLength={6000}
                rows={5}
                value={form.activities}
                onChange={(event) => setForm({ ...form, activities: event.target.value })}
                placeholder="Ringkas kegiatan pembuka, inti, dan penutup."
              />
              <label htmlFor="classroom-journal-reflection">Refleksi pembelajaran (opsional)</label>
              <textarea
                id="classroom-journal-reflection"
                maxLength={4000}
                rows={3}
                value={form.reflection}
                onChange={(event) => setForm({ ...form, reflection: event.target.value })}
                placeholder="Apa yang berjalan baik dan perlu diperbaiki?"
              />
              <label htmlFor="classroom-journal-follow-up">Tindak lanjut (opsional)</label>
              <textarea
                id="classroom-journal-follow-up"
                maxLength={4000}
                rows={3}
                value={form.followUp}
                onChange={(event) => setForm({ ...form, followUp: event.target.value })}
                placeholder="Rencana tindak lanjut pembelajaran."
              />
            </>
          )}
          <div className="ale-journals-actions">
            <button type="submit" disabled={saving || loading || classes.length === 0}>
              {saving ? 'Menyimpan...' : editingId ? 'Simpan perubahan' : quickMode ? 'Simpan catatan cepat' : 'Simpan jurnal'}
            </button>
            {editingId && (
              <button type="button" className="secondary" onClick={resetForm}>Batal</button>
            )}
          </div>
          {!loading && classes.length === 0 && (
            <p className="ale-journals-empty">Belum ada kelas yang ditugaskan ke akun guru Anda.</p>
          )}
        </form>

        <section className="ale-journals-list" aria-labelledby="classroom-journals-list-title">
          <div className="ale-journals-list-heading">
            <div>
              <h2 id="classroom-journals-list-title">Riwayat jurnal</h2>
              <p>{entries.length} catatan pada kelas yang ditugaskan</p>
            </div>
            <button type="button" className="secondary" onClick={() => void load()} disabled={loading}>
              {loading ? 'Memuat...' : 'Muat ulang'}
            </button>
          </div>
          <div className="ale-journals-filters">
            <label>
              <span className="sr-only">Cari jurnal</span>
              <input
                type="search"
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder="Cari topik, kelas, atau isi"
              />
            </label>
            <label>
              <span className="sr-only">Filter tanggal</span>
              <input type="date" value={filterDate} onChange={(event) => setFilterDate(event.target.value)} />
            </label>
          </div>
          {loading ? (
            <p className="ale-journals-empty" role="status">Memuat jurnal mengajar...</p>
          ) : visibleEntries.length === 0 ? (
            <p className="ale-journals-empty">
              {entries.length ? 'Tidak ada jurnal yang cocok dengan filter.' : 'Belum ada jurnal mengajar pada kelas Anda.'}
            </p>
          ) : (
            <ul className="ale-journals-entries">
              {visibleEntries.map((entry) => (
                <li className="ale-journals-entry" key={entry.id}>
                  <div className="ale-journals-entry-meta">
                    <span>{entry.classroomName}{entry.classroomSubject ? ` · ${entry.classroomSubject}` : ''}</span>
                    <time dateTime={entry.lessonDate}>{tanggal(entry.lessonDate)}</time>
                  </div>
                  <h3>{entry.topic}</h3>
                  {entry.planningRef && (
                    <section>
                      <h4>Rencana yang ditautkan</h4>
                      <a href={`#/perencanaan/${encodeURIComponent(entry.planningRef.packageId)}/${encodeURIComponent(entry.planningRef.documentType)}${entry.planningRef.unit ? `?unit=${encodeURIComponent(entry.planningRef.unit)}` : ''}`}>
                        {labelRencanaTerkait(entry.planningRef, plans)}
                      </a>
                    </section>
                  )}
                  <section>
                    <h4>Tujuan</h4>
                    <p>
                      {entry.objectives === TUJUAN_CATATAN_CEPAT
                        ? 'Belum dicatat melalui mode cepat; lengkapi dari Jurnal Mengajar bila diperlukan.'
                        : entry.objectives}
                    </p>
                  </section>
                  <section>
                    <h4>Kegiatan</h4>
                    <p>{entry.activities}</p>
                  </section>
                  {entry.reflection && <section><h4>Refleksi</h4><p>{entry.reflection}</p></section>}
                  {entry.followUp && <section><h4>Tindak lanjut</h4><p>{entry.followUp}</p></section>}
                  <div className="ale-journals-actions">
                    <button type="button" className="secondary" onClick={() => edit(entry)}>Ubah</button>
                    <button type="button" className="danger" onClick={() => void remove(entry)}>Hapus</button>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </section>
      </div>
    </main>
  );
}
