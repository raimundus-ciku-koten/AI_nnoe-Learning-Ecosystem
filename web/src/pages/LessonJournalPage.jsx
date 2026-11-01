import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import Ikon from '../components/Ikon.jsx';
import { muatPenugasanGuru } from '../services/teacherAssignments.js';
import {
  antrekanEventAuditJurnal,
  buatEventAuditJurnal,
  cobaKirimUlangAuditJurnal,
  jumlahEventAuditJurnal,
  kirimAntreanAuditJurnal,
} from '../services/lessonJournalAudit.js';
import {
  dapatMengelolaJurnal, hapusJurnal, muatJurnal, tambahJurnal, ubahJurnal,
} from '../services/lessonJournal.js';
import '../styles/lesson-journal.css';

const BATAS = Object.freeze({
  kelas: 120,
  mapel: 120,
  materi: 2000,
  kegiatan: 4000,
  kendala: 2000,
  tindakLanjut: 2000,
});
const DRAF_VERSION = 1;
const FIELD_JURNAL = Object.freeze([
  'tanggal', 'kelas', 'mapel', 'jam', 'materi', 'kegiatan',
  'kendala', 'tindakLanjut', 'status',
]);

function tanggalHariIni() {
  const date = new Date();
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function formKosong(assignments) {
  return {
    tanggal: tanggalHariIni(),
    kelas: assignments.kelas[0] || '',
    mapel: assignments.mapel[0] || '',
    jam: '',
    materi: '',
    kegiatan: '',
    kendala: '',
    tindakLanjut: '',
    status: 'draft',
  };
}

function drafLokalValid(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    throw new Error('Draf lokal jurnal tidak memiliki format yang valid.');
  }
  const draft = {};
  for (const [field, max] of Object.entries(BATAS)) {
    const value = raw[field] ?? '';
    if (typeof value !== 'string' || value.length > max) {
      throw new Error('Draf lokal jurnal tidak memiliki format yang valid.');
    }
    draft[field] = value;
  }
  if (typeof raw.tanggal !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(raw.tanggal)) {
    throw new Error('Tanggal pada draf lokal tidak valid.');
  }
  if (typeof raw.jam !== 'string' || raw.jam.length > 20) {
    throw new Error('Jam pada draf lokal tidak valid.');
  }
  return {
    ...draft,
    tanggal: raw.tanggal,
    jam: raw.jam,
    status: raw.status === 'final' ? 'final' : 'draft',
  };
}

function drafBerisi(form) {
  return Boolean(form.jam || form.materi || form.kegiatan || form.kendala || form.tindakLanjut);
}

function tanggalTampil(value) {
  const [year, month, day] = value.split('-').map(Number);
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(Date.UTC(year, month - 1, day)));
}

