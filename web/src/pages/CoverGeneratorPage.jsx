import React, { useEffect, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { adalahPeranGuru } from '../navigasi.js';
import {
  daftarRiwayatCover,
  hapusRiwayatCover,
  simpanRiwayatCover,
  validasiDataCover,
} from '../services/coverHistory.js';
import '../styles/cover-generator.css';

const FORM_AWAL = {
  mapel: '',
  kelas: '',
  tahunAjaran: '',
  penyusun: '',
  sekolah: '',
  tingkat: '',
  logoDataUrl: '',
};

const BATAS_LOGO = 1024 * 1024;
const TIPE_LOGO = new Set(['image/png', 'image/jpeg', 'image/webp']);

function bacaLogo(file) {
  if (!TIPE_LOGO.has(file.type)) {
    return Promise.reject(new Error('Pilih logo berformat PNG, JPEG, atau WebP.'));
  }
  if (file.size > BATAS_LOGO) {
    return Promise.reject(new Error('Ukuran logo maksimal 1 MB.'));
  }
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const logoDataUrl = String(reader.result || '');
        validasiDataCover({ ...FORM_AWAL, mapel: 'Matematika', kelas: 'X', logoDataUrl });
        resolve(logoDataUrl);
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error('Logo tidak dapat dibaca. Pilih berkas lain.'));
    reader.readAsDataURL(file);
  });
}

function CoverPages({ data }) {
  return (
    <>
      <article className="cover-page cover-front" aria-label="Cover depan">
        <header className="cover-front-heading">
          {data.logoDataUrl && (
            <img className="cover-school-logo" src={data.logoDataUrl} alt="Logo sekolah" />
          )}
          {data.sekolah && <p className="cover-school-name">{data.sekolah}</p>}
          <p className="cover-label">PERANGKAT PEMBELAJARAN</p>
        </header>
        <div className="cover-front-title">
          <p className="cover-kurikulum">KURIKULUM MERDEKA</p>
          <h1>MODUL AJAR</h1>
          <h2>{data.mapel}</h2>
          <p className="cover-class">{data.kelas}</p>
          <svg className="cover-illustration" viewBox="0 0 360 150" role="img" aria-label="Ilustrasi dekoratif pembelajaran">
            <path d="M25 121 97 39l54 57 42-38 78 63Z" fill="#dbeafe" />
            <path d="m97 39 54 57 22-20-42-43Z" fill="#bfdbfe" />
            <path d="M49 121h262" stroke="#1e3a8a" strokeWidth="3" strokeLinecap="round" />
            <circle cx="286" cy="38" r="20" fill="#fef3c7" />
            <path d="M180 31v63m-31-31h63" stroke="#1e3a8a" strokeWidth="3" strokeLinecap="round" />
            <circle cx="180" cy="63" r="43" fill="none" stroke="#60a5fa" strokeWidth="2" />
          </svg>
          <dl className="cover-front-meta">
            {data.tingkat && <div><dt>Jenjang</dt><dd>{data.tingkat}</dd></div>}
            {data.tahunAjaran && <div><dt>Tahun Pelajaran</dt><dd>{data.tahunAjaran}</dd></div>}
            {data.penyusun && <div><dt>Penyusun</dt><dd>{data.penyusun}</dd></div>}
          </dl>
        </div>
        <footer className="cover-front-footer">
          {data.sekolah && <p>{data.sekolah}</p>}
          <p>Kurikulum Merdeka</p>
        </footer>
      </article>

      <article className="cover-page cover-back" aria-label="Cover belakang">
        <div className="cover-back-content">
          <p className="cover-label">IDENTITAS PERANGKAT</p>
          <h1>MODUL AJAR</h1>
          <h2>{data.mapel} · {data.kelas}</h2>
          <p className="cover-summary">
            Perangkat pembelajaran ini disusun sebagai pendamping perencanaan dan pelaksanaan
            pembelajaran. Isi dokumen dapat disesuaikan dengan tujuan pembelajaran, konteks satuan
            pendidikan, dan kebutuhan belajar peserta didik.
          </p>
          <table className="cover-meta-table">
            <tbody>
              <tr><th scope="row">Mata Pelajaran</th><td>{data.mapel}</td></tr>
              <tr><th scope="row">Kelas/Fase</th><td>{data.kelas}</td></tr>
              <tr><th scope="row">Tahun Pelajaran</th><td>{data.tahunAjaran}</td></tr>
              <tr><th scope="row">Penyusun</th><td>{data.penyusun}</td></tr>
              <tr><th scope="row">Sekolah</th><td>{data.sekolah}</td></tr>
              <tr><th scope="row">Jenjang</th><td>{data.tingkat}</td></tr>
            </tbody>
          </table>
        </div>
        <svg className="cover-back-accent" viewBox="0 0 260 260" aria-hidden="true">
          <circle cx="130" cy="130" r="112" fill="#dbeafe" />
          <circle cx="130" cy="130" r="78" fill="none" stroke="#60a5fa" strokeWidth="4" />
          <path d="M130 42v176M42 130h176" stroke="#1e3a8a" strokeWidth="3" />
        </svg>
      </article>
    </>
  );
}

