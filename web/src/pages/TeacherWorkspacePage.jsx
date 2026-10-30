import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import Ikon from '../components/Ikon.jsx';
import { adalahPeranGuru } from '../navigasi.js';
import {
  catatanKeCsv,
  kosongkanJurnalMengajar,
  kosongkanRefleksi,
  kosongkanRencanaKompetensi,
  kosongkanRencanaPerbaikan,
  susunIsiJurnalMengajar,
  susunIsiRencanaKompetensi,
  susunIsiRencanaPerbaikan,
  susunIsiRefleksi,
  tampilkanIsiJurnalMengajar,
  tampilkanIsiRencanaKompetensi,
  tampilkanIsiRencanaPerbaikan,
  tampilkanIsiRefleksi,
  uraikanIsiJurnalMengajar,
  uraikanIsiRencanaKompetensi,
  uraikanIsiRencanaPerbaikan,
  uraikanIsiRefleksi,
} from '../services/teacherWorkspace.js';
import {
  hapusCatatanGuruDrive, muatCatatanGuruDrive, tambahCatatanGuruDrive,
  ubahCatatanGuruDrive,
} from '../services/teacherWorkspaceDrive.js';
import {
  hubungkanGoogleDriveUntukPengguna,
  sesiGoogleWorkspacePerPengguna,
} from '../services/googleWorkspaceAuth.js';
import { identitasEnkripsiDriveDalamSesi } from '../services/driveEncryption.js';
import '../styles/teacher-workspace.css';

function tanggalHariIni() {
  const sekarang = new Date();
  return `${sekarang.getFullYear()}-${String(sekarang.getMonth() + 1).padStart(2, '0')}-${String(sekarang.getDate()).padStart(2, '0')}`;
}

function tanggalTampil(nilai) {
  if (!nilai) return '';
  const [tahun, bulan, hari] = nilai.split('-').map(Number);
  return new Intl.DateTimeFormat('id-ID', {
    day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC',
  }).format(new Date(Date.UTC(tahun, bulan - 1, hari)));
}

function waktuTampil(nilai) {
  const waktu = new Date(nilai);
  return !Number.isNaN(waktu.getTime())
    ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(waktu)
    : 'Baru saja';
}

const REFLECTION_PATH = '/refleksi/pembelajaran';
const IMPROVEMENT_PATH = '/refleksi/perbaikan';
const JOURNAL_PATH = '/pelaksanaan/jurnal';
const DEVELOPMENT_PATH = '/refleksi/kompetensi';
const REFLECTION_FIELDS = [
  { key: 'berhasil', label: 'Apa yang berjalan baik?', placeholder: 'Catat strategi atau momen belajar yang efektif.' },
  { key: 'bukti', label: 'Bukti belajar yang terlihat', placeholder: 'Tuliskan bukti umum tanpa nama atau identitas siswa.' },
  { key: 'tantangan', label: 'Apa yang perlu ditingkatkan?', placeholder: 'Catat tantangan pembelajaran atau hal yang belum tercapai.' },
  { key: 'langkahBerikutnya', label: 'Langkah berikutnya', placeholder: 'Tentukan satu tindak lanjut yang dapat dilakukan.' },
];
const IMPROVEMENT_FIELDS = [
  { key: 'fokus', label: 'Fokus perbaikan', placeholder: 'Tentukan satu praktik yang ingin ditingkatkan.' },
  { key: 'perubahan', label: 'Perubahan yang dicoba', placeholder: 'Tuliskan langkah konkret yang akan diterapkan.' },
  { key: 'indikator', label: 'Indikator keberhasilan', placeholder: 'Tentukan bukti umum yang dapat diamati.' },
  { key: 'tinjauUlang', label: 'Catatan saat tinjau ulang', placeholder: 'Catat hasil dan penyesuaian setelah dicoba.' },
];
const JOURNAL_FIELDS = [
  { key: 'tujuan', label: 'Tujuan pembelajaran', placeholder: 'Tuliskan tujuan atau kompetensi yang dibahas.' },
  { key: 'kegiatan', label: 'Kegiatan pembelajaran', placeholder: 'Ringkas strategi dan aktivitas belajar yang dilakukan.' },
  { key: 'capaian', label: 'Capaian yang diamati', placeholder: 'Catat capaian umum tanpa nama atau identitas siswa.' },
  { key: 'tindakLanjut', label: 'Tindak lanjut', placeholder: 'Tentukan penguatan atau persiapan pertemuan berikutnya.' },
];
const DEVELOPMENT_FIELDS = [
  { key: 'kompetensi', label: 'Kompetensi yang dikembangkan', placeholder: 'Pilih satu kompetensi yang ingin diperkuat.' },
  { key: 'aktivitas', label: 'Aktivitas belajar', placeholder: 'Catat lokakarya, komunitas belajar, atau praktik yang akan dicoba.' },
  { key: 'target', label: 'Target waktu', placeholder: 'Tentukan target yang realistis dan terukur.' },
  { key: 'bukti', label: 'Bukti atau capaian', placeholder: 'Catat bukti pengembangan tanpa data pribadi siswa.' },
];