function waktuTampil(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Waktu tidak tersedia'
    : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

function pesanKesalahan(error, aksi) {
  if (error instanceof TypeError || error instanceof RangeError) return error.message;
  if (error?.code === '42501' || error?.code === 'PGRST301') {
    return `Akses ${aksi} jurnal ditolak. Pastikan penugasan kelas dan langganan sekolah masih aktif.`;
  }
  if (error?.code === '23514') return 'Isian jurnal tidak memenuhi aturan. Periksa kembali tanggal, jam, dan panjang teks.';
  return `Jurnal tidak dapat ${aksi}. Periksa koneksi dan akses akun, lalu coba lagi.`;
}

function KartuJurnal({ item, onEdit, onDelete, deleting }) {
  return (
    <article className="ale-kartu lesson-journal-item">
      <div className="lesson-journal-item-heading">
        <div>
          <p className="lesson-journal-meta">
            {tanggalTampil(item.tanggal)} · {item.kelas} · {item.mapel || 'Mata pelajaran belum diisi'} · Jam {item.jam}
          </p>
          <span className={`lesson-journal-status is-${item.status}`}>
            {item.status === 'final' ? 'Final' : 'Draf'}
          </span>
        </div>
        <div className="lesson-journal-actions">
          <button type="button" className="is-secondary" onClick={() => onEdit(item)}>Ubah</button>
          <button
            type="button"
            className="is-danger"
            onClick={() => onDelete(item)}
            disabled={deleting}
          >
            {deleting ? 'Menghapus…' : 'Hapus'}
          </button>
        </div>
      </div>
      <h3>{item.materi}</h3>
      {item.kegiatan && <p className="lesson-journal-preserve"><strong>Kegiatan:</strong> {item.kegiatan}</p>}
      {item.kendala && <p className="lesson-journal-preserve"><strong>Kendala:</strong> {item.kendala}</p>}
      {item.tindakLanjut && <p className="lesson-journal-preserve"><strong>Tindak lanjut:</strong> {item.tindakLanjut}</p>}
      <p className="lesson-journal-updated">Terakhir diubah {waktuTampil(item.updatedAt)}</p>
    </article>
  );
}

export default function LessonJournalPage() {
  const { user, role, activeRole, tenantId } = useAuth();
  const effectiveRole = activeRole || role;
  const canManage = dapatMengelolaJurnal(effectiveRole);
  const ownerUid = user?.uid || '';
  const storageKey = ownerUid && tenantId
    ? `ainnoe:lesson-journal:draft:v1:${tenantId}:${ownerUid}`
    : '';
  const monthCurrent = tanggalHariIni().slice(0, 7);
  const [assignments, setAssignments] = useState({ kelas: [], mapel: [] });
  const [assignmentsReady, setAssignmentsReady] = useState(false);
  const [loadingAssignments, setLoadingAssignments] = useState(true);
  const [assignmentError, setAssignmentError] = useState('');
  const [items, setItems] = useState([]);
  const [loadingItems, setLoadingItems] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [draftNotice, setDraftNotice] = useState('');
  const [draftError, setDraftError] = useState('');
  const [draftReady, setDraftReady] = useState(false);
  const [saving, setSaving] = useState(false);
  const [deletingId, setDeletingId] = useState('');
  const [loadingMore, setLoadingMore] = useState(false);
  const [auditNotice, setAuditNotice] = useState('');
  const [auditWarning, setAuditWarning] = useState('');
  const [syncingAudit, setSyncingAudit] = useState(false);
  const [localAuditCount, setLocalAuditCount] = useState(0);
  const [form, setForm] = useState(() => formKosong({ kelas: [], mapel: [] }));
  const [editId, setEditId] = useState('');
  const [month, setMonth] = useState(monthCurrent);
  const [classFilter, setClassFilter] = useState('');
  const [nextCursor, setNextCursor] = useState(null);

  useEffect(() => {
    let active = true;
    setAssignmentsReady(false);
    setLoadingAssignments(true);
    setAssignmentError('');
    setDraftReady(false);
    setDraftNotice('');
    setDraftError('');
    setItems([]);
    setLoadingItems(true);
    setEditId('');
    setClassFilter('');
    setForm(formKosong({ kelas: [], mapel: [] }));

    async function preparePage() {
      if (!canManage || !ownerUid || !tenantId) {
        setAssignments({ kelas: [], mapel: [] });
        setLoadingAssignments(false);
        setLoadingItems(false);
        return;
      }

      try {
        const result = await muatPenugasanGuru(ownerUid);
        if (!active) return;
        const available = {
          kelas: Array.isArray(result.kelas) ? result.kelas : [],
          mapel: Array.isArray(result.mapel) ? result.mapel : [],
        };
        setAssignments(available);
        let nextForm = formKosong(available);
        let canPersistDraft = true;

        if (storageKey) {
          try {
            const rawDraft = window.localStorage.getItem(storageKey);
            if (rawDraft) {
              const saved = JSON.parse(rawDraft);
              if (!saved || saved.version !== DRAF_VERSION) {
                throw new Error('Versi draf lokal tidak dikenali. Draf tetap disimpan di browser.');
              }
              const restoredDraft = drafLokalValid(saved.form);
              let assignmentChanged = false;
              if (!available.kelas.includes(restoredDraft.kelas)) {
                restoredDraft.kelas = '';
                assignmentChanged = true;
              }
              if (restoredDraft.mapel && !available.mapel.includes(restoredDraft.mapel)) {
                restoredDraft.mapel = '';
                assignmentChanged = true;
              }
              nextForm = { ...nextForm, ...restoredDraft };
              setDraftNotice(assignmentChanged
                ? 'Draf dipulihkan. Penugasan berubah; pilih kembali kelas atau mata pelajaran yang tersedia.'
                : 'Draf jurnal yang belum disimpan dipulihkan dari browser ini.');
            }
          } catch (draftLoadError) {
            console.error('[lesson-journal] Gagal memulihkan draf lokal:', draftLoadError);
            setDraftError(draftLoadError?.message || 'Draf lokal tidak dapat dipulihkan.');
            canPersistDraft = false;
          }
        }
        setForm(nextForm);
        setAssignmentsReady(true);
        setDraftReady(canPersistDraft);
      } catch (loadError) {
        console.error('[lesson-journal] Gagal memuat penugasan guru:', loadError);
        if (active) setAssignmentError('Daftar kelas dan mata pelajaran belum dapat dimuat. Periksa koneksi atau penugasan akun.');
      } finally {
        if (active) {
          setLoadingAssignments(false);
        }
      }
    }

    void preparePage();
    return () => { active = false; };
  }, [canManage, ownerUid, storageKey, tenantId]);

  const refreshItems = useCallback(async () => {
    if (!assignmentsReady || !ownerUid || !tenantId || !canManage) return;
    setLoadingItems(true);
    setError('');
    setItems([]);
    setNextCursor(null);
    try {
      const result = await muatJurnal(tenantId, ownerUid, { month, kelas: classFilter });
      setItems(result.items);
      setNextCursor(result.nextCursor);
    } catch (loadError) {
      console.error('[lesson-journal] Gagal memuat riwayat jurnal:', loadError);
      setError(pesanKesalahan(loadError, 'memuat'));
    } finally {
      setLoadingItems(false);
    }
  }, [assignmentsReady, canManage, classFilter, month, ownerUid, tenantId]);

  useEffect(() => {
    void refreshItems();
  }, [refreshItems]);

  useEffect(() => {
    let active = true;
    if (!ownerUid) return undefined;
    jumlahEventAuditJurnal(ownerUid)
      .then((count) => { if (active) setLocalAuditCount(count); })
      .catch((countError) => {
        console.error('[lesson-journal] Gagal memeriksa antrean audit lokal:', countError);
        if (active) setAuditWarning('Antrean audit lokal belum dapat diperiksa. Riwayat aktivitas mungkin belum terkirim.');
      });
    return () => { active = false; };
  }, [ownerUid]);

  async function catatAktivitas(action, journalId, changedFields) {
    try {
      const event = buatEventAuditJurnal({ journalId, action, changedFields });
      await antrekanEventAuditJurnal(ownerUid, event);
      setLocalAuditCount(await jumlahEventAuditJurnal(ownerUid));
    } catch (queueError) {
      console.error('[lesson-journal] Gagal mengantrekan audit lokal:', queueError);
      setAuditWarning('Jurnal sudah tersimpan, tetapi riwayat aktivitas tidak dapat dimasukkan ke antrean lokal. Hubungi administrator jika catatan ini diperlukan.');
      return;
    }

    try {
      const result = await kirimAntreanAuditJurnal(ownerUid);
      setLocalAuditCount(result.queued);
      if (result.expired) {
        setAuditWarning(`${result.expired} catatan aktivitas melewati masa simpan satu tahun dan tidak dikirim.`);
        setAuditNotice('');
      } else if (result.queued || result.serverPending) {
        setAuditWarning('Jurnal tersimpan. Catatan aktivitas menunggu pengiriman ke Google Drive pribadi; periksa koneksi Google Drive.');
        setAuditNotice('');
      } else {
        setAuditWarning('');
        setAuditNotice('Catatan aktivitas tersimpan di Google Drive pribadi.');
      }
    } catch (sendError) {
      console.error('[lesson-journal] Gagal mengirim audit:', sendError);
      setAuditWarning('Jurnal tersimpan. Catatan aktivitas tertahan dalam antrean lokal; periksa koneksi, lalu coba kirim ulang.');
      setAuditNotice('');
    }
  }

  async function kirimUlangAudit() {
    if (syncingAudit || !ownerUid) return;
    setSyncingAudit(true);
    setAuditWarning('');
    setAuditNotice('');
    try {
      const local = await kirimAntreanAuditJurnal(ownerUid);
      const remote = await cobaKirimUlangAuditJurnal();
      const pending = local.queued + remote.pending;
      setLocalAuditCount(local.queued);
      if (local.expired) {
        setAuditWarning(`${local.expired} catatan aktivitas melewati masa simpan satu tahun dan tidak dikirim.`);
      } else if (pending) {
        setAuditWarning('Sebagian catatan aktivitas masih menunggu Google Drive. Hubungkan Drive atau coba kembali nanti.');
      } else {
        setAuditNotice('Antrean aktivitas telah dikirim ke Google Drive pribadi.');
      }
    } catch (retryError) {
      console.error('[lesson-journal] Gagal mengirim ulang audit:', retryError);
      setAuditWarning('Catatan aktivitas belum dapat dikirim. Pastikan Google Drive terhubung dan coba lagi.');
    } finally {
      setSyncingAudit(false);
      try {
        setLocalAuditCount(await jumlahEventAuditJurnal(ownerUid));
      } catch (countError) {
        console.error('[lesson-journal] Gagal memperbarui jumlah antrean audit:', countError);
      }
    }
  }

  async function loadMore() {
    if (!nextCursor || loadingMore || !ownerUid || !tenantId) return;
    setLoadingMore(true);
    setError('');
    try {
      const result = await muatJurnal(tenantId, ownerUid, {
        month,
        kelas: classFilter,
        cursor: nextCursor,
      });
      setItems((current) => [...current, ...result.items]);
      setNextCursor(result.nextCursor);
    } catch (loadError) {
      console.error('[lesson-journal] Gagal memuat halaman riwayat berikutnya:', loadError);
      setError(pesanKesalahan(loadError, 'memuat'));
    } finally {
      setLoadingMore(false);
    }
  }

  useEffect(() => {
    if (!draftReady || !storageKey || editId) return undefined;
    const timer = window.setTimeout(() => {
      try {
        if (!drafBerisi(form)) {
          return;
        }
        window.localStorage.setItem(storageKey, JSON.stringify({
          version: DRAF_VERSION,
          form,
          savedAt: new Date().toISOString(),
        }));
        setDraftNotice('Draf otomatis tersimpan di browser ini.');
        setDraftError('');
      } catch (storageError) {
        console.error('[lesson-journal] Gagal menyimpan draf lokal:', storageError);
        setDraftError('Draf belum dapat dicadangkan di browser ini. Simpan jurnal ke server agar perubahan tidak hilang.');
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [draftReady, editId, form, storageKey]);

  const kelasOptions = useMemo(() => assignments.kelas, [assignments.kelas]);
  const mapelOptions = useMemo(() => assignments.mapel, [assignments.mapel]);

  function ubahForm(field, value) {
    setForm((current) => ({ ...current, [field]: value }));
    setError('');
    setNotice('');
  }

  function resetForm() {
    setForm(formKosong(assignments));
    setEditId('');
    setError('');
    setNotice('');
  }

  function edit(item) {
    setForm({
      tanggal: item.tanggal,
      kelas: item.kelas,
      mapel: item.mapel,
      jam: item.jam,
      materi: item.materi,
      kegiatan: item.kegiatan,
      kendala: item.kendala,
      tindakLanjut: item.tindakLanjut,
      status: item.status,
    });
    setEditId(item.id);
    setError('');
    setNotice('');
  }

  async function save(event) {
    event.preventDefault();
    if (saving || !ownerUid || !tenantId || !canManage) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const previous = editId ? items.find((item) => item.id === editId) : null;
      const saved = editId
        ? await ubahJurnal(tenantId, ownerUid, editId, form)
        : await tambahJurnal(tenantId, ownerUid, form);
      const changedFields = editId
        ? FIELD_JURNAL.filter((field) => String(previous?.[field] ?? '') !== String(form[field] ?? ''))
        : FIELD_JURNAL;
      if (changedFields.length) {
        await catatAktivitas(editId ? 'updated' : 'created', saved.id, changedFields);
      }
      if (!editId && storageKey) {
        try {
          window.localStorage.removeItem(storageKey);
          setDraftNotice('');
          setDraftError('');
        } catch (storageError) {
          console.error('[lesson-journal] Gagal menghapus draf lokal setelah simpan:', storageError);
          setDraftError('Jurnal sudah tersimpan di server, tetapi salinan draf di browser belum terhapus. Hapus salinan lokal jika perangkat dipakai bersama.');
        }
      }
      setNotice(editId ? 'Jurnal berhasil diperbarui di server.' : 'Jurnal berhasil disimpan di server.');
      setForm(formKosong(assignments));
      setEditId('');
      try {
        const refreshed = await muatJurnal(tenantId, ownerUid, { month, kelas: classFilter });
        setItems(refreshed.items);
        setNextCursor(refreshed.nextCursor);
      } catch (refreshError) {
        console.error('[lesson-journal] Jurnal tersimpan, tetapi riwayat gagal diperbarui:', refreshError);
        setError('Jurnal sudah tersimpan, tetapi riwayat belum dapat diperbarui. Muat ulang halaman untuk melihatnya.');
      }
    } catch (saveError) {
      console.error('[lesson-journal] Gagal menyimpan jurnal:', saveError);
      setError(pesanKesalahan(saveError, 'menyimpan'));
    } finally {
      setSaving(false);
    }
  }

  async function remove(item) {
    if (deletingId || !window.confirm(`Hapus jurnal ${tanggalTampil(item.tanggal)} untuk kelas ${item.kelas}? Tindakan ini tidak dapat dibatalkan.`)) return;
    setDeletingId(item.id);
    setError('');
    setNotice('');
    try {
      await hapusJurnal(tenantId, ownerUid, item.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      if (editId === item.id) resetForm();
      await catatAktivitas('deleted', item.id, FIELD_JURNAL);
      setNotice('Jurnal berhasil dihapus dari server.');
    } catch (deleteError) {
      console.error('[lesson-journal] Gagal menghapus jurnal:', deleteError);
      setError(pesanKesalahan(deleteError, 'menghapus'));
    } finally {
      setDeletingId('');
    }
  }

  function hapusDrafLokal() {
    if (!storageKey) return;
    try {
      window.localStorage.removeItem(storageKey);
      setDraftNotice('');
      setDraftError('');
      setDraftReady(true);
      if (!editId) setForm(formKosong(assignments));
    } catch (storageError) {
      console.error('[lesson-journal] Gagal menghapus draf lokal:', storageError);
      setDraftError('Draf lokal belum dapat dihapus. Periksa pengaturan penyimpanan browser.');
    }
  }

  if (!canManage) {
    return (
      <main className="lesson-journal-page">
        <section className="ale-kartu lesson-journal-notice" role="alert">
          <h1>Jurnal Mengajar Harian</h1>
          <p>Jurnal mengajar hanya dapat dikelola oleh guru dan peran turunannya.</p>
        </section>
      </main>
    );
  }

  if (!ownerUid || !tenantId) {
    return (
      <main className="lesson-journal-page">
        <section className="ale-kartu lesson-journal-notice" role="status">
          <h1>Jurnal Mengajar Harian</h1>
          <p>Akun ini belum terhubung dengan tenant sekolah. Hubungi administrator untuk memeriksa akses akun.</p>
        </section>
      </main>
    );
  }

  return (
    <main className="lesson-journal-page">
      <header className="lesson-journal-header">
        <p className="lesson-journal-kicker"><Ikon nama="file" /> Pelaksanaan pembelajaran</p>
        <h1>Jurnal Mengajar Harian</h1>
        <p>Catat materi, kegiatan, kendala, dan tindak lanjut per kelas dan jam pelajaran.</p>
      </header>

      {error && <p className="lesson-journal-message is-error" role="alert">{error}</p>}
      {notice && <p className="lesson-journal-message is-success" role="status">{notice}</p>}
      {assignmentError && <p className="lesson-journal-message is-error" role="alert">{assignmentError}</p>}
      {draftError && <p className="lesson-journal-message is-error" role="alert">{draftError}</p>}
      {auditNotice && <p className="lesson-journal-message is-success" role="status">{auditNotice}</p>}
      {auditWarning && (
        <div className="lesson-journal-message is-error" role="status">
          <p>{auditWarning}</p>
          <a href="#/pengaturan/koneksi">Buka pengaturan koneksi Google Drive</a>
          <button type="button" onClick={kirimUlangAudit} disabled={syncingAudit}>
            {syncingAudit ? 'Mengirim…' : `Coba kirim ulang${localAuditCount ? ` (${localAuditCount})` : ''}`}
          </button>
        </div>
      )}

      {loadingAssignments ? (
        <section className="ale-kartu lesson-journal-notice" role="status" aria-busy="true">
          Memuat penugasan kelas dan mata pelajaran…
        </section>
      ) : assignmentError ? null : !kelasOptions.length ? (
        <section className="ale-kartu lesson-journal-notice">
          <h2>Penugasan kelas belum tersedia</h2>
          <p>Tambahkan kelas dan mata pelajaran pada profil guru sebelum mengisi jurnal.</p>
          <a href="#/datadasar/kelas">Buka Kelas &amp; Mapel Saya</a>
        </section>
      ) : (
        <>
          <section className="ale-kartu lesson-journal-editor" aria-labelledby="lesson-journal-form-title">
            <div className="lesson-journal-section-heading">
              <div>
                <h2 id="lesson-journal-form-title">{editId ? 'Ubah jurnal' : 'Isi jurnal'}</h2>
                <p>Jurnal disimpan untuk akun guru ini dan tidak dibagikan kepada guru lain.</p>
              </div>
              {draftNotice && <span className="lesson-journal-draft-indicator" role="status">{draftNotice}</span>}
            </div>
            <form onSubmit={save}>
              <div className="lesson-journal-fields">
                <label>
                  Tanggal
                  <input
                    type="date"
                    value={form.tanggal}
                    required
                    onChange={(event) => ubahForm('tanggal', event.target.value)}
                  />
                </label>
                <label>
                  Kelas
                  <select value={form.kelas} required onChange={(event) => ubahForm('kelas', event.target.value)}>
                    <option value="">Pilih kelas</option>
                    {kelasOptions.map((kelas) => <option key={kelas} value={kelas}>{kelas}</option>)}
                  </select>
                </label>
                <label>
                  Jam ke-
                  <input
                    value={form.jam}
                    maxLength={20}
                    pattern="[0-9A-Za-z-]{1,20}"
                    placeholder="Misalnya 1-2"
                    title="Gunakan huruf, angka, atau tanda hubung (misalnya 1-2)."
                    required
                    onChange={(event) => ubahForm('jam', event.target.value)}
                  />
                </label>
                <label>
                  Mata pelajaran
                  <select value={form.mapel} onChange={(event) => ubahForm('mapel', event.target.value)}>
                    <option value="">Belum dipilih</option>
                    {mapelOptions.map((mapel) => <option key={mapel} value={mapel}>{mapel}</option>)}
                  </select>
                </label>
                <label className="lesson-journal-wide">
                  Materi pokok
                  <textarea value={form.materi} maxLength={BATAS.materi} rows={3} required onChange={(event) => ubahForm('materi', event.target.value)} />
                  <span className="lesson-journal-counter">{form.materi.length} / {BATAS.materi}</span>
                </label>
                <label className="lesson-journal-wide">
                  Kegiatan pembelajaran
                  <textarea value={form.kegiatan} maxLength={BATAS.kegiatan} rows={4} onChange={(event) => ubahForm('kegiatan', event.target.value)} />
                  <span className="lesson-journal-counter">{form.kegiatan.length} / {BATAS.kegiatan}</span>
                </label>
                <label>
                  Kendala
                  <textarea value={form.kendala} maxLength={BATAS.kendala} rows={3} onChange={(event) => ubahForm('kendala', event.target.value)} />
                  <span className="lesson-journal-counter">{form.kendala.length} / {BATAS.kendala}</span>
                </label>
                <label>
                  Tindak lanjut
                  <textarea value={form.tindakLanjut} maxLength={BATAS.tindakLanjut} rows={3} onChange={(event) => ubahForm('tindakLanjut', event.target.value)} />
                  <span className="lesson-journal-counter">{form.tindakLanjut.length} / {BATAS.tindakLanjut}</span>
                </label>
                <label>
                  Status
                  <select value={form.status} onChange={(event) => ubahForm('status', event.target.value)}>
                    <option value="draft">Draf (belum final)</option>
                    <option value="final">Final</option>
                  </select>
                </label>
              </div>
              <p className="lesson-journal-local-note">
                Draf otomatis hanya disimpan di browser dan perangkat ini. Jangan gunakan perangkat bersama untuk menyimpan catatan sensitif.
              </p>
              <div className="lesson-journal-actions">
                <button type="submit" disabled={saving || loadingAssignments}>
                  {saving ? 'Menyimpan…' : editId ? 'Simpan perubahan' : 'Simpan jurnal'}
                </button>
                {editId && <button type="button" className="is-secondary" onClick={resetForm} disabled={saving}>Batal ubah</button>}
                {!editId && (draftNotice || draftError) && (
                  <button type="button" className="is-secondary" onClick={hapusDrafLokal} disabled={saving}>
                    {draftError ? 'Hapus salinan draf lokal' : 'Hapus draf lokal'}
                  </button>
                )}
              </div>
            </form>
          </section>

          <section className="ale-kartu lesson-journal-attendance-note" role="note">
            <strong>Presensi per sesi:</strong> belum terhubung dengan jurnal ini. Riwayat scan pada menu Presensi tidak mewakili status hadir, sakit, izin, dan alfa per jam.
          </section>

          <section className="lesson-journal-history" aria-labelledby="lesson-journal-history-title">
            <div className="lesson-journal-history-heading">
              <div>
                <h2 id="lesson-journal-history-title">Riwayat jurnal</h2>
                <p>{items.length} catatan dimuat pada periode dan filter terpilih.</p>
              </div>
              <div className="lesson-journal-filters">
                <label>
                  Bulan
                  <input type="month" value={month} onChange={(event) => setMonth(event.target.value)} />
                </label>
                <label>
                  Kelas
                  <select value={classFilter} onChange={(event) => setClassFilter(event.target.value)}>
                    <option value="">Semua kelas</option>
                    {kelasOptions.map((kelas) => <option key={kelas} value={kelas}>{kelas}</option>)}
                  </select>
                </label>
              </div>
            </div>

            {loadingItems && <p className="lesson-journal-empty" role="status" aria-busy="true">Memuat riwayat jurnal…</p>}
            {!loadingItems && !error && !items.length && (
              <p className="lesson-journal-empty">Belum ada jurnal pada bulan dan kelas yang dipilih.</p>
            )}
            {!loadingItems && items.length > 0 && (
              <div className="lesson-journal-list">
                {items.map((item) => (
                  <KartuJurnal
                    key={item.id}
                    item={item}
                    onEdit={edit}
                    onDelete={remove}
                    deleting={deletingId === item.id}
                  />
                ))}
              </div>
            )}
            {!loadingItems && nextCursor && (
              <button
                type="button"
                className="is-secondary"
                onClick={loadMore}
                disabled={loadingMore}
              >
                {loadingMore ? 'Memuat…' : 'Muat jurnal berikutnya'}
              </button>
            )}
            {draftNotice && <p className="lesson-journal-history-note">{draftNotice}</p>}
          </section>
        </>
      )}
    </main>
  );
}
