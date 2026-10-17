// src/components/LoginScreen.tsx
// FILE INI HARUS BERNAMA LoginScreen.tsx (bukan .ts) karena berisi JSX.
// Mandiri: gaya ikut di dalam berkas ini (konstanta GAYA di bawah), tanpa impor CSS
// dan tanpa Tailwind. Semua kelas berawalan "lgn", jadi tidak bentrok dengan tema.css.
import React, { useEffect, useState, type FC, type ReactNode } from 'react';
import { loginWithGoogle } from '../services/authService';

interface LoginScreenProps {
  onLoginSuccess?: () => void;
}

const PESAN_AUTH: Record<string, string> = {
  invalid_credentials: 'Email atau kata sandi tidak sesuai.',
  email_not_confirmed: 'Konfirmasikan alamat email Anda sebelum masuk.',
  user_banned: 'Akun ini dinonaktifkan. Hubungi administrator.',
  over_request_rate_limit: 'Terlalu banyak percobaan. Tunggu beberapa menit, lalu coba lagi.',
  provider_disabled: 'Login Google belum diaktifkan pada proyek Supabase.',
};

function pesanLogin(err: unknown): string | null {
  const e = err as { code?: string; message?: string } | null;
  if (e?.code && PESAN_AUTH[e.code]) return PESAN_AUTH[e.code];
  return e?.message || 'Masuk belum berhasil. Coba lagi.';
}

// Google menolak proses masuk di dalam peramban bawaan aplikasi lain (Facebook, Instagram, dsb.).
// Beri tahu guru sejak awal, sebelum mereka melihat galat "disallowed_useragent".
function perambanTertanam(): boolean {
  if (typeof navigator === 'undefined') return false;
  return /FBAN|FBAV|Instagram|Line\/|MicroMessenger|; wv\)/i.test(navigator.userAgent);
}

