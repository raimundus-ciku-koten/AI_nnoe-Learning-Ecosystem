// web/src/App.jsx
import React from 'react';
import { HashRouter, useLocation } from 'react-router-dom';
import { AuthProvider } from './context/AuthContext.jsx';
import { PlatformControlProvider } from './context/PlatformControlContext.jsx';
import { logout } from './auth.js';
import RouteWrapper from './app/RouteWrapper.jsx';

class AppErrorBoundary extends React.Component {
  state = { error: null, locationKey: this.props.locationKey };

  async kembaliKeLogin() {
    try {
      await logout();
    } catch (error) {
      console.error('[app] Gagal mengakhiri sesi saat pemulihan:', error);
    }
    window.location.hash = '#/login';
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  static getDerivedStateFromProps(props, state) {
    if (props.locationKey !== state.locationKey) {
      return { error: null, locationKey: props.locationKey };
    }
    return null;
  }

  componentDidCatch(error, info) {
    console.error('[app] Kesalahan saat merender aplikasi:', error, info);
  }

  render() {
    if (this.state.error) {
      const errorName = this.state.error.name || 'Kesalahan aplikasi';
      const errorCode = this.state.error.code ? ` (${this.state.error.code})` : '';
      const location = this.props.locationKey ? `Halaman: ${this.props.locationKey}\n` : '';
      const detail = `${location}${errorName}${errorCode}: ${this.state.error.message || 'Tidak ada pesan detail.'}`;
      return (
        <main className="app-error-screen" role="alert">
          <section className="app-error-card">
            <p className="app-error-brand">AI_nnoe Learning Ecosystem</p>
            <h1>Halaman tidak dapat ditampilkan</h1>
            <p>Jika ini muncul setelah masuk, autentikasi kemungkinan sudah selesai tetapi aplikasi gagal menampilkan halaman tujuan. Kode penyebab ada di bawah.</p>
            <div className="app-error-actions">
              <button type="button" onClick={() => window.location.reload()}>
                Muat ulang aplikasi
              </button>
              <button type="button" onClick={() => this.kembaliKeLogin()}>
                Keluar dan kembali ke halaman masuk
              </button>
            </div>
            <details className="app-error-details" open>
              <summary>Detail untuk pemecahan masalah</summary>
              <pre>{detail}</pre>
              <p>Sebelum membagikan detail ini, hapus alamat email atau informasi pribadi jika terlihat.</p>
            </details>
          </section>
        </main>
      );
    }
    return this.props.children;
  }
}

function RoutedApp() {
  const location = useLocation();
  const locationKey = `${location.pathname}${location.search}`;
  return (
    <AppErrorBoundary locationKey={locationKey}>
      <AuthProvider>
        <PlatformControlProvider>
          <RouteWrapper />
        </PlatformControlProvider>
      </AuthProvider>
    </AppErrorBoundary>
  );
}

export default function App() {
  return (
    <HashRouter>
      <RoutedApp />
    </HashRouter>
  );
}
