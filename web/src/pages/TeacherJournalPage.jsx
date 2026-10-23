import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import Ikon from '../components/Ikon.jsx';
import {
  hapusJurnalMengajar,
  muatJurnalMengajar,
  muatKelasRosterGuru,
  roleDapatMengelolaJurnal,
  simpanJurnalMengajar,
  ubahJurnalMengajar,
} from '../services/teacherJournals.js';
import '../styles/teacher-journal.css';

function today() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

const EMPTY_FORM = {
  className: '',
  subject: '',
  date: today(),
  topic: '',
  learningObjective: '',
  activities: '',
  reflection: '',
  followUp: '',
  status: 'draf',
};

function displayDate(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function mapDraft(entry) {
  return {
    className: entry.className,
    subject: entry.subject,
    date: entry.date,
    topic: entry.topic,
    learningObjective: entry.learningObjective,
    activities: entry.activities,
    reflection: entry.reflection,
    followUp: entry.followUp,
    status: entry.status,
  };
}

export default function TeacherJournalPage() {
  const { user, role, tenantId } = useAuth();
  const canManage = roleDapatMengelolaJurnal(role) && Boolean(user?.uid && tenantId);
  const [classes, setClasses] = useState([]);
  const [entries, setEntries] = useState([]);
  const [form, setForm] = useState(EMPTY_FORM);
  const [editId, setEditId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  const refresh = useCallback(async () => {
    const [rosterClasses, journals] = await Promise.all([
      muatKelasRosterGuru(tenantId, user.uid),
      muatJurnalMengajar(tenantId, user.uid),
    ]);
    setClasses(rosterClasses);
    setEntries(journals);
  }, [tenantId, user?.uid]);

  useEffect(() => {
    let active = true;
    if (!canManage) {
      setLoading(false);
      return undefined;
    }
    setLoading(true);
    setError('');
    Promise.all([
      muatKelasRosterGuru(tenantId, user.uid),
      muatJurnalMengajar(tenantId, user.uid),
    ])
      .then(([rosterClasses, journals]) => {
        if (!active) return;
        setClasses(rosterClasses);
        setEntries(journals);
        setForm((current) => ({
          ...current,
          className: current.className || rosterClasses[0] || '',
        }));
      })
      .catch((loadError) => {
        console.error('[teacher-journal] Gagal memuat jurnal:', loadError);
        if (active) setError(loadError?.message || 'Jurnal mengajar tidak dapat dimuat.');
      })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [canManage, tenantId, user?.uid]);

  function change(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function reset() {
    setForm({ ...EMPTY_FORM, className: classes[0] || '' });
    setEditId('');
  }

  async function save(event) {
    event.preventDefault();
    if (!canManage || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      if (editId) {
        await ubahJurnalMengajar(tenantId, user.uid, editId, form);
        setNotice('Jurnal berhasil diperbarui.');
      } else {
        await simpanJurnalMengajar(tenantId, user.uid, form);
        setNotice('Jurnal berhasil disimpan.');
      }
      reset();
      await refresh();
    } catch (saveError) {
      console.error('[teacher-journal] Gagal menyimpan jurnal:', saveError);
      setError(saveError?.message || 'Jurnal tidak dapat disimpan.');
    } finally {
      setSaving(false);
    }
  }

  function edit(entry) {
    setEditId(entry.id);
    setForm(mapDraft(entry));
    setError('');
    setNotice('');
  }

  async function remove(entry) {
    if (!globalThis.confirm(`Hapus jurnal "${entry.topic}" tanggal ${displayDate(entry.date)}?`)) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      await hapusJurnalMengajar(tenantId, user.uid, entry.id);
      if (editId === entry.id) reset();
      await refresh();
      setNotice('Jurnal berhasil dihapus.');
    } catch (deleteError) {
      console.error('[teacher-journal] Gagal menghapus jurnal:', deleteError);
      setError(deleteError?.message || 'Jurnal tidak dapat dihapus.');
    } finally {
      setSaving(false);
    }
  }

  if (!roleDapatMengelolaJurnal(role)) {
    return (
      <section className="ale-kartu teacher-journal-denied" role="alert">
        <h1>Akses jurnal mengajar tidak tersedia</h1>
        <p>Jurnal ini hanya tersedia bagi akun guru aktif.</p>
      </section>
    );
  }

  if (!tenantId || !user?.uid) {
    return (
      <section className="ale-kartu teacher-journal-denied" role="alert">
        <h1>Jurnal belum tersedia</h1>
        <p>Akun guru belum terhubung ke sekolah aktif.</p>
      </section>
    );
  }

  return (
    <main className="teacher-journal">
      <header className="teacher-journal-header">
        <div>
          <p className="teacher-journal-kicker"><Ikon nama="journal-check" /> Pelaksanaan pembelajaran</p>
          <h1>Jurnal Mengajar Harian</h1>
          <p>Catat tujuan, kegiatan, refleksi, dan tindak lanjut pembelajaran untuk kelas roster Anda.</p>
        </div>
        <a href="#/dashboard">Kembali ke Dashboard</a>
      </header>

      <aside className="teacher-journal-privacy" role="note">
        <Ikon nama="shield" />
        <p>
          Jurnal hanya dapat dibaca dan dikelola oleh akun guru pembuatnya. Jangan masukkan nama
          atau identitas siswa; gunakan catatan kelas secara umum. Data disimpan di Supabase sekolah
          yang sudah digunakan aplikasi, tanpa layanan atau provider tambahan.
        </p>
      </aside>

      {error && <p className="teacher-journal-error" role="alert">{error}</p>}
      {notice && <p className="teacher-journal-notice" role="status">{notice}</p>}

      <div className="teacher-journal-grid">
        <section className="ale-kartu teacher-journal-form-card" aria-labelledby="teacher-journal-form-title">
          <p className="teacher-journal-eyebrow">{editId ? 'Perbarui jurnal' : 'Catatan harian'}</p>
          <h2 id="teacher-journal-form-title">{editId ? 'Edit jurnal' : 'Buat jurnal mengajar'}</h2>
          {!loading && classes.length === 0 && (
            <p role="status">Belum ada kelas pada roster akun ini. Hubungi administrator untuk memperbarui roster.</p>
          )}
          <form onSubmit={save}>
            <label>Kelas
              <select required value={form.className} disabled={loading || saving || classes.length === 0}
                onChange={(event) => change('className', event.target.value)}>
                <option value="">Pilih kelas roster</option>
                {classes.map((className) => <option key={className} value={className}>{className}</option>)}
              </select>
            </label>
            <div className="teacher-journal-row">
              <label>Mata pelajaran
                <input required maxLength={100} value={form.subject} disabled={saving}
                  onChange={(event) => change('subject', event.target.value)} />
              </label>
              <label>Tanggal
                <input required type="date" value={form.date} disabled={saving}
                  onChange={(event) => change('date', event.target.value)} />
              </label>
            </div>
            <label>Topik pembelajaran
              <input required maxLength={200} value={form.topic} disabled={saving}
                onChange={(event) => change('topic', event.target.value)} />
            </label>
            <label>Tujuan pembelajaran
              <textarea required maxLength={2000} rows={3} value={form.learningObjective} disabled={saving}
                onChange={(event) => change('learningObjective', event.target.value)} />
            </label>
            <label>Kegiatan pembelajaran
              <textarea required maxLength={6000} rows={5} value={form.activities} disabled={saving}
                onChange={(event) => change('activities', event.target.value)} />
            </label>
            <label>Refleksi
              <textarea maxLength={4000} rows={3} value={form.reflection} disabled={saving}
                onChange={(event) => change('reflection', event.target.value)} />
            </label>
            <label>Tindak lanjut
              <textarea maxLength={4000} rows={3} value={form.followUp} disabled={saving}
                onChange={(event) => change('followUp', event.target.value)} />
            </label>
            <label className="teacher-journal-status">
              <span>Status jurnal</span>
              <select value={form.status} disabled={saving}
                onChange={(event) => change('status', event.target.value)}>
                <option value="draf">Draf</option>
                <option value="selesai">Selesai</option>
              </select>
            </label>
            <div className="teacher-journal-actions">
              <button type="submit" disabled={saving || loading || classes.length === 0}>
                {saving ? 'Menyimpan…' : editId ? 'Simpan perubahan' : 'Simpan jurnal'}
              </button>
              {editId && <button type="button" className="secondary" disabled={saving} onClick={reset}>Batal</button>}
            </div>
          </form>
        </section>

        <section className="ale-kartu teacher-journal-list-card" aria-labelledby="teacher-journal-list-title">
          <p className="teacher-journal-eyebrow">Privat untuk akun Anda</p>
          <h2 id="teacher-journal-list-title">Jurnal tersimpan</h2>
          {loading && <p role="status">Memuat jurnal…</p>}
          {!loading && entries.length === 0 && <p>Belum ada jurnal mengajar tersimpan.</p>}
          <ul className="teacher-journal-list">
            {entries.map((entry) => (
              <li key={entry.id}>
                <div className="teacher-journal-entry-head">
                  <div>
                    <span className={`teacher-journal-tag is-${entry.status}`}>
                      {entry.status === 'selesai' ? 'Selesai' : 'Draf'}
                    </span>
                    <h3>{entry.topic}</h3>
                    <p>{entry.className} · {entry.subject} · {displayDate(entry.date)}</p>
                  </div>
                </div>
                <p><strong>Tujuan:</strong> {entry.learningObjective}</p>
                <p className="teacher-journal-entry-text">{entry.activities}</p>
                {entry.reflection && <p><strong>Refleksi:</strong> {entry.reflection}</p>}
                {entry.followUp && <p><strong>Tindak lanjut:</strong> {entry.followUp}</p>}
                <div className="teacher-journal-entry-actions">
                  <button type="button" disabled={saving} onClick={() => edit(entry)}>Ubah</button>
                  <button type="button" className="danger" disabled={saving} onClick={() => remove(entry)}>Hapus</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </div>
    </main>
  );
}
