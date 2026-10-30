// web/src/App.jsx
import React, { useEffect, Suspense, lazy, useRef, useState } from 'react';
import {
  HashRouter, Routes, Route, Navigate, useLocation, useParams,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { MaintenanceGuard, PlatformControlProvider } from './context/PlatformControlContext.jsx';
import { logout } from './auth.js';
import PrivilegedMfaGate from './components/PrivilegedMfaGate.jsx';
import { canOpenRolePath } from './services/roleAccess.js';

// Legacy Alias Mapper[cite: 10]
const LEGACY_ALIAS = {
  '#beranda': '/dashboard',
  '#rpe': '/perencanaan?jenis=rpe',
  '#atp': '/perencanaan?jenis=atp',
  '#prota': '/perencanaan?jenis=prota',
  '#prosem': '/perencanaan?jenis=prosem',
  '#kktp': '/perencanaan?jenis=kktp',
  '#modulAjar': '/perencanaan?jenis=modul',
  '#modulSiswa': '/perangkat/modul-siswa',
  '#coverPerangkat': '/perangkat/cover',
  '#profilMengajar': '/datadasar/profil',
  '#bankSoal': '/asesmen/bank-soal',
  '#hasilMapel': '/laporan/arsip-perencanaan',
  '#hasilPerencanaan': '/laporan/arsip-perencanaan',
}; //[cite: 10]

function LegacyPage({ render }) {
  const wadah = useRef(null);
  const [error, setError] = useState(null);
  const location = useLocation();
  const params = useParams();

  useEffect(() => {
    let active = true;
    let cleanup;
    const node = wadah.current;
    setError(null);

    const handleError = (err) => {
      console.error(`[page] Gagal memuat ${location.pathname}`, err);
      if (active) setError(err);
    };

    try {
      Promise.resolve(render(node, { path: location.pathname, search: location.search, params }))
        .then((dispose) => {
          if (typeof dispose !== 'function') return;
          if (active) cleanup = dispose;
          else dispose();
        })
        .catch(handleError);
    } catch (err) {
      handleError(err);
    }

    return () => {
      active = false;
      cleanup?.();
      node?.replaceChildren();
    };
  }, [render, location.pathname, location.search]);

  return (
    <>
      {error && (
        <section className="card empty-state" role="alert">
          <h1>Halaman gagal dimuat</h1>
          <p>{error.message || 'Terjadi kesalahan saat menampilkan halaman.'}</p>
        </section>
      )}
      <div ref={wadah} />
    </>
  );
}

// DOM pages are loaded only when their route is visited.
const HalamanLogin = lazy(() => import('./pages/login.js').then(({ halamanLogin }) => ({
  default: function LoginRoute() { return <LegacyPage render={halamanLogin} />; },
})));
const HalamanDashboard = lazy(() => import('./pages/dashboard.js').then(({ halamanDashboard }) => ({
  default: function DashboardRoute() { return <LegacyPage render={halamanDashboard} />; },
})));
const HalamanPerencanaan = lazy(() => import('./pages/perencanaan.js').then(({ halamanPerencanaan }) => ({
  default: function PerencanaanRoute() { return <LegacyPage render={halamanPerencanaan} />; },
})));
const HalamanChat = lazy(() => import('./pages/chat.js').then(({ halamanChat }) => ({
  default: function ChatRoute() { return <LegacyPage render={halamanChat} />; },
})));
const HalamanAsisten = lazy(() => import('./pages/AsistenPage.jsx'));
const HalamanProgramKegiatan = lazy(() => import('./pages/GuidanceProgramPage.jsx'));
const HalamanDataDasar = lazy(() => import('./pages/dataDasar.js').then(({ halamanDataDasar }) => ({
  default: function DataDasarRoute() { return <LegacyPage render={halamanDataDasar} />; },
})));
const HalamanScan = lazy(() => import('./pages/scan.js').then(({ halamanScan }) => ({
  default: function ScanRoute() { return <LegacyPage render={halamanScan} />; },
})));
const HalamanSubMenu = lazy(() => import('./pages/SubMenuPage.jsx'));
const HalamanArsipPerencanaan = lazy(() => import('./pages/PlanningArchivePage.jsx'));
const HalamanCoverPerangkat = lazy(() => import('./pages/PlanningCoverPage.jsx'));
const HalamanPurchase = lazy(() => import('./pages/PurchasePage.jsx'));
const HalamanTestimoni = lazy(() => import('./pages/TestimonialPage.jsx'));
const HalamanAdminPengguna = lazy(() => import('./pages/AdminUsersPage.jsx'));
const HalamanPresensi = lazy(() => import('./pages/AttendancePage.jsx'));
const HalamanGoogleWorkspace = lazy(() => import('./pages/GoogleWorkspacePage.jsx'));
const HalamanIntegrasiAI = lazy(() => import('./pages/AIIntegrationsPage.jsx'));
const HalamanBankSoal = lazy(() => import('./pages/QuestionBankPage.jsx'));
const HalamanUjianOnline = lazy(() => import('./pages/OnlineAssessmentPage.jsx'));
const HalamanAdminAssessment = lazy(() => import('./pages/AdminAssessmentPage.jsx'));
const HalamanNilaiUjianSiswa = lazy(() => import('./pages/OnlineAssessmentResultsPage.jsx'));
const HalamanRuangBelajarSiswa = lazy(() => import('./pages/StudentLearningPage.jsx'));
const HalamanKelolaRuangBelajar = lazy(() => import('./pages/TeacherStudentLearningPage.jsx'));
const HalamanTautkanAkunSiswa = lazy(() => import('./pages/StudentAccountLinkPage.jsx'));
const HalamanPengumumanSekolah = lazy(() => import('./pages/SchoolAnnouncementsPage.jsx'));
const HalamanTenantPlatform = lazy(() => import('./pages/PlatformTenantsPage.jsx'));
const HalamanPenggunaPlatform = lazy(() => import('./pages/PlatformUsersPage.jsx'));
const HalamanOperasiPlatform = lazy(() => import('./pages/PlatformOperationsPage.jsx'));
const HalamanPenggunaSupabase = lazy(() => import('./pages/SupabasePlatformUsersPage.jsx'));
const HalamanPrivasi = lazy(() => import('./pages/PrivacyNoticePage.jsx'));
const HalamanTrial = lazy(() => import('./pages/TrialDemoPage.jsx'));
const AppShell = lazy(() => import('./components/AppShell.jsx'));

const POST_LOGIN_RETURN_KEY = 'ale-post-login-return';

function PrivateShell({ children }) {
  const { user, role, activeRole, passwordRecovery } = useAuth();
  const location = useLocation();

  useEffect(() => {
    if (user || location.pathname !== '/siswa/ujian') return;
    const examId = new URLSearchParams(location.search).get('examId') || '';
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(examId)) return;
    try {
      window.sessionStorage.setItem(
        POST_LOGIN_RETURN_KEY,
        `#/siswa/ujian?examId=${encodeURIComponent(examId)}`,
      );
    } catch (error) {
      console.error('[app] Tautan ujian tidak dapat disimpan untuk dilanjutkan setelah login:', error);
    }
  }, [user, location.pathname, location.search]);

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (passwordRecovery) return <Navigate to="/login" replace />;
  if ((activeRole || role) === 'demo') return <Navigate to="/trial" replace />;
  if (!canOpenRolePath(activeRole || role, location.pathname, location.search)) {
    if (!canOpenRolePath(activeRole || role, '/dashboard')) {
      return (
        <main className="app-error-screen" role="alert">
          <section className="app-error-card">
            <h1>Peran belum memiliki akses</h1>
            <p>Akun ini belum memiliki peran aplikasi yang dikenal. Hubungi administrator untuk memeriksa penetapan peran.</p>
          </section>
        </main>
      );
    }
    return <Navigate to="/dashboard" replace />;
  }
  return (
    <PrivilegedMfaGate role={role} userId={user.uid}>
      <MaintenanceGuard>
        <AppShell path={location.pathname} search={location.search}>{children}</AppShell>
      </MaintenanceGuard>
    </PrivilegedMfaGate>
  );
}