function formatTanggal(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? 'Waktu tidak diketahui'
    : new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(date);
}

export default function CoverGeneratorPage() {
  const { user, role, activeRole } = useAuth();
  const [form, setForm] = useState(FORM_AWAL);
  const [preview, setPreview] = useState(null);
  const [history, setHistory] = useState([]);
  const [historyOwnerUid, setHistoryOwnerUid] = useState('');
  const [loadingHistory, setLoadingHistory] = useState(Boolean(user?.uid));
  const [saving, setSaving] = useState(false);
  const [logoName, setLogoName] = useState('');
  const [error, setError] = useState('');
  const [historyError, setHistoryError] = useState('');
  const [notice, setNotice] = useState('');
  const guru = adalahPeranGuru(activeRole || role);

  useEffect(() => {
    if (!user?.uid) {
      setHistory([]);
      setHistoryOwnerUid('');
      setLoadingHistory(false);
      return undefined;
    }
    let active = true;
    setHistory([]);
    setHistoryOwnerUid('');
    setLoadingHistory(true);
    setHistoryError('');
    daftarRiwayatCover(user.uid)
      .then((records) => {
        if (active) {
          setHistory(records);
          setHistoryOwnerUid(user.uid);
        }
      })
      .catch((loadError) => {
        console.error('[cover] Gagal memuat riwayat lokal:', loadError);
        if (active) setHistoryError(loadError?.message || 'Riwayat cover lokal tidak dapat dimuat.');
      })
      .finally(() => { if (active) setLoadingHistory(false); });
    return () => { active = false; };
  }, [user?.uid]);

  function ubahForm(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
    setError('');
    setNotice('');
  }

  async function pilihLogo(event) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    if (!file) return;
    setError('');
    setNotice('');
    try {
      const logoDataUrl = await bacaLogo(file);
      setForm((current) => ({ ...current, logoDataUrl }));
      setLogoName(file.name);
    } catch (logoError) {
      console.error('[cover] Logo sekolah tidak dapat digunakan:', logoError);
      setError(logoError?.message || 'Logo tidak dapat digunakan.');
      input.value = '';
    }
  }

  async function buatCover(event) {
    event.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const data = validasiDataCover(form);
      setPreview(data);
      if (!user?.uid) {
        setNotice('Cover siap dicetak. Riwayat tidak disimpan karena sesi akun belum tersedia.');
        return;
      }
      try {
        const record = await simpanRiwayatCover(user.uid, data);
        setHistory((current) => [record, ...current]);
        setHistoryOwnerUid(user.uid);
        setHistoryError('');
        setNotice('Cover siap dicetak dan riwayat tersimpan di browser pada perangkat ini.');
      } catch (saveError) {
        console.error('[cover] Pratinjau siap, tetapi riwayat lokal gagal disimpan:', saveError);
        setError(`Cover siap dicetak, tetapi riwayat lokal gagal disimpan. ${saveError?.message || 'Coba lagi setelah memeriksa penyimpanan browser.'}`);
      }
    } catch (validationError) {
      setError(validationError?.message || 'Periksa kembali data cover.');
    } finally {
      setSaving(false);
    }
  }

  function bukaRiwayat(record) {
    setForm(record.data);
    setPreview(record.data);
    setLogoName(record.data.logoDataUrl ? 'Logo dari riwayat lokal' : '');
    setError('');
    setNotice('Cover dimuat dari riwayat lokal pada perangkat ini.');
  }

  async function hapusRiwayat(record) {
    if (!user?.uid || !window.confirm('Hapus cover ini dari riwayat lokal pada perangkat ini?')) return;
    setError('');
    setNotice('');
    try {
      const deleted = await hapusRiwayatCover(user.uid, record.id);
      if (!deleted) throw new Error('Cover tidak ditemukan pada akun lokal ini.');
      setHistory((current) => current.filter((entry) => entry.id !== record.id));
      setNotice('Cover dihapus dari riwayat lokal perangkat ini.');
    } catch (deleteError) {
      console.error('[cover] Gagal menghapus riwayat lokal:', deleteError);
      setError(deleteError?.message || 'Riwayat cover tidak dapat dihapus.');
    }
  }

  if (!guru) {
    return (
      <section className="cover-generator-denied" role="alert">
        <h1>Cover perangkat hanya dapat dikelola oleh guru</h1>
        <p>Gunakan akun dengan peran guru untuk membuat cover pembelajaran.</p>
      </section>
    );
  }

  const visibleHistory = historyOwnerUid === user?.uid ? history : [];

  return (
    <main className="cover-generator">
      <header className="cover-generator-heading">
        <p className="cover-generator-kicker">Perencanaan Pembelajaran</p>
        <h1>Cover Perangkat</h1>
        <p>Buat cover depan dan belakang secara lokal tanpa layanan AI atau koneksi penyimpanan cloud.</p>
        <p className="cover-storage-notice">
          Riwayat hanya tersimpan di browser dan perangkat ini. Data tidak disinkronkan atau
          dicadangkan ke Drive; hapus riwayat jika memakai perangkat bersama.
        </p>
      </header>

      <div className="cover-generator-layout">
        <section className="cover-form-card" aria-labelledby="cover-form-title">
          <h2 id="cover-form-title">Data cover</h2>
          <form onSubmit={buatCover}>
            <label>
              Mata pelajaran <span aria-hidden="true">*</span>
              <input
                autoComplete="off"
                maxLength={100}
                required
                value={form.mapel}
                onChange={(event) => ubahForm('mapel', event.target.value)}
              />
            </label>
            <label>
              Kelas/Fase <span aria-hidden="true">*</span>
              <input
                autoComplete="off"
                maxLength={40}
                required
                value={form.kelas}
                onChange={(event) => ubahForm('kelas', event.target.value)}
              />
            </label>
            <label>
              Tahun pelajaran <span>(opsional)</span>
              <input
                autoComplete="off"
                maxLength={30}
                value={form.tahunAjaran}
                onChange={(event) => ubahForm('tahunAjaran', event.target.value)}
              />
            </label>
            <label>
              Penyusun <span>(opsional)</span>
              <input
                autoComplete="name"
                maxLength={100}
                value={form.penyusun}
                onChange={(event) => ubahForm('penyusun', event.target.value)}
              />
            </label>
            <label>
              Nama sekolah <span>(opsional)</span>
              <input
                autoComplete="organization"
                maxLength={150}
                value={form.sekolah}
                onChange={(event) => ubahForm('sekolah', event.target.value)}
              />
            </label>
            <label>
              Jenjang <span>(opsional)</span>
              <input
                autoComplete="off"
                maxLength={80}
                value={form.tingkat}
                onChange={(event) => ubahForm('tingkat', event.target.value)}
              />
            </label>
            <label>
              Logo/kop sekolah <span>(opsional, PNG/JPEG/WebP maks. 1 MB)</span>
              <input
                accept="image/png,image/jpeg,image/webp"
                aria-describedby="cover-logo-help"
                onChange={(event) => void pilihLogo(event)}
                type="file"
              />
            </label>
            <p id="cover-logo-help" className="cover-form-help">
              Jika logo belum diunggah, area kop dibiarkan kosong. Logo hanya disimpan bersama
              riwayat lokal cover.
            </p>
            {logoName && (
              <div className="cover-logo-selected">
                <span>{logoName}</span>
                <button
                  type="button"
                  onClick={() => {
                    setForm((current) => ({ ...current, logoDataUrl: '' }));
                    setLogoName('');
                  }}
                >
                  Hapus logo
                </button>
              </div>
            )}

            {error && <p className="cover-feedback is-error" role="alert">{error}</p>}
            {notice && <p className="cover-feedback" role="status">{notice}</p>}

            <div className="cover-form-actions">
              <button type="submit" disabled={saving}>
                {saving ? 'Membuat cover…' : 'Buat cover dan simpan riwayat'}
              </button>
              <button
                type="button"
                className="is-secondary"
                onClick={() => {
                  setForm(FORM_AWAL);
                  setPreview(null);
                  setLogoName('');
                  setError('');
                  setNotice('');
                }}
              >
                Bersihkan
              </button>
            </div>
          </form>

          <section className="cover-history" aria-labelledby="cover-history-title">
            <h2 id="cover-history-title">Riwayat pada perangkat ini</h2>
            {loadingHistory && <p role="status" aria-busy="true">Memuat riwayat cover…</p>}
            {historyError && <p className="cover-feedback is-error" role="alert">{historyError}</p>}
            {!loadingHistory && !historyError && visibleHistory.length === 0 && (
              <p>Cover yang disimpan akan tampil di sini.</p>
            )}
            {visibleHistory.map((record) => (
              <article className="cover-history-item" key={record.id}>
                <div>
                  <strong>{record.data.mapel} · {record.data.kelas}</strong>
                  <time dateTime={record.createdAt}>{formatTanggal(record.createdAt)}</time>
                </div>
                <button type="button" onClick={() => bukaRiwayat(record)}>Buka</button>
                <button
                  type="button"
                  className="is-danger"
                  onClick={() => void hapusRiwayat(record)}
                >
                  Hapus
                </button>
              </article>
            ))}
          </section>
        </section>

        <section className="cover-preview-panel" aria-labelledby="cover-preview-title">
          <div className="cover-preview-toolbar">
            <div>
              <h2 id="cover-preview-title">Pratinjau cetak</h2>
              <p>Ukuran A4 · dua halaman · Times New Roman</p>
            </div>
            <button type="button" disabled={!preview} onClick={() => window.print()}>
              Cetak / Simpan sebagai PDF
            </button>
          </div>
          {!preview ? (
            <p className="cover-preview-empty" role="status">
              Isi mata pelajaran dan kelas/fase, lalu buat cover untuk melihat pratinjau.
            </p>
          ) : (
            <div className="cover-print-area">
              <CoverPages data={preview} />
            </div>
          )}
        </section>
      </div>
    </main>
  );
}

export { CoverPages };