// Mobile-first. Dua kolom mulai 1024px (laptop). Tanpa font/gambar eksternal.
// Warna merek ada di blok variabel --lg-* paling atas.
const GAYA = `
.lgn,
.lgn *,
.lgn *::before,
.lgn *::after {
  box-sizing: border-box;
}

.lgn {
  --lg-nila-dalam: #172554;
  --lg-nila: #0f766e;
  --lg-kunyit: #99f6e4;

  --lg-halaman: #ffffff;
  --lg-permukaan: #ffffff;
  --lg-tinta: #0f172a;
  --lg-redam: #475569;
  --lg-garis: #e2e8f0;
  --lg-fokus: #0f766e;

  --lg-bahaya-bg: #fdf0ee;
  --lg-bahaya-garis: #f0c3bb;
  --lg-bahaya-tinta: #7a2417;
  --lg-info-bg: #fff7e0;
  --lg-info-garis: #efd48a;
  --lg-info-tinta: #5c4100;

  --lg-gutter: clamp(32px, 5vw, 88px);

  position: relative;
  isolation: isolate;
  min-height: 100vh;
  min-height: 100dvh;
  display: grid;
  place-items: center;
  padding:
    max(20px, env(safe-area-inset-top))
    max(16px, env(safe-area-inset-right))
    max(28px, env(safe-area-inset-bottom))
    max(16px, env(safe-area-inset-left));
  color: var(--lg-tinta);
  font-family: system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, "Noto Sans", sans-serif;
  font-size: 1rem;
  line-height: 1.5;
  -webkit-text-size-adjust: 100%;
}

.lgn h1,
.lgn h2,
.lgn p,
.lgn ul {
  margin: 0;
  padding: 0;
}

/* ---------- Latar ---------- */

.lgn__bg {
  position: absolute;
  inset: 0;
  z-index: -1;
  overflow: hidden;
  background: var(--lg-halaman);
}

/* ---------- Susunan ---------- */

.lgn__inner {
  width: 100%;
  max-width: 460px;
  display: grid;
  gap: 16px;
  grid-template-areas:
    "brand"
    "panel"
    "manfaat";
}

/* ---------- Merek ---------- */

.lgn__brand {
  grid-area: brand;
  display: grid;
  grid-template-columns: auto 1fr;
  align-items: center;
  column-gap: 14px;
  padding: 20px;
  border-radius: 24px;
  color: #fff;
  background:
    repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.06) 0, rgba(255, 255, 255, 0.06) 1px, transparent 1.5px, transparent 26px),
    repeating-linear-gradient(-45deg, rgba(255, 255, 255, 0.06) 0, rgba(255, 255, 255, 0.06) 1px, transparent 1.5px, transparent 26px),
    linear-gradient(135deg, var(--lg-nila-dalam), var(--lg-nila));
  box-shadow: 0 14px 30px -18px rgba(20, 33, 79, 0.7);
}

.lgn__logo {
  width: 88px;
  height: 56px;
  padding: 5px;
  border-radius: 12px;
  background: transparent;
  object-fit: contain;
  filter: brightness(0) invert(1);
}

.lgn__judul {
  font-size: 1.75rem;
  font-weight: 800;
  line-height: 1.1;
  letter-spacing: -0.03em;
}

.lgn__subjudul {
  grid-column: 2;
  margin-top: -0.6rem;
  color: #99f6e4;
  font-size: 0.85rem;
  font-weight: 700;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.lgn__lede {
  grid-column: 1 / -1;
  margin-top: 14px;
  font-size: 0.95rem;
  line-height: 1.55;
  color: rgba(255, 255, 255, 0.86);
}

/* ---------- Panel masuk ---------- */

.lgn__panel {
  grid-area: panel;
  display: grid;
  gap: 14px;
}

.lgn__kartu {
  padding: 24px 20px;
  border: 1px solid var(--lg-garis);
  border-radius: 20px;
  background: var(--lg-permukaan);
  box-shadow:
    0 1px 2px rgba(20, 33, 79, 0.06),
    0 18px 36px -20px rgba(20, 33, 79, 0.35);
}

.lgn__kartu h2 {
  font-size: 1.5rem;
  font-weight: 750;
  line-height: 1.2;
  letter-spacing: -0.015em;
}

.lgn__ket {
  margin: 6px 0 20px;
  color: var(--lg-redam);
  line-height: 1.55;
}

.lgn__bantuan {
  margin-top: 16px;
  font-size: 0.9rem;
  line-height: 1.5;
  text-align: center;
  color: var(--lg-redam);
}

.lgn__aman {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  font-size: 0.85rem;
  line-height: 1.4;
  text-align: center;
  color: var(--lg-redam);
}

.lgn__hak {
  font-size: 0.8rem;
  text-align: center;
  color: var(--lg-redam);
}

/* ---------- Ikon garis ---------- */

.lgn__line {
  flex: none;
  width: 20px;
  height: 20px;
  fill: none;
  stroke: currentColor;
  stroke-width: 1.8;
  stroke-linecap: round;
  stroke-linejoin: round;
}

.lgn__aman .lgn__line {
  width: 16px;
  height: 16px;
}

/* ---------- Pesan galat dan info ---------- */

.lgn__alert,
.lgn__notice {
  display: flex;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 16px;
  padding: 12px 14px;
  border: 1px solid;
  border-radius: 12px;
  font-size: 0.925rem;
  line-height: 1.5;
}

.lgn__alert {
  color: var(--lg-bahaya-tinta);
  background: var(--lg-bahaya-bg);
  border-color: var(--lg-bahaya-garis);
}

.lgn__notice {
  color: var(--lg-info-tinta);
  background: var(--lg-info-bg);
  border-color: var(--lg-info-garis);
}

.lgn__alert .lgn__line,
.lgn__notice .lgn__line {
  margin-top: 1px;
}

.lgn__alert strong,
.lgn__notice strong {
  display: block;
  font-weight: 650;
}

/* ---------- Tombol Google ----------
   Mengikuti pedoman merek Google (tema terang): latar putih, garis abu-abu,
   logo "G" warna asli, teks gelap. Tinggi 52px agar nyaman disentuh. */

.lgn__btn {
  appearance: none;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  width: 100%;
  min-height: 52px;
  padding: 0 20px;
  border: 1px solid #747775;
  border-radius: 999px;
  font: inherit;
  font-size: 1rem;
  font-weight: 600;
  letter-spacing: 0.01em;
  color: #1f1f1f;
  background: #fff;
  box-shadow: 0 1px 2px rgba(20, 33, 79, 0.12);
  cursor: pointer;
  touch-action: manipulation;
  -webkit-tap-highlight-color: transparent;
  transition: background-color 0.15s ease, box-shadow 0.15s ease, transform 0.05s ease;
}

.lgn__btn svg {
  flex: none;
  width: 22px;
  height: 22px;
}

.lgn__btn:hover:not([aria-disabled="true"]) {
  background: #f3f6fc;
  box-shadow: 0 2px 6px rgba(20, 33, 79, 0.2);
}

.lgn__btn:active:not([aria-disabled="true"]) {
  transform: translateY(1px);
}

.lgn__btn:focus-visible {
  outline: 3px solid var(--lg-fokus);
  outline-offset: 3px;
}

.lgn__btn[aria-disabled="true"] {
  color: #5f6368;
  background: #f1f3f4;
  border-color: #c4c7c5;
  box-shadow: none;
  cursor: not-allowed;
}

.lgn__btn[aria-busy="true"] {
  cursor: progress;
}

.lgn__spin {
  width: 20px;
  height: 20px;
  border: 3px solid #d3d7e4;
  border-top-color: var(--lg-nila);
  border-radius: 50%;
  animation: lgn-putar 0.8s linear infinite;
}

@keyframes lgn-putar {
  to { transform: rotate(360deg); }
}

/* ---------- Manfaat ---------- */

.lgn__manfaat {
  grid-area: manfaat;
  list-style: none;
  display: grid;
  gap: 14px;
  padding: 4px 4px 0;
  --mf-tinta: var(--lg-tinta);
  --mf-redam: var(--lg-redam);
  --mf-ikon-bg: rgba(39, 64, 139, 0.1);
  --mf-ikon: var(--lg-nila);
}

.lgn__manfaat li {
  display: flex;
  align-items: flex-start;
  gap: 14px;
}

.lgn__ikon {
  flex: none;
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  border-radius: 12px;
  color: var(--mf-ikon);
  background: var(--mf-ikon-bg);
}

.lgn__m-judul {
  display: block;
  font-weight: 650;
  color: var(--mf-tinta);
}

.lgn__m-ket {
  display: block;
  font-size: 0.9rem;
  line-height: 1.5;
  color: var(--mf-redam);
}

/* ---------- Tablet / HP besar ---------- */

@media (min-width: 640px) {
  .lgn__inner {
    max-width: 520px;
    gap: 20px;
  }

  .lgn__brand {
    padding: 24px;
  }

  .lgn__kartu {
    padding: 32px;
  }
}

/* ---------- Laptop: dua kolom ----------
   Kiri: bidang nila bermotif belah ketupat berisi merek dan manfaat.
   Kanan: kartu masuk. Pembagi kolom ada di 55% agar sejajar dengan latar. */

@media (min-width: 1024px) {
  .lgn {
    place-items: stretch;
    padding: 0;
  }

  .lgn__bg {
    background:
      linear-gradient(90deg, transparent 55%, var(--lg-halaman) 55%),
      repeating-linear-gradient(45deg, rgba(255, 255, 255, 0.06) 0, rgba(255, 255, 255, 0.06) 1px, transparent 1.5px, transparent 30px),
      repeating-linear-gradient(-45deg, rgba(255, 255, 255, 0.06) 0, rgba(255, 255, 255, 0.06) 1px, transparent 1.5px, transparent 30px),
      radial-gradient(60% 50% at 10% 0%, rgba(19, 185, 171, 0.2), transparent 70%),
      linear-gradient(160deg, var(--lg-nila-dalam), var(--lg-nila));
  }

  /* Dua aksen geometris mengambil warna teal dari logo. */
  .lgn__bg::before,
  .lgn__bg::after {
    content: "";
    position: absolute;
    left: calc(27.5% - 180px);
    bottom: -150px;
    width: 360px;
    height: 360px;
    border: 2px solid rgba(94, 234, 212, 0.34);
    transform: rotate(45deg);
  }

  .lgn__bg::after {
    left: calc(27.5% - 110px);
    bottom: -80px;
    width: 220px;
    height: 220px;
    border-color: rgba(94, 234, 212, 0.2);
  }

  .lgn__inner {
    max-width: none;
    min-height: 100vh;
    min-height: 100dvh;
    padding-block: 56px;
    column-gap: 0;
    row-gap: 40px;
    align-content: center;
    grid-template-columns: 11fr 9fr;
    grid-template-areas:
      "brand panel"
      "manfaat panel";
  }

  .lgn__brand {
    display: block;
    align-self: end;
    justify-self: end;
    width: 100%;
    max-width: calc(540px + var(--lg-gutter) * 2);
    padding: 0 var(--lg-gutter);
    border-radius: 0;
    background: none;
    box-shadow: none;
  }

  .lgn__logo {
    width: 120px;
    height: 76px;
    padding: 6px;
    border-radius: 14px;
    filter: brightness(0) invert(1);
  }

  .lgn__judul {
    margin-top: 24px;
    font-size: clamp(2.5rem, 3.6vw, 3.5rem);
    line-height: 1.05;
  }

  .lgn__subjudul { margin-top: 0.35rem; }

  .lgn__lede {
    max-width: 32ch;
    margin-top: 16px;
    font-size: 1.15rem;
  }

  .lgn__manfaat {
    align-self: start;
    justify-self: end;
    width: 100%;
    max-width: calc(540px + var(--lg-gutter) * 2);
    padding: 0 var(--lg-gutter);
    gap: 20px;
    --mf-tinta: #fff;
    --mf-redam: rgba(255, 255, 255, 0.78);
    --mf-ikon-bg: rgba(255, 255, 255, 0.1);
    --mf-ikon: var(--lg-kunyit);
  }

  .lgn__panel {
    align-self: center;
    justify-self: start;
    width: 100%;
    max-width: calc(500px + var(--lg-gutter) * 2);
    padding: 0 var(--lg-gutter);
  }

  .lgn__kartu {
    padding: 36px 32px 32px;
  }

  .lgn__kartu h2 {
    font-size: 1.75rem;
  }
}

/* ---------- Satu momen masuk, hanya jika pengguna tidak membatasi gerak ---------- */

@media (prefers-reduced-motion: no-preference) {
  .lgn__inner {
    animation: lgn-masuk 0.45s ease-out both;
  }
}

@keyframes lgn-masuk {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .lgn__spin {
    animation-duration: 2s;
  }
  .lgn__btn {
    transition: none;
  }
}

/* Mode kontras tinggi Windows */
@media (forced-colors: active) {
  .lgn__btn {
    border: 2px solid ButtonText;
  }
  .lgn__btn[aria-disabled="true"] {
    border-color: GrayText;
    color: GrayText;
  }
}
`;

