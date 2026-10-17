// web/src/App.jsx
import React, { Component, useEffect, useRef } from 'react';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { useHashPath } from './hooks/useHashPath.js';
import { RUTE, navigasi, tentukanRute } from './routes.js';
import { cariMenu } from './navigasi.js';
import { halamanLogin } from './pages/login.js';
import AppShell from './components/AppShell.jsx';
import DashboardPage from './pages/DashboardPage.jsx';
import { Segera, TidakDitemukan } from './pages/HalamanLain.jsx';
import { NAMA_APLIKASI, SINGKATAN_APLIKASI } from './config.js';

/** Memasang halaman login vanilla (landing + form) dan membersihkannya saat unmount. */
function VanillaLoginWrapper() {
  const ref = useRef(null);
  useEffect(() => {
    if (!ref.current) return undefined;
    return halamanLogin(ref.current); // mengembalikan fungsi pembersih
  }, []);
  return <div ref={ref} id="app-login-root" />;
}

function LayarMemuat({ pesan = `Memuat ${NAMA_APLIKASI}…` }) {
  return (
    <div className="ale-layar-memuat" role="status" aria-live="polite">
      <span className="ale-layar-lencana" aria-hidden="true">{SINGKATAN_APLIKASI}</span>
      <span>{pesan}</span>
    </div>
  );
}

/** Pilih halaman berdasarkan path. Tambahkan fitur baru di sini. */
function Halaman({ path }) {
  if (path === RUTE.dashboard) return <DashboardPage />;
  const menu = cariMenu(path);
  return menu ? <Segera judul={menu.item.label} /> : <TidakDitemukan />;
}

function AppContent() {
  const { user, loading } = useAuth();
  const path = useHashPath();
  const tujuan = tentukanRute(path, Boolean(user));

  // Redirect sebagai efek (bukan saat render) → tanpa side-effect di render.
  useEffect(() => {
    if (!loading && tujuan.alihkan) navigasi(tujuan.path, { ganti: true });
  }, [loading, tujuan.alihkan, tujuan.path]);

  useEffect(() => {
    const judul = !user ? 'Masuk' : (cariMenu(path)?.item.label || 'Dashboard');
    document.title = `${judul} · ${NAMA_APLIKASI}`;
  }, [user, path]);

  if (loading) return <LayarMemuat />;
  if (!user) return <VanillaLoginWrapper />;
  if (tujuan.alihkan) return <LayarMemuat pesan="Mengalihkan…" />;

  return (
    <AppShell path={path} judulHalaman={cariMenu(path) ? undefined : 'Tidak ditemukan'}>
      <Halaman path={path} />
    </AppShell>
  );
}

/** Tangkap galat render agar layar tidak kosong. */
class BatasGalat extends Component {
  state = { galat: null };
  static getDerivedStateFromError(galat) { return { galat }; }
  componentDidCatch(galat, info) { console.error('[App] galat render:', galat, info?.componentStack); }
  render() {
    if (!this.state.galat) return this.props.children;
    return (
      <div className="ale-layar-memuat" role="alert">
        <strong>Terjadi kesalahan tak terduga.</strong>
        <button type="button" className="tombol" onClick={() => window.location.reload()}>
          Muat ulang
        </button>
      </div>
    );
  }
}

export default function App() {
  return (
    <BatasGalat>
      <AuthProvider>
        <AppContent />
      </AuthProvider>
    </BatasGalat>
  );
}
