// web/src/App.jsx
import React, { useEffect, Suspense, lazy, useRef, useState } from 'react';
import {
  HashRouter, Routes, Route, Navigate, useLocation, useParams,
} from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext.jsx';
import { MaintenanceGuard, PlatformControlProvider, usePlatformControls } from './context/PlatformControlContext.jsx';
import { UserMenuAccessProvider, useUserMenuAccess } from './context/UserMenuAccessContext.jsx';
import { isMenuPathDisabled } from './services/menuAccessPolicy.js';
import { UserIntegrationConsentProvider, useUserIntegrationConsent } from './context/UserIntegrationConsentContext.jsx';
import { logout } from './auth.js';
import PrivilegedMfaGate from './components/PrivilegedMfaGate.jsx';
import IntegrationConsentOnboarding from './components/IntegrationConsentOnboarding.jsx';
import { canOpenRolePath } from './services/roleAccess.js';
import { ucapkanNotifikasi } from './services/announcementAudio.js';

function SpokenStatus({ as: Element = 'div', className, children }) {
  const message = typeof children === 'string' ? children : '';
  useEffect(() => {
    if (message) ucapkanNotifikasi(message);
  }, [message]);

  return <Element className={className} role="status" aria-live="polite">{children}</Element>;
}

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

function LegacyPage({ render, aiGenerationEnabled }) {
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
      Promise.resolve(render(node, {
        path: location.pathname,
        search: location.search,
        params,
        aiGenerationEnabled,
      }))
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
  }, [render, aiGenerationEnabled, location.pathname, location.search]);

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
  default: function PerencanaanRoute() {
    const { features } = usePlatformControls();
    return <LegacyPage render={halamanPerencanaan} aiGenerationEnabled={features.aiGeneration} />;
  },
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
const HalamanPurchase = lazy(() => import('./pages/PurchasePage.jsx'));
const HalamanTestimoni = lazy(() => import('./pages/TestimonialPage.jsx'));
const HalamanRuangKelas = lazy(() => import('./pages/RuangKelasPage.jsx'));
const HalamanAdminPengguna = lazy(() => import('./pages/AdminUsersPage.jsx'));
const HalamanVerifikasiWaliSiswa = lazy(() => import('./pages/StudentGuardianVerificationPage.jsx'));
const HalamanPengumumanSekolah = lazy(() => import('./pages/SchoolAnnouncementsPage.jsx'));
const HalamanPresensi = lazy(() => import('./pages/AttendancePage.jsx'));
const HalamanJurnalMengajar = lazy(() => import('./pages/ClassroomJournalPage.jsx'));
const HalamanLaporanAktivitasKelas = lazy(() => import('./pages/ClassroomActivityReportPage.jsx'));
const HalamanGoogleWorkspace = lazy(() => import('./pages/GoogleWorkspacePage.jsx'));
const HalamanIntegrasiAI = lazy(() => import('./pages/AIIntegrationsPage.jsx'));
const HalamanBankSoal = lazy(() => import('./pages/QuestionBankPage.jsx'));
const HalamanUjianOnline = lazy(() => import('./pages/OnlineAssessmentPage.jsx'));
const HalamanAnalisisPenilaian = lazy(() => import('./pages/ClassroomAssessmentReportPage.jsx'));
const HalamanAsesmenAdmin = lazy(() => import('./pages/SchoolAssessmentOverviewPage.jsx'));
const HalamanRaporSekolah = lazy(() => import('./pages/SchoolReportCardPage.jsx'));
const HalamanKepemimpinanSekolah = lazy(() => import('./pages/SchoolLeadershipPage.jsx'));
const HalamanPenugasanWaliKelas = lazy(() => import('./pages/HomeroomAssignmentsPage.jsx'));
const HalamanRuangBelajarSiswa = lazy(() => import('./pages/StudentLearningPage.jsx'));
const HalamanAksesAkademikOrangTua = lazy(() => import('./pages/ParentAcademicAccessPage.jsx'));
const HalamanTautkanAkunSiswa = lazy(() => import('./pages/StudentAccountLinkPage.jsx'));
const HalamanTenantPlatform = lazy(() => import('./pages/PlatformTenantsPage.jsx'));
const HalamanPenggunaPlatform = lazy(() => import('./pages/PlatformUsersPage.jsx'));
const HalamanOperasiPlatform = lazy(() => import('./pages/PlatformOperationsPage.jsx'));
const HalamanPenggunaSupabase = lazy(() => import('./pages/SupabasePlatformUsersPage.jsx'));
const HalamanPrivasi = lazy(() => import('./pages/PrivacyNoticePage.jsx'));
const HalamanTrial = lazy(() => import('./pages/TrialDemoPage.jsx'));
const AppShell = lazy(() => import('./components/AppShell.jsx'));