type NamaIkon = 'presensi' | 'nilai' | 'kemajuan' | 'peringatan' | 'info' | 'kunci';

const GAMBAR_IKON: Record<NamaIkon, ReactNode> = {
  presensi: (
    <>
      <rect x="8" y="2" width="8" height="4" rx="1" />
      <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
      <path d="m9 14 2 2 4-4" />
    </>
  ),
  nilai: (
    <>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <path d="M14 2v6h6M8 13h8M8 17h5" />
    </>
  ),
  kemajuan: (
    <>
      <path d="M3 17l6-6 4 4 8-8" />
      <path d="M15 7h6v6" />
    </>
  ),
  peringatan: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 8v4M12 16h.01" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="10" />
      <path d="M12 16v-4M12 8h.01" />
    </>
  ),
  kunci: (
    <>
      <rect x="4" y="11" width="16" height="10" rx="2" />
      <path d="M8 11V7a4 4 0 0 1 8 0v4" />
    </>
  ),
};

const Ikon: FC<{ nama: NamaIkon }> = ({ nama }) => (
  <svg className="lgn__line" viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    {GAMBAR_IKON[nama]}
  </svg>
);

const LogoGoogle: FC = () => (
  <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z" />
    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z" />
  </svg>
);

const MANFAAT: ReadonlyArray<{ ikon: NamaIkon; judul: string; ket: string }> = [
  {
    ikon: 'presensi',
    judul: 'Catat presensi siswa',
    ket: 'Dari laptop atau HP, di kelas maupun di rumah.',
  },
  {
    ikon: 'nilai',
    judul: 'Nilai karya ilmiah',
    ket: 'Penilaian siswa tercatat rapi di satu tempat.',
  },
  {
    ikon: 'kemajuan',
    judul: 'Pantau perkembangan siswa',
    ket: 'Lihat kemajuan tiap siswa dari waktu ke waktu.',
  },
];