const formKosong = (path, label) => ({
  modulePath: path,
  moduleLabel: label,
  judul: '',
  tanggal: tanggalHariIni(),
  kelas: '',
  mapel: '',
  isi: '',
  status: 'draf',
});

function pesanKesalahan(err, aksi) {
  if (['permission-denied', '42501'].includes(err?.code)) {
    return `Akun ini tidak diizinkan ${aksi} catatan. Pastikan akun guru terdaftar dan langganan tenant aktif.`;
  }
  return `Catatan tidak dapat ${aksi}. Periksa koneksi, lalu coba lagi.`;
}

function unduhCsv(items, namaFile) {
  const blob = new Blob([`\uFEFF${catatanKeCsv(items)}`], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const tautan = document.createElement('a');
  tautan.href = url;
  tautan.download = namaFile;
  document.body.append(tautan);
  tautan.click();
  tautan.remove();
  URL.revokeObjectURL(url);
}

export default function TeacherWorkspacePage({ grup, item }) {
  const { user, role, activeRole, tenantId } = useAuth();
  const isReflection = item.path === REFLECTION_PATH;
  const isImprovementPlan = item.path === IMPROVEMENT_PATH;
  const isJournal = item.path === JOURNAL_PATH;
  const isDevelopmentPlan = item.path === DEVELOPMENT_PATH;
  const isStructuredNote = isReflection || isImprovementPlan || isJournal || isDevelopmentPlan;
  const fieldsTerstruktur = isReflection
    ? REFLECTION_FIELDS
    : isImprovementPlan
      ? IMPROVEMENT_FIELDS
      : isJournal ? JOURNAL_FIELDS : DEVELOPMENT_FIELDS;
  const [catatan, setCatatan] = useState([]);
  const [form, setForm] = useState(() => formKosong(item.path, item.label));
  const [refleksi, setRefleksi] = useState(kosongkanRefleksi);
  const [rencanaPerbaikan, setRencanaPerbaikan] = useState(kosongkanRencanaPerbaikan);
  const [jurnal, setJurnal] = useState(kosongkanJurnalMengajar);
  const [rencanaKompetensi, setRencanaKompetensi] = useState(kosongkanRencanaKompetensi);
  const [editId, setEditId] = useState('');
  const [cari, setCari] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [saving, setSaving] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const cursor = useRef(null);
  const loadRequest = useRef(0);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const canUse = adalahPeranGuru(activeRole || role) && Boolean(user?.uid && tenantId);
  const ownerKey = canUse ? `${tenantId}:${user.uid}` : '';
  const [koneksi, setKoneksi] = useState(() => sesiGoogleWorkspacePerPengguna(user?.uid));
  const [identitasVault, setIdentitasVault] = useState(() => identitasEnkripsiDriveDalamSesi(user?.uid));
  const tokenAktif = koneksi?.expiresAt > Date.now() ? koneksi.accessToken : '';
  const vaultSiap = Boolean(tokenAktif && identitasVault);
  const [catatanOwnerKey, setCatatanOwnerKey] = useState('');
  const draftTerstruktur = isReflection
    ? refleksi
    : isImprovementPlan ? rencanaPerbaikan : isJournal ? jurnal : rencanaKompetensi;
  const jumlahKarakterTerstruktur = fieldsTerstruktur.reduce(
    (total, field) => total + draftTerstruktur[field.key].length,
    0,
  );

  const muat = useCallback(async ({ berikutnya = false } = {}) => {
    const requestId = ++loadRequest.current;
    if (!canUse) {
      cursor.current = null;
      setCatatan([]);
      setCatatanOwnerKey('');
      setHasMore(false);
      setLoading(false);
      return;
    }
    if (!vaultSiap) {
      setLoading(false);
      setLoadingMore(false);
      return;
    }
    if (berikutnya) setLoadingMore(true);
    else setLoading(true);
    setError('');
    try {
      if (!berikutnya) cursor.current = null;
      const hasil = await muatCatatanGuruDrive(
        tokenAktif,
        identitasVault,
        berikutnya ? cursor.current : '',
      );
      if (requestId !== loadRequest.current) return;
      setCatatan((sebelumnya) => berikutnya
        ? [...sebelumnya, ...hasil.entries]
        : hasil.entries);
      setCatatanOwnerKey(ownerKey);
      setHasMore(hasil.hasMore);
      cursor.current = hasil.nextCursor;
    } catch (err) {
      if (requestId !== loadRequest.current) return;
      console.error('[teacher-workspace] Gagal memuat catatan guru:', err);
      setError(['permission-denied', '42501'].includes(err?.code)
        ? 'Akses catatan pribadi ditolak. Pastikan akun guru terdaftar pada tenant dengan langganan aktif.'
        : 'Catatan belum dapat dimuat. Periksa koneksi, lalu coba lagi.');
    } finally {
      if (requestId === loadRequest.current) {
        setLoading(false);
        setLoadingMore(false);
      }
    }
  }, [canUse, identitasVault, ownerKey, tenantId, tokenAktif, user?.uid, vaultSiap]);

  useEffect(() => {
    setKoneksi(sesiGoogleWorkspacePerPengguna(user?.uid));
    setIdentitasVault(identitasEnkripsiDriveDalamSesi(user?.uid));
    loadRequest.current += 1;
    cursor.current = null;
    setCatatan([]);
    setCatatanOwnerKey('');
    setHasMore(false);
  }, [ownerKey, user?.uid]);
  useEffect(() => { muat(); }, [muat]);

  useEffect(() => {
    setForm(formKosong(item.path, item.label));
    setRefleksi(kosongkanRefleksi());
    setRencanaPerbaikan(kosongkanRencanaPerbaikan());
    setJurnal(kosongkanJurnalMengajar());
    setRencanaKompetensi(kosongkanRencanaKompetensi());
    setEditId('');
    setError('');
    setNotice('');
  }, [item.path, item.label]);

  const catatanModul = useMemo(() => {
    const term = cari.trim().toLocaleLowerCase('id');
    return (vaultSiap && catatanOwnerKey === ownerKey ? catatan : []).filter((entry) =>
      entry.modulePath === item.path
      && (!term || `${entry.judul} ${entry.kelas} ${entry.mapel} ${entry.isi}`
        .toLocaleLowerCase('id').includes(term)));
  }, [catatan, catatanOwnerKey, cari, item.path, ownerKey, vaultSiap]);

  async function hubungkanDrive() {
    setConnecting(true);
    setError('');
    setNotice('');
    try {
      const session = await hubungkanGoogleDriveUntukPengguna(user);
      setKoneksi(session);
      setIdentitasVault(identitasEnkripsiDriveDalamSesi(user.uid));
    } catch (err) {
      console.error('[teacher-workspace] Gagal menghubungkan Google Drive:', err);
      setError(err?.message || 'Google Drive tidak dapat dihubungkan.');
    } finally {
      setConnecting(false);
    }
  }

  function ubahForm(kunci, nilai) {
    setForm((sebelumnya) => ({ ...sebelumnya, [kunci]: nilai }));
  }

  function mulaiEdit(entry) {
    setForm({
      modulePath: entry.modulePath,
      moduleLabel: entry.moduleLabel,
      judul: entry.judul,
      tanggal: entry.tanggal,
      kelas: entry.kelas || '',
      mapel: entry.mapel || '',
      isi: entry.isi,
      status: entry.status,
    });
    setRefleksi(isReflection ? uraikanIsiRefleksi(entry.isi) : kosongkanRefleksi());
    setRencanaPerbaikan(isImprovementPlan
      ? uraikanIsiRencanaPerbaikan(entry.isi)
      : kosongkanRencanaPerbaikan());
    setJurnal(isJournal ? uraikanIsiJurnalMengajar(entry.isi) : kosongkanJurnalMengajar());
    setRencanaKompetensi(isDevelopmentPlan
      ? uraikanIsiRencanaKompetensi(entry.isi)
      : kosongkanRencanaKompetensi());
    setEditId(entry.id);
    setError('');
    setNotice('');
  }

  function batalEdit() {
    setForm(formKosong(item.path, item.label));
    setRefleksi(kosongkanRefleksi());
    setRencanaPerbaikan(kosongkanRencanaPerbaikan());
    setJurnal(kosongkanJurnalMengajar());
    setRencanaKompetensi(kosongkanRencanaKompetensi());
    setEditId('');
    setError('');
  }

  async function simpan(event) {
    event.preventDefault();
    if (!canUse || !vaultSiap || saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const payload = {
        ...form,
        isi: isReflection
          ? susunIsiRefleksi(refleksi)
          : isImprovementPlan
            ? susunIsiRencanaPerbaikan(rencanaPerbaikan)
            : isJournal
              ? susunIsiJurnalMengajar(jurnal)
              : isDevelopmentPlan ? susunIsiRencanaKompetensi(rencanaKompetensi) : form.isi,
      };
      if (isJournal && (!form.kelas.trim() || !form.mapel.trim())) {
        throw new Error('Kelas dan mata pelajaran wajib dipilih untuk jurnal mengajar.');
      }
      if (editId) {
        const existing = catatan.find((entry) => entry.id === editId);
        if (!existing) throw new Error('Catatan yang akan diperbarui tidak tersedia pada halaman ini.');
        await ubahCatatanGuruDrive(
          tokenAktif,
          tenantId,
          user.uid,
          identitasVault,
          editId,
          payload,
          existing.createdAt,
          existing.ciphertextSha256,
        );
        setNotice('Catatan berhasil diperbarui.');
      } else {
        await tambahCatatanGuruDrive(tokenAktif, tenantId, user.uid, identitasVault, payload);
        setNotice('Catatan berhasil disimpan.');
      }
      setForm(formKosong(item.path, item.label));
      setRefleksi(kosongkanRefleksi());
      setRencanaPerbaikan(kosongkanRencanaPerbaikan());
      setJurnal(kosongkanJurnalMengajar());
      setRencanaKompetensi(kosongkanRencanaKompetensi());
      setEditId('');
      await muat();
    } catch (err) {
      console.error('[teacher-workspace] Gagal menyimpan catatan:', err);
      setError(err instanceof Error && !err.code
        ? err.message
        : pesanKesalahan(err, 'menyimpan'));
    } finally {
      setSaving(false);
    }
  }

  async function hapus(entry) {
    if (!canUse || !vaultSiap ||
        !window.confirm(`Hapus catatan “${entry.judul}”? Tindakan ini tidak dapat dibatalkan.`)) return;
    setError('');
    setNotice('');
    try {
      await hapusCatatanGuruDrive(tokenAktif, tenantId, user.uid, identitasVault, entry.id);
      setCatatan((sebelumnya) => sebelumnya.filter((simpanEntry) => simpanEntry.id !== entry.id));
      if (editId === entry.id) batalEdit();
      setNotice('Catatan berhasil dihapus.');
    } catch (err) {
      console.error('[teacher-workspace] Gagal menghapus catatan:', err);
      setError(err instanceof Error && !err.code ? err.message : pesanKesalahan(err, 'menghapus'));
    }
  }

  function ekspor() {
    const nama = item.path.split('/').filter(Boolean).join('-');
    const items = isStructuredNote
      ? catatanModul.map((entry) => ({
        ...entry,
        isi: isReflection
          ? tampilkanIsiRefleksi(entry.isi)
          : isImprovementPlan
            ? tampilkanIsiRencanaPerbaikan(entry.isi)
            : isJournal
              ? tampilkanIsiJurnalMengajar(entry.isi)
              : tampilkanIsiRencanaKompetensi(entry.isi),
      }))
      : catatanModul;
    unduhCsv(items, `catatan-${nama}.csv`);
  }

  if (!canUse) {
    return (
      <section className="ale-kartu teacher-workspace-denied" role="alert">
        <h1>{item.label}</h1>
        <p>Ruang kerja ini hanya tersedia bagi guru yang sudah terhubung dengan sekolah.</p>
      </section>
    );
  }

  return (
    <main className="teacher-workspace">
      <header className="teacher-workspace-header">
        <div>
          <p className="teacher-workspace-kicker"><Ikon nama={grup.ikon} /> {grup.label}</p>
          <h1>{item.label}</h1>
          <p>{isReflection
            ? 'Tinjau praktik mengajar dengan bukti belajar dan rencana tindak lanjut yang jelas.'
            : isImprovementPlan
              ? 'Ubah hasil refleksi menjadi tindakan kecil yang dapat dicoba dan ditinjau kembali.'
              : isJournal
                ? 'Catat tujuan, kegiatan, capaian umum, dan tindak lanjut untuk satu sesi mengajar.'
                : isDevelopmentPlan
                  ? 'Susun langkah pengembangan profesional yang terukur dan dapat ditinjau kembali.'
                : 'Simpan dan kelola catatan kerja pribadi untuk modul ini.'}</p>
        </div>
        <a className="teacher-workspace-related" href="#/dashboard">
          <Ikon nama="home" /> Kembali ke Dashboard
        </a>
        <button type="button" onClick={hubungkanDrive} disabled={connecting || !canUse}>
          <Ikon nama="external" />
          {connecting ? 'Menghubungkan…' : tokenAktif ? `Google Drive: ${koneksi.email}` : 'Hubungkan Google Drive'}
        </button>
      </header>

      <aside className="teacher-workspace-privacy" role="note">
        <Ikon nama="shield" />
        <p>
          Isi catatan dienkripsi di browser sebelum disimpan ke Google Drive pribadi Anda.
          Supabase hanya dipakai untuk memeriksa status langganan; tidak menerima isi catatan.
          Catatan Firestore lama belum diimpor dan tidak akan muncul di daftar ini sampai migrasi terenkripsi selesai.
        </p>
      </aside>

      <aside className="teacher-workspace-privacy" role="note">
        <Ikon nama="badge" />
        <p>{isJournal
          ? 'Jurnal ini adalah catatan pribadi untuk membantu refleksi mengajar, bukan rekam resmi sekolah atau pengganti presensi dan nilai. Hindari memasukkan nama, nomor identitas, maupun informasi pribadi siswa.'
          : 'Catatan ini hanya dapat dibaca oleh akun guru Anda. Ini bukan nilai, presensi, laporan resmi, atau komunikasi dengan siswa/orang tua. Hindari memasukkan nama, nomor identitas, maupun informasi pribadi siswa.'}</p>
      </aside>

      <div className="teacher-workspace-grid">
        <section className="ale-kartu teacher-workspace-form" aria-labelledby="teacher-workspace-form-title">
          <div className="teacher-workspace-section-head">
            <div>
              <p className="teacher-workspace-eyebrow">{editId ? 'Perbarui catatan' : isReflection ? 'Refleksi baru' : isImprovementPlan || isDevelopmentPlan ? 'Rencana baru' : isJournal ? 'Jurnal baru' : 'Catatan baru'}</p>
              <h2 id="teacher-workspace-form-title">{editId ? 'Edit catatan kerja' : isReflection ? 'Refleksi pembelajaran' : isImprovementPlan ? 'Rencana perbaikan' : isJournal ? 'Jurnal mengajar' : isDevelopmentPlan ? 'Rencana pengembangan kompetensi' : 'Buat catatan kerja'}</h2>
            </div>
            <span className="teacher-workspace-status">{editId ? 'Mengedit' : 'Pribadi'}</span>
          </div>

          <form onSubmit={simpan}>
            <label>
              Judul
              <input
                required maxLength={120} value={form.judul} disabled={!vaultSiap || saving}
                onChange={(event) => ubahForm('judul', event.target.value)}
                placeholder={isReflection
                  ? 'Contoh: Refleksi pembelajaran pekan ini'
                  : isImprovementPlan
                    ? 'Contoh: Pemerataan diskusi kelas'
                    : isJournal
                      ? 'Contoh: Persamaan linear dua variabel'
                      : isDevelopmentPlan ? 'Contoh: Asesmen formatif' : 'Beri judul catatan'}
              />
            </label>
            <div className="teacher-workspace-form-row">
              <label>
                {isImprovementPlan ? 'Tanggal tinjau ulang' : isJournal ? 'Tanggal mengajar' : 'Tanggal'}
                <input required type="date" value={form.tanggal}
                  disabled={!vaultSiap || saving}
                  onChange={(event) => ubahForm('tanggal', event.target.value)} />
              </label>
              <label>
                Status
                <select value={form.status} disabled={!vaultSiap || saving}
                  onChange={(event) => ubahForm('status', event.target.value)}>
                  <option value="draf">Draf</option>
                  <option value="selesai">Selesai</option>
                </select>
              </label>
            </div>
            <div className="teacher-workspace-form-row">
              <label>
                Kelas {!isJournal && <span>(opsional)</span>}
                <input required={isJournal} maxLength={80} value={form.kelas}
                  disabled={!vaultSiap || saving}
                  onChange={(event) => ubahForm('kelas', event.target.value)}
                  placeholder="Contoh: X-1" />
              </label>
              <label>
                Mata pelajaran {!isJournal && <span>(opsional)</span>}
                <input required={isJournal} maxLength={80} value={form.mapel}
                  disabled={!vaultSiap || saving}
                  onChange={(event) => ubahForm('mapel', event.target.value)}
                  placeholder="Contoh: Matematika" />
              </label>
            </div>
            {isStructuredNote ? (
              <div className="teacher-workspace-reflection-fields" aria-label={isReflection
                ? 'Bagian refleksi'
                : isImprovementPlan
                  ? 'Bagian rencana perbaikan'
                  : isJournal ? 'Bagian jurnal mengajar' : 'Bagian pengembangan kompetensi'}>
                {fieldsTerstruktur.map((field) => (
                  <label key={field.key}>
                    {field.label}
                    <textarea
                      maxLength={1400} rows={4} value={draftTerstruktur[field.key]} disabled={!vaultSiap || saving}
                      onChange={(event) => {
                        const setter = isReflection
                          ? setRefleksi
                          : isImprovementPlan
                            ? setRencanaPerbaikan
                            : isJournal ? setJurnal : setRencanaKompetensi;
                        setter((current) => ({ ...current, [field.key]: event.target.value }));
                      }}
                      placeholder={field.placeholder}
                    />
                  </label>
                ))}
                <small>{jumlahKarakterTerstruktur}/5600 karakter. Isi setidaknya satu bagian.</small>
              </div>
            ) : (
              <label>
                Catatan kerja
                <textarea
                  required maxLength={6000} rows={7} value={form.isi} disabled={!vaultSiap || saving}
                  onChange={(event) => ubahForm('isi', event.target.value)}
                  placeholder="Tuliskan rencana, refleksi, atau tindak lanjut pribadi..."
                />
                <small>{form.isi.length}/6000 karakter</small>
              </label>
            )}
            {error && <p className="teacher-workspace-error" role="alert">{error}</p>}
            {notice && <p className="teacher-workspace-notice" role="status">{notice}</p>}
            <div className="teacher-workspace-actions">
              <button type="submit" disabled={saving || !vaultSiap}>
                <Ikon nama="check" /> {saving ? 'Menyimpan…' : editId ? 'Simpan perubahan' : isJournal ? 'Simpan jurnal' : 'Simpan catatan'}
              </button>
              {editId && <button type="button" className="teacher-workspace-secondary" onClick={batalEdit}>Batal</button>}
            </div>
          </form>
          {!vaultSiap && (
            <p className="teacher-workspace-loading">
              Hubungkan Google Drive, lalu buka atau buat kunci vault di <a href="#/pengaturan/google">Pengaturan Google Workspace</a>.
            </p>
          )}
        </section>

        <section className="ale-kartu teacher-workspace-list" aria-labelledby="teacher-workspace-list-title">
          <div className="teacher-workspace-section-head">
            <div>
              <p className="teacher-workspace-eyebrow">Tersimpan di akun ini</p>
              <h2 id="teacher-workspace-list-title">Catatan {item.label}</h2>
            </div>
            <button type="button" className="teacher-workspace-icon-button" onClick={() => muat()}
              disabled={loading} aria-label="Muat ulang catatan">
              <Ikon nama="refresh" />
            </button>
          </div>

          <div className="teacher-workspace-list-tools">
            <label>
              <span className="sr-only">Cari catatan</span>
              <input type="search" value={cari} onChange={(event) => setCari(event.target.value)}
                placeholder="Cari judul, kelas, atau isi" />
            </label>
            <button type="button" className="teacher-workspace-secondary"
              onClick={ekspor} disabled={catatanModul.length === 0}>
              Ekspor CSV
            </button>
          </div>

          {error && <p className="teacher-workspace-error" role="alert">{error}</p>}
          {loading && <p className="teacher-workspace-loading" role="status">Memuat catatan…</p>}
          {!loading && !vaultSiap && (
            <p className="teacher-workspace-loading" role="status">
              Hubungkan Google Drive dan buka kunci vault untuk melihat catatan terenkripsi.
            </p>
          )}
          {!loading && vaultSiap && catatanModul.length === 0 && (
            <div className="teacher-workspace-empty">
              <Ikon nama="file" />
              <h3>{cari ? 'Tidak ada catatan yang cocok' : 'Belum ada catatan pada modul ini'}</h3>
              <p>{cari ? 'Coba kata kunci lain.' : 'Catatan yang disimpan akan tampil di sini.'}</p>
            </div>
          )}
          <ul className="teacher-workspace-entries">
            {catatanModul.map((entry) => (
              <li key={entry.id} className="teacher-workspace-entry">
                <div className="teacher-workspace-entry-top">
                  <div>
                    <span className={`teacher-workspace-tag is-${entry.status}`}>
                      {entry.status === 'selesai' ? 'Selesai' : 'Draf'}
                    </span>
                    <h3>{entry.judul}</h3>
                  </div>
                  <span className="teacher-workspace-date">{tanggalTampil(entry.tanggal)}</span>
                </div>
                {(entry.kelas || entry.mapel) && (
                  <p className="teacher-workspace-context">
                    {[entry.kelas, entry.mapel].filter(Boolean).join(' · ')}
                  </p>
                )}
                <p className="teacher-workspace-entry-body">
                  {isReflection
                    ? tampilkanIsiRefleksi(entry.isi)
                    : isImprovementPlan
                      ? tampilkanIsiRencanaPerbaikan(entry.isi)
                      : isJournal
                        ? tampilkanIsiJurnalMengajar(entry.isi)
                        : isDevelopmentPlan ? tampilkanIsiRencanaKompetensi(entry.isi) : entry.isi}
                </p>
                <div className="teacher-workspace-entry-footer">
                  <small>Diperbarui {waktuTampil(entry.updatedAt)}</small>
                  <div>
                    <button type="button" onClick={() => mulaiEdit(entry)}>Edit</button>
                    <button type="button" className="is-danger" onClick={() => hapus(entry)}>Hapus</button>
                  </div>
                </div>
              </li>
            ))}
          </ul>
          {hasMore && (
            <button type="button" className="teacher-workspace-load-more"
              onClick={() => muat({ berikutnya: true })} disabled={loadingMore}>
              {loadingMore ? 'Memuat…' : 'Muat catatan berikutnya'}
            </button>
          )}
          <p className="teacher-workspace-limit">Catatan dimuat bertahap, 50 item setiap halaman.</p>
        </section>
      </div>
    </main>
  );
}