function PrivateShell({ children }) {
  const { user, role, activeRole, passwordRecovery } = useAuth();
  const menuAccess = useUserMenuAccess();
  const integrationConsent = useUserIntegrationConsent();
  const location = useLocation();
  const [loggingOut, setLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState('');

  async function keluarDariAkun() {
    setLoggingOut(true);
    setLogoutError('');
    try {
      await logout();
    } catch (error) {
      console.error('[app] Gagal keluar dari akun:', error);
      setLogoutError(error instanceof Error ? error.message : 'Akun belum berhasil dikeluarkan.');
      setLoggingOut(false);
    }
  }

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (passwordRecovery) return <Navigate to="/login" replace />;
  if ((activeRole || role) === 'demo') return <Navigate to="/trial" replace />;
  if (!canOpenRolePath(activeRole || role, location.pathname)) {
    return <Navigate to="/dashboard" replace />;
  }
  if (menuAccess.loading || menuAccess.forUserId !== user.uid) {
    return (
      <SpokenStatus as="main" className="platform-tenants">
        Memverifikasi akses menu. Mohon tunggu.
      </SpokenStatus>
    );
  }
  if (menuAccess.error) {
    return (
      <main className="platform-tenants">
        <section className="platform-tenants-card" role="alert">
          <h1>Akses menu belum dapat diverifikasi</h1>
          <p>{menuAccess.error}</p>
          <div className="platform-tenants-toolbar">
            <button
              className="platform-tenants-button"
              type="button"
              onClick={() => void menuAccess.refresh()}
            >
              Coba lagi
            </button>
            <button
              className="platform-tenants-button secondary"
              type="button"
              onClick={() => void keluarDariAkun()}
              disabled={loggingOut}
            >
              {loggingOut ? 'Sedang keluar...' : 'Keluar dari akun'}
            </button>
          </div>
          {logoutError && <p className="platform-tenants-error">{logoutError}</p>}
        </section>
      </main>
    );
  }
  if (integrationConsent.loading || integrationConsent.forUserId !== user.uid) {
    return (
      <SpokenStatus as="main" className="platform-tenants">
        Memuat pilihan integrasi akun. Mohon tunggu.
      </SpokenStatus>
    );
  }
  if (integrationConsent.error) {
    return (
      <main className="platform-tenants">
        <section className="platform-tenants-card" role="alert">
          <h1>Persetujuan integrasi belum dapat diverifikasi</h1>
          <p>{integrationConsent.error}</p>
          <button type="button" onClick={() => void integrationConsent.refresh()}>Coba lagi</button>
        </section>
      </main>
    );
  }
  if (integrationConsent.needsOnboarding) {
    return (
      <IntegrationConsentOnboarding
        initialServices={integrationConsent.consent?.services || []}
        canCancel={Boolean(integrationConsent.consent)}
        onCancel={integrationConsent.closePreferences}
        onSave={integrationConsent.complete}
      />
    );
  }
  if (isMenuPathDisabled(menuAccess.disabledKeys, activeRole || role, location.pathname, location.search)) {
    return (
      <main className="platform-tenants">
        <section className="platform-tenants-card" role="alert">
          <h1>Menu ini dibatasi</h1>
          <p>Akses ke menu ini dinonaktifkan oleh superadmin untuk akun Anda.</p>
          {!isMenuPathDisabled(menuAccess.disabledKeys, activeRole || role, '/dashboard') && (
            <a href="#/dashboard">Kembali ke Dashboard</a>
          )}
        </section>
      </main>
    );
  }
  return (
    <PrivilegedMfaGate key={activeRole || role} role={activeRole || role} userId={user.uid}>
      <MaintenanceGuard>
        <AppShell path={location.pathname} search={location.search}>{children}</AppShell>
      </MaintenanceGuard>
    </PrivilegedMfaGate>
  );
}

export function RouteWrapper() {
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
    || location.pathname.startsWith('/scan/');
  if (loading && !publicRoute) {
    return (
      <SpokenStatus className="app-loader">
        Sedang memeriksa sesi Anda. Mohon tunggu.
      </SpokenStatus>
    );
  }

  return (
    <Suspense fallback={(
      <SpokenStatus className="loading-spinner">
        Aplikasi sedang dimuat. Mohon tunggu sebentar.
      </SpokenStatus>
    )}>
      <Routes>
        <Route path="/login" element={user && !passwordRecovery ? <Navigate to={selectedRole === 'demo' ? '/trial' : '/dashboard'} replace /> : <HalamanLogin />} />
        <Route path="/trial" element={user ? (selectedRole === 'demo' ? <HalamanTrial /> : <Navigate to="/dashboard" replace />) : <Navigate to="/login" replace />} />
        <Route path="/privacy" element={<HalamanPrivasi />} />
        <Route path="/platform/supabase-users" element={<PrivateShell><HalamanPenggunaSupabase /></PrivateShell>} />
        <Route path="/scan/:kode" element={<HalamanScan />} />
        <Route path="/" element={<Navigate to={user ? (passwordRecovery ? '/login' : selectedRole === 'demo' ? '/trial' : '/dashboard') : '/login'} replace />} />
        
        <Route path="/dashboard" element={<PrivateShell><HalamanDashboard /></PrivateShell>} />
        <Route path="/purchase" element={<PrivateShell><HalamanPurchase /></PrivateShell>} />
        <Route path="/ruang-kelas" element={<PrivateShell><HalamanRuangKelas /></PrivateShell>} />
        <Route path="/testimoni" element={<PrivateShell><HalamanTestimoni /></PrivateShell>} />
        <Route path="/admin/pengguna/verifikasi-wali" element={<PrivateShell><HalamanVerifikasiWaliSiswa /></PrivateShell>} />
        <Route path="/admin/pengguna/:sub" element={<PrivateShell><HalamanAdminPengguna /></PrivateShell>} />
        <Route path="/admin/pengguna/tautkan-siswa" element={<PrivateShell><HalamanTautkanAkunSiswa /></PrivateShell>} />
        <Route path="/admin/komunikasi/pengumuman" element={<Navigate to="/pengumuman" replace />} />
        <Route path="/pengumuman" element={<PrivateShell><HalamanPengumumanSekolah /></PrivateShell>} />
        <Route path="/pelaksanaan/presensi" element={<PrivateShell><HalamanPresensi /></PrivateShell>} />
        <Route path="/pelaksanaan/jurnal" element={<PrivateShell><HalamanJurnalMengajar /></PrivateShell>} />
        <Route path="/laporan/harian-bulanan" element={<PrivateShell><HalamanLaporanAktivitasKelas /></PrivateShell>} />
        <Route path="/program-kegiatan" element={<PrivateShell><HalamanProgramKegiatan /></PrivateShell>} />
        <Route path="/pengaturan/google" element={<PrivateShell><HalamanGoogleWorkspace /></PrivateShell>} />
        <Route path="/pengaturan/api-ai" element={<PrivateShell><HalamanIntegrasiAI /></PrivateShell>} />
        <Route path="/asesmen/bank-soal" element={<PrivateShell><HalamanBankSoal /></PrivateShell>} />
        <Route path="/asesmen/generator-ai" element={<PrivateShell><HalamanBankSoal /></PrivateShell>} />
        <Route path="/asesmen/ujian-online" element={<PrivateShell><HalamanUjianOnline /></PrivateShell>} />
        <Route path="/asesmen/penilaian-otomatis" element={<PrivateShell><HalamanUjianOnline /></PrivateShell>} />
        <Route path="/asesmen/analisis" element={<PrivateShell><HalamanAnalisisPenilaian /></PrivateShell>} />
        <Route path="/admin/dashboard/ujian" element={<PrivateShell><HalamanAsesmenAdmin /></PrivateShell>} />
        <Route path="/admin/asesmen/paket" element={<PrivateShell><HalamanAsesmenAdmin /></PrivateShell>} />
        <Route path="/admin/asesmen/jadwal" element={<PrivateShell><HalamanAsesmenAdmin /></PrivateShell>} />
        <Route path="/admin/asesmen/monitoring" element={<PrivateShell><HalamanAsesmenAdmin /></PrivateShell>} />
        <Route path="/admin/asesmen/analisis" element={<PrivateShell><HalamanAsesmenAdmin /></PrivateShell>} />
        <Route path="/asesmen/remedial" element={<PrivateShell><HalamanAnalisisPenilaian /></PrivateShell>} />
        <Route path="/pemantauan/catatan" element={<PrivateShell><HalamanAnalisisPenilaian /></PrivateShell>} />
        <Route path="/laporan/penilaian" element={<PrivateShell><HalamanAnalisisPenilaian /></PrivateShell>} />
        <Route path="/asesmen/rapor" element={<PrivateShell><HalamanRaporSekolah /></PrivateShell>} />
        <Route path="/kepala-sekolah/ringkasan" element={<PrivateShell><HalamanKepemimpinanSekolah /></PrivateShell>} />
        <Route path="/wali-kelas/pemantauan" element={<PrivateShell><HalamanKepemimpinanSekolah /></PrivateShell>} />
        <Route path="/admin/akademik/wali-kelas" element={<PrivateShell><HalamanPenugasanWaliKelas /></PrivateShell>} />
        <Route path="/admin/akademik/rapor" element={<PrivateShell><HalamanRaporSekolah /></PrivateShell>} />
        <Route path="/siswa/rapor" element={<PrivateShell><HalamanRaporSekolah /></PrivateShell>} />
        <Route path="/siswa/ujian" element={<PrivateShell><HalamanUjianOnline /></PrivateShell>} />
        <Route path="/siswa/nilai" element={<PrivateShell><HalamanRuangBelajarSiswa /></PrivateShell>} />
        <Route path="/siswa/jadwal" element={<PrivateShell><HalamanRuangBelajarSiswa /></PrivateShell>} />
        <Route path="/siswa/materi" element={<PrivateShell><HalamanRuangBelajarSiswa /></PrivateShell>} />
        <Route path="/orang-tua/anak" element={<PrivateShell><HalamanAksesAkademikOrangTua /></PrivateShell>} />
        <Route path="/orang-tua/nilai-kehadiran" element={<PrivateShell><HalamanAksesAkademikOrangTua /></PrivateShell>} />
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
          <UserIntegrationConsentProvider>
            <UserMenuAccessProvider>
              <RouteWrapper />
            </UserMenuAccessProvider>
          </UserIntegrationConsentProvider>
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