export const LoginScreen: FC<LoginScreenProps> = ({ onLoginSuccess }: LoginScreenProps) => {
  const [loading, setLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [online, setOnline] = useState<boolean>(() => typeof navigator === 'undefined' || navigator.onLine);
  const [tertanam] = useState<boolean>(perambanTertanam);

  // Sinyal di lapangan sering putus-sambung: tampilkan keadaannya, jangan biarkan guru menebak.
  useEffect(() => {
    const hidup = () => setOnline(true);
    const mati = () => setOnline(false);
    window.addEventListener('online', hidup);
    window.addEventListener('offline', mati);
    return () => {
      window.removeEventListener('online', hidup);
      window.removeEventListener('offline', mati);
    };
  }, []);

  const handleGoogleLogin = async () => {
    if (loading || !online) return;
    setLoading(true);
    setErrorMessage(null);
    try {
      await loginWithGoogle();
      onLoginSuccess?.();
    } catch (err: unknown) {
      const pesan = pesanLogin(err);
      if (pesan) setErrorMessage(pesan);
    } finally {
      setLoading(false);
    }
  };

  const nonaktif = loading || !online;

  return (
    <>
      <style>{GAYA}</style>
      <main className="lgn">
        <div className="lgn__bg" aria-hidden="true" />

        <div className="lgn__inner">
          <header className="lgn__brand">
            <img className="lgn__logo" src="/logo-ale-mark.png" alt="" width={120} height={76} />
            <h1 className="lgn__judul">AI_nnoe</h1>
            <p className="lgn__subjudul">Learning Ecosystem</p>
            <p className="lgn__lede">
              Penyusun perangkat ajar Kurikulum Merdeka dan alat bantu manajemen sekolah.
            </p>
          </header>

          <div className="lgn__panel">
            <section className="lgn__kartu" aria-labelledby="judul-masuk">
              <h2 id="judul-masuk">Masuk</h2>
              <p className="lgn__ket">Gunakan akun Google yang didaftarkan oleh admin sekolah Anda.</p>

              {errorMessage && (
                <div className="lgn__alert" role="alert">
                  <Ikon nama="peringatan" />
                  <p>
                    <strong>Belum bisa masuk</strong>
                    {errorMessage}
                  </p>
                </div>
              )}

              {!online && (
                <div className="lgn__notice" role="status">
                  <Ikon nama="info" />
                  <p>
                    <strong>Tidak ada koneksi internet</strong>
                    Sambungkan ke jaringan, lalu klik tombol masuk.
                  </p>
                </div>
              )}

              {tertanam && (
                <div className="lgn__notice" role="status">
                  <Ikon nama="info" />
                  <p>
                    <strong>Buka lewat Chrome atau Safari</strong>
                    Google biasanya menolak proses masuk dari dalam aplikasi lain, seperti Facebook atau Instagram.
                    Salin tautan halaman ini, lalu buka di peramban.
                  </p>
                </div>
              )}

              <button
                type="button"
                className="lgn__btn"
                onClick={handleGoogleLogin}
                aria-disabled={nonaktif}
                aria-busy={loading}
              >
                {loading ? (
                  <>
                    <span className="lgn__spin" aria-hidden="true" />
                    <span>Menghubungkan ke Google…</span>
                  </>
                ) : (
                  <>
                    <LogoGoogle />
                    <span>Masuk dengan Google</span>
                  </>
                )}
              </button>

              <p className="lgn__bantuan">Akun belum terdaftar? Hubungi admin sekolah Anda.</p>
            </section>

            <p className="lgn__aman">
              <Ikon nama="kunci" />
              <span>Kata sandi Google Anda tidak pernah dibagikan ke aplikasi ini.</span>
            </p>
            <p className="lgn__hak">© {new Date().getFullYear()} AI-nnoe</p>
          </div>

          <ul className="lgn__manfaat" aria-label="Manfaat aplikasi">
            {MANFAAT.map((m) => (
              <li key={m.judul}>
                <span className="lgn__ikon" aria-hidden="true">
                  <Ikon nama={m.ikon} />
                </span>
                <div>
                  <strong className="lgn__m-judul">{m.judul}</strong>
                  <span className="lgn__m-ket">{m.ket}</span>
                </div>
              </li>
            ))}
          </ul>
        </div>
      </main>
    </>
  );
};