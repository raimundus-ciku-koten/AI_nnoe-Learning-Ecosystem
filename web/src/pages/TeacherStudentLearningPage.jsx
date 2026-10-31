import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { adalahPeranGuru } from '../navigasi.js';
import Ikon from '../components/Ikon.jsx';
import { muatPenugasanGuru } from '../services/teacherAssignments.js';
import {
  hapusJadwalSiswa, hapusMateriSiswa, muatRuangBelajarGuru,
  tambahJadwalSiswa, tambahMateriSiswa, ubahJadwalSiswa, ubahMateriSiswa,
} from '../services/studentLearning.js';
import '../styles/teacher-workspace.css';

const HARI = [
  'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu', 'Minggu',
];
const JADWAL_KOSONG = {
  kelas: '', dayOfWeek: '1', startsAt: '07:00', endsAt: '07:40', mapel: '', ruang: '',
};
const MATERI_KOSONG = { kelas: '', mapel: '', title: '', description: '', resourceUrl: '' };

function waktu(value) {
  return String(value || '').slice(0, 5);
}

function pesanGalat(error, aksi) {
  if (['42501', 'permission-denied'].includes(error?.code)) {
    return `Akses ${aksi} ditolak. Pastikan peran guru aktif dan langganan sekolah masih berlaku.`;
  }
  return `Data ${aksi} gagal diproses. Periksa koneksi, lalu coba lagi.`;
}

