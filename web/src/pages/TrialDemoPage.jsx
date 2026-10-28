import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useAuth } from '../context/AuthContext.jsx';
import { logout } from '../auth.js';
import '../styles/trial-demo.css';

const PERSONAS = [
  ['guru', 'Guru'],
  ['kepala_sekolah', 'Kepala Sekolah'],
  ['admin_sekolah', 'Admin Sekolah'],
  ['wali_kelas', 'Wali Kelas'],
  ['guru_bk', 'Guru BK'],
  ['guru_kokurikuler', 'Guru Kokurikuler'],
  ['guru_ekstrakurikuler', 'Guru Ekstrakurikuler'],
  ['siswa', 'Siswa'],
  ['orang_tua', 'Orang Tua/Wali'],
];

const EXAMPLE_ITEMS = [
  { id: 1, title: 'Contoh: rencana asesmen Matematika', category: 'Perencanaan' },
  { id: 2, title: 'Contoh: refleksi kegiatan kokurikuler', category: 'Kegiatan' },
  { id: 3, title: 'Contoh: agenda pendampingan BK', category: 'Bimbingan' },
];

function formatSisa(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const hari = Math.floor(total / 86400);
  const jam = Math.floor((total % 86400) / 3600);
  const menit = Math.floor((total % 3600) / 60);
  const detik = total % 60;
  return `${hari} hari ${jam} jam ${menit} menit ${detik} detik`;
}

export default function TrialDemoPage() {
  const { user, trialExpiresAt } = useAuth();
  const [now, setNow] = useState(Date.now());
  const [persona, setPersona] = useState(PERSONAS[0][0]);
  const [items, setItems] = useState(EXAMPLE_ITEMS);
  const [error, setError] = useState('');
  const additions = useRef(0);
  const nextId = useRef(4);
  const expiry = useMemo(() => {
    const parsed = Date.parse(trialExpiresAt || '');
    return Number.isFinite(parsed) ? parsed : 0;
  }, [trialExpiresAt]);
  const remaining = Math.max(0, expiry - now);
  const expired = remaining === 0;

  useEffect(() => {
    const interval = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(interval);
  }, []);

  const tambahContoh = (event) => {
    event.preventDefault();
    setError('');
    const formData = new FormData(event.currentTarget);
    const title = String(formData.get('title') || '').trim();
    if (!title || title.length > 80) {
      setError('Isi contoh kegiatan dengan 1–80 karakter.');
      return;
    }
    if (additions.current >= 5) {
      setError('Batas simulasi tercapai. Maksimal 5 item contoh dapat ditambahkan.');
      return;
    }
    additions.current += 1;
    setItems((current) => [
      ...current,
      { id: nextId.current++, title: `Contoh: ${title}`, category: 'Simulasi lokal' },
    ]);
    event.currentTarget.reset();
  };

  const keluar = async () => {
    try {
      await logout();
    } catch (logoutError) {
      console.error('[trial] Gagal keluar dari akun uji coba:', logoutError);
      setError('Belum dapat keluar. Muat ulang halaman lalu coba kembali.');
    }
  };

  if (expired) {
    return (
      <main className="trial-page">
        <section className="trial-card trial-expired" aria-labelledby="trial-title">
          <p className="trial-kicker">AI_nnoe Learning Ecosystem · Akun demo</p>
          <h1 id="trial-title">Masa uji coba telah berakhir</h1>
          <p>Uji coba berlangsung maksimal 72 jam sejak email diverifikasi. Data contoh yang Anda ubah hanya berada di memori halaman dan tidak disimpan.</p>
          <p className="trial-account">{user?.email}</p>
          {error && <p className="trial-error" role="alert">{error}</p>}
          <button className="trial-button trial-button-secondary" type="button" onClick={keluar}>Keluar</button>
        </section>
      </main>
    );
  }

  const personaLabel = PERSONAS.find(([value]) => value === persona)?.[1] || 'Guru';

  return (
    <main className="trial-page">
      <header className="trial-header">
        <a className="trial-brand" href="#/trial" aria-label="AI_nnoe Learning Ecosystem">
          <img
            src="/logo-ale-mark-1x.png"
            srcSet="/logo-ale-mark-2x.png 2x"
            alt=""
            width="46"
            height="34"
          />
          <span><strong>AI_nnoe</strong><small>Learning Ecosystem</small></span>
        </a>
        <button className="trial-button trial-button-secondary" type="button" onClick={keluar}>Keluar</button>
      </header>
      <section className="trial-card" aria-labelledby="trial-title">
        <p className="trial-kicker">Lingkungan simulasi terisolasi</p>
        <h1 id="trial-title">Jelajahi AI_nnoe dengan data contoh</h1>
        <p className="trial-intro">Ini adalah demonstrasi promosi, bukan akun sekolah. Pilihan persona hanya mengubah label simulasi dan tidak memberikan peran atau izin tambahan.</p>
        <div className="trial-meta">
          <div><span>Waktu tersisa</span><strong aria-live="off">{formatSisa(remaining)}</strong></div>
          <div><span>Akun demo</span><strong>{user?.email}</strong></div>
        </div>
        <label className="trial-label" htmlFor="trialPersona">Lihat simulasi sebagai</label>
        <select className="trial-select" id="trialPersona" value={persona} onChange={(event) => setPersona(event.target.value)}>
          {PERSONAS.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </select>
        <section className="trial-preview" aria-labelledby="trial-preview-title">
          <div className="trial-preview-heading">
            <div>
              <p className="trial-kicker">Pratinjau persona · {personaLabel}</p>
              <h2 id="trial-preview-title">Ruang kerja contoh</h2>
            </div>
            <span className="trial-badge">DATA SIMULASI</span>
          </div>
          <ul className="trial-items">
            {items.map((item) => (
              <li key={item.id}>
                <span>{item.title}</span>
                <small>{item.category}</small>
              </li>
            ))}
          </ul>
          <form className="trial-add-form" onSubmit={tambahContoh}>
            <label className="trial-label" htmlFor="trialSampleTitle">Tambahkan item simulasi (maksimal 5)</label>
            <div className="trial-add-controls">
              <input id="trialSampleTitle" name="title" type="text" maxLength="80" placeholder="Contoh: diskusi kelompok" />
              <button className="trial-button" type="submit" disabled={additions.current >= 5}>Tambah contoh</button>
            </div>
            <p className="trial-hint">Perubahan hanya ada di memori browser ini. Jangan masukkan nama, kontak, konseling, atau data pribadi siswa. Memuat ulang halaman akan menghapus simulasi.</p>
          </form>
        </section>
        {error && <p className="trial-error" role="alert">{error}</p>}
        <ul className="trial-limits">
          <li>Tidak terhubung ke data tenant/sekolah nyata atau menu administratif.</li>
          <li>AI eksternal, unggah berkas, dan integrasi Google tidak tersedia.</li>
          <li>Uji coba hanya satu kali per alamat email terverifikasi dan berakhir otomatis setelah 72 jam.</li>
        </ul>
      </section>
      <footer className="trial-footer">© {new Date().getFullYear()} AI_nnoe Learning Ecosystem</footer>
    </main>
  );
}