function RouteWrapper() {
  const location = useLocation();
  const { loading, user, role, activeRole, passwordRecovery } = useAuth();
  const userId = user?.uid;
  const selectedRole = activeRole || role;

  // Tangani Legacy URL otomatis[cite: 10]
  useEffect(() => {
    const rawHash = window.location.hash;
    if (LEGACY_ALIAS[rawHash]) {
      window.location.hash = `#${LEGACY_ALIAS[rawHash]}`;
    }
  }, [location]);

  useEffect(() => {
    if (!userId || selectedRole === 'demo') return;
    let active = true;
    Promise.all([
      import('./services/chatSync.js'),
      import('./components/chatBadge.js'),
    ]).then(([chat, badge]) => {
      if (!active) return;
      chat.mulaiSinkronChat();
      badge.pasangLencanaChat();
    }).catch((err) => {
      console.error('[app] Gagal menginisialisasi sinkronisasi chat:', err);
    });
    return () => { active = false; };
  }, [userId, selectedRole]);

  const publicRoute = location.pathname === '/login'
    || location.pathname === '/privacy'
    || location.pathname.startsWith('/scan/')
    || location.pathname === '/platform/supabase-users';
  if (loading && !publicRoute) {
    return <div className="app-loader">Memuat sesi...</div>;
  }

  return (
    <Suspense fallback={<div className="loading-spinner">Memuat...</div>}>
      <Routes>
        <Route path="/login" element={user && !passwordRecovery ? <Navigate to={selectedRole === 'demo' ? '/trial' : '/dashboard'} replace /> : <HalamanLogin />} />
        <Route path="/trial" element={user ? (selectedRole === 'demo' ? <HalamanTrial /> : <Navigate to="/dashboard" replace />) : <Navigate to="/login" replace />} />
        <Route path="/privacy" element={<HalamanPrivasi />} />
        <Route path="/platform/supabase-users" element={<HalamanPenggunaSupabase />} />
        <Route path="/scan/:kode" element={<HalamanScan />} />
        <Route path="/" element={<Navigate to={user ? (passwordRecovery ? '/login' : selectedRole === 'demo' ? '/trial' : '/dashboard') : '/login'} replace />} />

        <Route path="/dashboard" element={<PrivateShell><HalamanDashboard /></PrivateShell>} />
        <Route path="/purchase" element={<PrivateShell><HalamanPurchase /></PrivateShell>} />
        <Route path="/testimoni" element={<PrivateShell><HalamanTestimoni /></PrivateShell>} />
        <Route path="/admin/pengguna/:sub" element={<PrivateShell><HalamanAdminPengguna /></PrivateShell>} />
        <Route path="/admin/asesmen/:sub" element={<PrivateShell><HalamanAdminAssessment /></PrivateShell>} />
        <Route path="/admin/pengguna/tautkan-siswa" element={<PrivateShell><HalamanTautkanAkunSiswa /></PrivateShell>} />
        <Route path="/pelaksanaan/presensi" element={<PrivateShell><HalamanPresensi /></PrivateShell>} />
        <Route path="/program-kegiatan" element={<PrivateShell><HalamanProgramKegiatan /></PrivateShell>} />
        <Route path="/pengumuman" element={<PrivateShell><HalamanPengumumanSekolah /></PrivateShell>} />
        <Route path="/admin/komunikasi/broadcast" element={<PrivateShell><Navigate to="/pengumuman" replace /></PrivateShell>} />
        <Route path="/perangkat/cover" element={<PrivateShell><HalamanCoverPerangkat /></PrivateShell>} />
        <Route path="/pengaturan/google" element={<PrivateShell><HalamanGoogleWorkspace /></PrivateShell>} />
        <Route path="/pengaturan/api-ai" element={<PrivateShell><HalamanIntegrasiAI /></PrivateShell>} />
        <Route path="/asesmen/bank-soal" element={<PrivateShell><HalamanBankSoal /></PrivateShell>} />
        <Route path="/asesmen/diagnostik" element={<PrivateShell><HalamanUjianOnline assessmentType="diagnostik" /></PrivateShell>} />
        <Route path="/asesmen/formatif" element={<PrivateShell><HalamanUjianOnline assessmentType="formatif" /></PrivateShell>} />
        <Route path="/asesmen/sumatif" element={<PrivateShell><HalamanUjianOnline assessmentType="sumatif" /></PrivateShell>} />
        <Route path="/asesmen/generator-ai" element={<PrivateShell><HalamanBankSoal /></PrivateShell>} />
        <Route path="/asesmen/ujian-online" element={<PrivateShell><HalamanUjianOnline /></PrivateShell>} />
        <Route path="/siswa/ujian" element={<PrivateShell><HalamanUjianOnline /></PrivateShell>} />
        <Route path="/siswa/nilai" element={<PrivateShell><HalamanNilaiUjianSiswa /></PrivateShell>} />
        <Route path="/siswa/jadwal" element={<PrivateShell><HalamanRuangBelajarSiswa /></PrivateShell>} />
        <Route path="/siswa/materi" element={<PrivateShell><HalamanRuangBelajarSiswa /></PrivateShell>} />
        <Route path="/pelaksanaan/ruang-siswa" element={<PrivateShell><HalamanKelolaRuangBelajar /></PrivateShell>} />
        <Route path="/admin/perencanaan/paket/:id?/:jenis?" element={<PrivateShell><HalamanPerencanaan /></PrivateShell>} />
        <Route path="/platform/tenant/sekolah" element={<PrivateShell><HalamanTenantPlatform /></PrivateShell>} />
        <Route path="/platform/pengguna/admin-sekolah" element={<PrivateShell><HalamanPenggunaPlatform /></PrivateShell>} />
        <Route path="/platform/*" element={<PrivateShell><HalamanOperasiPlatform /></PrivateShell>} />

        <Route path="/datadasar" element={<Navigate to="/datadasar/profil" replace />} /> {/*[cite: 9] */}
        <Route path="/datadasar/:sub" element={<PrivateShell><HalamanDataDasar /></PrivateShell>} />

        {['rpe', 'atp', 'prota', 'prosem', 'kktp', 'modul'].map((jenis) => (
          <Route key={jenis} path={`/perencanaan/${jenis}`}
            element={<Navigate to={`/perencanaan?jenis=${jenis}`} replace />} />
        ))}
        <Route path="/perencanaan/cover" element={<Navigate to="/perangkat/cover" replace />} />
        <Route path="/perencanaan/modul-siswa" element={<Navigate to="/perangkat/modul-siswa" replace />} />
        <Route path="/perangkat/modul-siswa" element={<Navigate to="/pelaksanaan/ruang-siswa" replace />} />
        <Route path="/perencanaan/banksoal" element={<Navigate to="/asesmen/bank-soal" replace />} />
        <Route path="/perencanaan/:id?/:jenis?" element={<PrivateShell><HalamanPerencanaan /></PrivateShell>} /> {/*[cite: 9] */}

        <Route path="/hasil/perencanaan" element={<PrivateShell><HalamanArsipPerencanaan /></PrivateShell>} />
        <Route path="/laporan/arsip-perencanaan" element={<PrivateShell><HalamanArsipPerencanaan /></PrivateShell>} />

        {/* Chat Routes - URUTAN KRUSIAL[cite: 9] */}
        <Route path="/chat" element={<PrivateShell><HalamanChat /></PrivateShell>} />
        <Route path="/chat/baru" element={<PrivateShell><HalamanChat /></PrivateShell>} />
        <Route path="/chat/kontak" element={<PrivateShell><HalamanChat /></PrivateShell>} />
        <Route path="/chat/grup" element={<PrivateShell><HalamanChat /></PrivateShell>} />
        <Route path="/chat/:chatId" element={<PrivateShell><HalamanChat /></PrivateShell>} /> {/*[cite: 9] */}
        <Route path="/asisten" element={<PrivateShell><HalamanAsisten /></PrivateShell>} />

        <Route path="/profil" element={<Navigate to="/pengaturan/akun" replace />} />
        <Route path="*" element={user
          ? (passwordRecovery ? <Navigate to="/login" replace /> : selectedRole === 'demo' ? <Navigate to="/trial" replace /> : <PrivateShell><HalamanSubMenu /></PrivateShell>)
          : <Navigate to="/login" replace />} /> {/*[cite: 9] */}
      </Routes>
    </Suspense>
  );
}

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