export default function TeacherStudentLearningPage() {
  const { user, role, activeRole, tenantId } = useAuth();
  const peranAktif = activeRole || role;
  const canManage = adalahPeranGuru(peranAktif) && Boolean(user?.uid && tenantId);
  const [schedule, setSchedule] = useState([]);
  const [materials, setMaterials] = useState([]);
  const [assignments, setAssignments] = useState({ kelas: [], mapel: [] });
  const [scheduleForm, setScheduleForm] = useState(JADWAL_KOSONG);
  const [materialForm, setMaterialForm] = useState(MATERI_KOSONG);
  const [scheduleEditId, setScheduleEditId] = useState('');
  const [materialEditId, setMaterialEditId] = useState('');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const ownerId = user?.uid || '';
  const ownerKey = canManage ? `${tenantId}:${ownerId}` : '';
  const [loadedOwnerKey, setLoadedOwnerKey] = useState('');
  const loadRequest = useRef(0);

  const muat = useCallback(async () => {
    const requestId = ++loadRequest.current;
    if (!canManage) {
      setSchedule([]);
      setMaterials([]);
      setAssignments({ kelas: [], mapel: [] });
      setLoadedOwnerKey('');
      setLoading(false);
      return;
    }
    setSchedule([]);
    setMaterials([]);
    setAssignments({ kelas: [], mapel: [] });
    setLoadedOwnerKey('');
    setLoading(true);
    setError('');
    try {
      const [result, assigned] = await Promise.all([
        muatRuangBelajarGuru(tenantId, ownerId),
        muatPenugasanGuru(ownerId),
      ]);
      if (requestId !== loadRequest.current) return;
      setSchedule(result.schedule);
      setMaterials(result.materials);
      setAssignments(assigned);
      setLoadedOwnerKey(ownerKey);
    } catch (loadError) {
      if (requestId !== loadRequest.current) return;
      console.error('[teacher-learning] Gagal memuat data kelas:', loadError);
      setError(pesanGalat(loadError, 'jadwal dan materi'));
    } finally {
      if (requestId === loadRequest.current) setLoading(false);
    }
  }, [canManage, ownerId, ownerKey, tenantId]);

  useEffect(() => {
    setScheduleForm(JADWAL_KOSONG);
    setMaterialForm(MATERI_KOSONG);
    setScheduleEditId('');
    setMaterialEditId('');
    setNotice('');
    muat();
    return () => { loadRequest.current += 1; };
  }, [muat]);

  async function simpanJadwal(event) {
    event.preventDefault();
    if (!canManage || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      const input = { ...scheduleForm, dayOfWeek: Number(scheduleForm.dayOfWeek) };
      if (scheduleEditId) {
        await ubahJadwalSiswa(tenantId, ownerId, scheduleEditId, input);
        setNotice('Jadwal kelas berhasil diperbarui.');
      } else {
        await tambahJadwalSiswa(tenantId, ownerId, input);
        setNotice('Jadwal kelas berhasil diterbitkan untuk siswa pada kelas ini.');
      }
      setScheduleForm(JADWAL_KOSONG);
      setScheduleEditId('');
      await muat();
    } catch (saveError) {
      console.error('[teacher-learning] Gagal menyimpan jadwal:', saveError);
      setError(saveError instanceof TypeError ? saveError.message : pesanGalat(saveError, 'jadwal'));
    } finally {
      setBusy(false);
    }
  }

  async function simpanMateri(event) {
    event.preventDefault();
    if (!canManage || busy) return;
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (materialEditId) {
        await ubahMateriSiswa(tenantId, ownerId, materialEditId, materialForm);
        setNotice('Materi kelas berhasil diperbarui.');
      } else {
        await tambahMateriSiswa(tenantId, ownerId, materialForm);
        setNotice('Materi berhasil diterbitkan untuk siswa pada kelas ini.');
      }
      setMaterialForm(MATERI_KOSONG);
      setMaterialEditId('');
      await muat();
    } catch (saveError) {
      console.error('[teacher-learning] Gagal menyimpan materi:', saveError);
      setError(saveError instanceof TypeError ? saveError.message : pesanGalat(saveError, 'materi'));
    } finally {
      setBusy(false);
    }
  }

  function editJadwal(entry) {
    setScheduleEditId(entry.id);
    setScheduleForm({
      kelas: entry.kelas,
      dayOfWeek: String(entry.day_of_week),
      startsAt: waktu(entry.starts_at),
      endsAt: waktu(entry.ends_at),
      mapel: entry.mapel,
      ruang: entry.ruang || '',
    });
    setError('');
    setNotice('');
  }

  function editMateri(entry) {
    setMaterialEditId(entry.id);
    setMaterialForm({
      kelas: entry.kelas,
      mapel: entry.mapel,
      title: entry.title,
      description: entry.description || '',
      resourceUrl: entry.resource_url,
    });
    setError('');
    setNotice('');
  }

  async function hapus(kind, entry) {
    const label = kind === 'schedule' ? `${entry.mapel} · ${entry.kelas}` : entry.title;
    if (!globalThis.confirm(`Hapus ${kind === 'schedule' ? 'jadwal' : 'materi'} "${label}"? Siswa pada kelas ini tidak lagi dapat melihatnya.`)) {
      return;
    }
    setBusy(true);
    setError('');
    setNotice('');
    try {
      if (kind === 'schedule') {
        await hapusJadwalSiswa(tenantId, ownerId, entry.id);
        setNotice('Jadwal berhasil dihapus.');
      } else {
        await hapusMateriSiswa(tenantId, ownerId, entry.id);
        setNotice('Materi berhasil dihapus.');
      }
      await muat();
    } catch (deleteError) {
      console.error('[teacher-learning] Gagal menghapus data kelas:', deleteError);
      setError(pesanGalat(deleteError, kind === 'schedule' ? 'jadwal' : 'materi'));
    } finally {
      setBusy(false);
    }
  }

  function batal(kind) {
    if (kind === 'schedule') {
      setScheduleForm(JADWAL_KOSONG);
      setScheduleEditId('');
    } else {
      setMaterialForm(MATERI_KOSONG);
      setMaterialEditId('');
    }
    setError('');
  }

  if (!canManage) {
    return (
      <main className="teacher-workspace">
        <section className="ale-kartu" role="alert">
          <h1>Jadwal &amp; Materi untuk Siswa</h1>
          <p>Ruang pengelolaan ini hanya tersedia untuk guru aktif pada sekolah yang terhubung.</p>
        </section>
      </main>
    );
  }

  const scheduleVisible = loadedOwnerKey === ownerKey ? schedule : [];
  const materialsVisible = loadedOwnerKey === ownerKey ? materials : [];

  return (
    <main className="teacher-workspace">
      <header className="teacher-workspace-header">
        <div>
          <p className="teacher-workspace-kicker"><Ikon nama="book" /> Ruang belajar siswa</p>
          <h1>Jadwal &amp; Materi Kelas</h1>
          <p>Terbitkan jadwal dan tautan bahan ajar untuk siswa yang tertaut pada kelas.</p>
        </div>
        <span className="teacher-workspace-status">Akses kelas tertaut</span>
      </header>

      <aside className="teacher-workspace-privacy" role="note">
        <Ikon nama="shield" />
        <p>Data hanya dibagikan kepada akun siswa yang ditautkan sekolah ke roster kelas. Jangan cantumkan nama atau data pribadi siswa pada deskripsi maupun berkas. Pastikan tautan materi memiliki izin akses yang sesuai; aplikasi tidak mengubah izin berbagi pada layanan penyimpanan eksternal.</p>
      </aside>

      {loadedOwnerKey === ownerKey && (!assignments.kelas.length || !assignments.mapel.length) && (
        <aside className="teacher-workspace-privacy" role="status">
          <Ikon nama="info" />
          <p>Penugasan kelas dan mata pelajaran belum tersedia pada akun ini. Minta administrator sekolah mengatur penugasan sebelum menerbitkan data untuk siswa.</p>
        </aside>
      )}
      {(error || notice) && (
        <p className={error ? 'teacher-workspace-error' : 'teacher-workspace-notice'}
          role={error ? 'alert' : 'status'}>
          {error || notice}
        </p>
      )}

      {loading ? (
        <p className="teacher-workspace-loading" role="status">Memuat jadwal dan materi kelas…</p>
      ) : (
        <div className="teacher-workspace-grid">
          <section className="ale-kartu teacher-workspace-form" aria-labelledby="student-schedule-title">
            <div className="teacher-workspace-section-head">
              <div><p className="teacher-workspace-eyebrow">Jadwal kelas</p><h2 id="student-schedule-title">Sesi belajar</h2></div>
            </div>
            <form onSubmit={simpanJadwal}>
              <label>Kelas
                <select required value={scheduleForm.kelas}
                  onChange={(event) => setScheduleForm({ ...scheduleForm, kelas: event.target.value })}>
                  <option value="">Pilih kelas</option>
                  {assignments.kelas.map((kelas) => <option key={kelas} value={kelas}>{kelas}</option>)}
                </select>
              </label>
              <label>Hari
                <select value={scheduleForm.dayOfWeek}
                  onChange={(event) => setScheduleForm({ ...scheduleForm, dayOfWeek: event.target.value })}>
                  {HARI.map((hari, index) => <option key={hari} value={index + 1}>{hari}</option>)}
                </select>
              </label>
              <div className="teacher-workspace-form-row">
                <label>Mulai
                  <input required type="time" value={scheduleForm.startsAt}
                    onChange={(event) => setScheduleForm({ ...scheduleForm, startsAt: event.target.value })} />
                </label>
                <label>Selesai
                  <input required type="time" value={scheduleForm.endsAt}
                    onChange={(event) => setScheduleForm({ ...scheduleForm, endsAt: event.target.value })} />
                </label>
              </div>
              <label>Mata pelajaran
                <select required value={scheduleForm.mapel}
                  onChange={(event) => setScheduleForm({ ...scheduleForm, mapel: event.target.value })}>
                  <option value="">Pilih mata pelajaran</option>
                  {assignments.mapel.map((mapel) => <option key={mapel} value={mapel}>{mapel}</option>)}
                </select>
              </label>
              <label>Ruang (opsional)
                <input maxLength={80} value={scheduleForm.ruang}
                  onChange={(event) => setScheduleForm({ ...scheduleForm, ruang: event.target.value })} />
              </label>
              <div className="teacher-workspace-actions">
                <button type="submit" disabled={busy || !assignments.kelas.length || !assignments.mapel.length}>{busy ? 'Menyimpan…' : scheduleEditId ? 'Simpan perubahan' : 'Terbitkan jadwal'}</button>
                {scheduleEditId && <button className="teacher-workspace-secondary" type="button" onClick={() => batal('schedule')}>Batal</button>}
              </div>
            </form>
          </section>

          <section className="ale-kartu" aria-labelledby="student-schedule-list-title">
            <div className="teacher-workspace-section-head">
              <div><p className="teacher-workspace-eyebrow">Terbit untuk siswa</p><h2 id="student-schedule-list-title">Jadwal kelas</h2></div>
              <span className="teacher-workspace-status">{scheduleVisible.length} sesi</span>
            </div>
            {!scheduleVisible.length ? (
              <div className="teacher-workspace-empty"><Ikon nama="calendar" /><h3>Belum ada jadwal</h3><p>Tambahkan sesi agar siswa pada kelas tertaut dapat melihatnya.</p></div>
            ) : (
              <ul className="teacher-workspace-entries">
                {scheduleVisible.map((entry) => (
                  <li className="teacher-workspace-entry" key={entry.id}>
                    <div className="teacher-workspace-entry-top">
                      <div><span className="teacher-workspace-tag">{HARI[entry.day_of_week - 1]}</span><h3>{entry.mapel}</h3></div>
                      <span className="teacher-workspace-date">{waktu(entry.starts_at)}–{waktu(entry.ends_at)}</span>
                    </div>
                    <p className="teacher-workspace-context">Kelas {entry.kelas}{entry.ruang ? ` · ${entry.ruang}` : ''}</p>
                    <div className="teacher-workspace-entry-footer">
                      <small>Dibagikan kepada akun siswa kelas tertaut.</small>
                      <div className="teacher-workspace-actions">
                        <button className="teacher-workspace-secondary" type="button" disabled={busy} onClick={() => editJadwal(entry)}>Ubah</button>
                        <button className="teacher-workspace-secondary" type="button" disabled={busy} onClick={() => hapus('schedule', entry)}>Hapus</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>

          <section className="ale-kartu teacher-workspace-form" aria-labelledby="student-material-form-title">
            <div className="teacher-workspace-section-head">
              <div><p className="teacher-workspace-eyebrow">Bahan ajar</p><h2 id="student-material-form-title">Terbitkan materi</h2></div>
            </div>
            <form onSubmit={simpanMateri}>
              <label>Kelas
                <select required value={materialForm.kelas}
                  onChange={(event) => setMaterialForm({ ...materialForm, kelas: event.target.value })}>
                  <option value="">Pilih kelas</option>
                  {assignments.kelas.map((kelas) => <option key={kelas} value={kelas}>{kelas}</option>)}
                </select>
              </label>
              <label>Mata pelajaran
                <select required value={materialForm.mapel}
                  onChange={(event) => setMaterialForm({ ...materialForm, mapel: event.target.value })}>
                  <option value="">Pilih mata pelajaran</option>
                  {assignments.mapel.map((mapel) => <option key={mapel} value={mapel}>{mapel}</option>)}
                </select>
              </label>
              <label>Judul materi
                <input required maxLength={160} value={materialForm.title}
                  onChange={(event) => setMaterialForm({ ...materialForm, title: event.target.value })} />
              </label>
              <label>Deskripsi
                <textarea maxLength={2000} value={materialForm.description}
                  onChange={(event) => setMaterialForm({ ...materialForm, description: event.target.value })} />
              </label>
              <label>Tautan HTTPS
                <input required type="url" pattern="https://.*" maxLength={2048}
                  value={materialForm.resourceUrl}
                  onChange={(event) => setMaterialForm({ ...materialForm, resourceUrl: event.target.value })}
                  placeholder="https://…" />
              </label>
              <div className="teacher-workspace-actions">
                <button type="submit" disabled={busy || !assignments.kelas.length || !assignments.mapel.length}>{busy ? 'Menyimpan…' : materialEditId ? 'Simpan perubahan' : 'Terbitkan materi'}</button>
                {materialEditId && <button className="teacher-workspace-secondary" type="button" onClick={() => batal('material')}>Batal</button>}
              </div>
            </form>
          </section>

          <section className="ale-kartu" aria-labelledby="student-material-list-title">
            <div className="teacher-workspace-section-head">
              <div><p className="teacher-workspace-eyebrow">Terbit untuk siswa</p><h2 id="student-material-list-title">Materi kelas</h2></div>
              <span className="teacher-workspace-status">{materialsVisible.length} materi</span>
            </div>
            {!materialsVisible.length ? (
              <div className="teacher-workspace-empty"><Ikon nama="book" /><h3>Belum ada materi</h3><p>Tambahkan bahan ajar melalui tautan HTTPS.</p></div>
            ) : (
              <ul className="teacher-workspace-entries">
                {materialsVisible.map((entry) => (
                  <li className="teacher-workspace-entry" key={entry.id}>
                    <div className="teacher-workspace-entry-top"><div><span className="teacher-workspace-tag">{entry.mapel} · Kelas {entry.kelas}</span><h3>{entry.title}</h3></div></div>
                    {entry.description && <p className="teacher-workspace-entry-body">{entry.description}</p>}
                    <div className="teacher-workspace-entry-footer">
                      <a href={entry.resource_url} target="_blank" rel="noopener noreferrer">Buka tautan materi</a>
                      <div className="teacher-workspace-actions">
                        <button className="teacher-workspace-secondary" type="button" disabled={busy} onClick={() => editMateri(entry)}>Ubah</button>
                        <button className="teacher-workspace-secondary" type="button" disabled={busy} onClick={() => hapus('material', entry)}>Hapus</button>
                      </div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </div>
      )}
    </main>
  );
}
