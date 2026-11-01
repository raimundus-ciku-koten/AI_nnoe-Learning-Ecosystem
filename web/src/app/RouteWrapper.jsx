import React, { useEffect, Suspense, lazy, useRef, useState } from 'react';
import { Routes, Route, Navigate, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { MaintenanceGuard } from '../context/PlatformControlContext.jsx';
import PrivilegedMfaGate from '../components/PrivilegedMfaGate.jsx';
import { canOpenRolePath } from '../services/roleAccess.js';
import { CHAT_FEATURE_ENABLED, CHAT_UNAVAILABLE_MESSAGE } from '../services/featureFlags.js';

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
const HalamanLogin = lazy(() => import('../pages/login.js').then(({ halamanLogin }) => ({
  default: function LoginRoute() { return <LegacyPage render={halamanLogin} />; },
})));
const HalamanDashboard = lazy(() => import('../pages/dashboard.js').then(({ halamanDashboard }) => ({
  default: function DashboardRoute() { return <LegacyPage render={halamanDashboard} />; },
})));
const HalamanPerencanaan = lazy(() => import('../pages/perencanaan.js').then(({ halamanPerencanaan }) => ({
  default: function PerencanaanRoute() { return <LegacyPage render={halamanPerencanaan} />; },
})));
const HalamanChat = lazy(() => import('../pages/chat.js').then(({ halamanChat }) => ({
  default: function ChatRoute() { return <LegacyPage render={halamanChat} />; },
})));
const HalamanAsisten = lazy(() => import('../pages/AsistenPage.jsx'));
const HalamanProgramKegiatan = lazy(() => import('../pages/GuidanceProgramPage.jsx'));
const HalamanDataDasar = lazy(() => import('../pages/dataDasar.js').then(({ halamanDataDasar }) => ({
  default: function DataDasarRoute() { return <LegacyPage render={halamanDataDasar} />; },
})));
const HalamanScan = lazy(() => import('../pages/scan.js').then(({ halamanScan }) => ({
  default: function ScanRoute() { return <LegacyPage render={halamanScan} />; },
})));
const HalamanSubMenu = lazy(() => import('../pages/SubMenuPage.jsx'));
const HalamanArsipPerencanaan = lazy(() => import('../pages/PlanningArchivePage.jsx'));
const HalamanPurchase = lazy(() => import('../pages/PurchasePage.jsx'));
const HalamanTestimoni = lazy(() => import('../pages/TestimonialPage.jsx'));
const HalamanAdminPengguna = lazy(() => import('../pages/AdminUsersPage.jsx'));
const HalamanPresensi = lazy(() => import('../pages/AttendancePage.jsx'));
const HalamanJurnal = lazy(() => import('../pages/LessonJournalPage.jsx'));
const HalamanGoogleWorkspace = lazy(() => import('../pages/GoogleWorkspacePage.jsx'));
const HalamanPengaturanKoneksi = lazy(() => import('../pages/ConnectionSettingsPage.jsx'));
const HalamanBankSoal = lazy(() => import('../pages/QuestionBankPage.jsx'));
const HalamanUjianOnline = lazy(() => import('../pages/OnlineAssessmentPage.jsx'));
const HalamanNilaiUjianSiswa = lazy(() => import('../pages/OnlineAssessmentResultsPage.jsx'));
const HalamanCover = lazy(() => import('../pages/CoverGeneratorPage.jsx'));
const HalamanTautkanAkunSiswa = lazy(() => import('../pages/StudentAccountLinkPage.jsx'));
const HalamanTenantPlatform = lazy(() => import('../pages/PlatformTenantsPage.jsx'));
const HalamanPenggunaPlatform = lazy(() => import('../pages/PlatformUsersPage.jsx'));
const HalamanOperasiPlatform = lazy(() => import('../pages/PlatformOperationsPage.jsx'));
const HalamanPenggunaSupabase = lazy(() => import('../pages/SupabasePlatformUsersPage.jsx'));
const HalamanPrivasi = lazy(() => import('../pages/PrivacyNoticePage.jsx'));
const HalamanTrial = lazy(() => import('../pages/TrialDemoPage.jsx'));
const AppShell = lazy(() => import('../components/AppShell.jsx'));
const IntegrationSyncLifecycle = lazy(() => import('../components/IntegrationSyncLifecycle.jsx'));

function ChatFeatureGate({ children }) {
  if (CHAT_FEATURE_ENABLED) return children;
  return (
    <section className="card empty-state" role="status">
      <h2>Chat nonaktif</h2>
      <p>{CHAT_UNAVAILABLE_MESSAGE}</p>
      <a href="#/dashboard">Kembali ke dashboard</a>
    </section>
  );
}

function PrivateShell({ children }) {
  const { user, role, activeRole, passwordRecovery } = useAuth();
  const location = useLocation();

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />;
  if (passwordRecovery) return <Navigate to="/login" replace />;
  if ((activeRole || role) === 'demo') return <Navigate to="/trial" replace />;
  if (!canOpenRolePath(activeRole || role, location.pathname)) {
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
    if (!CHAT_FEATURE_ENABLED || !userId || selectedRole === 'demo') return;
    let active = true;
    Promise.all([
      import('../services/chatSync.js'),
      import('../components/chatBadge.js'),
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
    return <div className="app-loader">Memuat sesi...</div>;
  }

  return (
    <Suspense fallback={<div className="loading-spinner">Memuat...</div>}>
      <IntegrationSyncLifecycle />
      <Routes>
        <Route path="/login" element={user && !passwordRecovery ? <Navigate to={selectedRole === 'demo' ? '/trial' : '/dashboard'} replace /> : <HalamanLogin />} />
        <Route path="/trial" element={user ? (selectedRole === 'demo' ? <HalamanTrial /> : <Navigate to="/dashboard" replace />) : <Navigate to="/login" replace />} />
        <Route path="/privacy" element={<HalamanPrivasi />} />
        <Route path="/platform/supabase-users" element={user
          ? <PrivateShell><HalamanPenggunaSupabase /></PrivateShell>
          : <HalamanPenggunaSupabase />} />
        <Route path="/scan/:kode" element={<HalamanScan />} />
        <Route path="/" element={<Navigate to={user ? (passwordRecovery ? '/login' : selectedRole === 'demo' ? '/trial' : '/dashboard') : '/login'} replace />} />

        <Route path="/dashboard" element={<PrivateShell><HalamanDashboard /></PrivateShell>} />
        <Route path="/purchase" element={<PrivateShell><HalamanPurchase /></PrivateShell>} />
        <Route path="/testimoni" element={<PrivateShell><HalamanTestimoni /></PrivateShell>} />
        <Route path="/admin/pengguna/:sub" element={<PrivateShell><HalamanAdminPengguna /></PrivateShell>} />
        <Route path="/admin/pengguna/tautkan-siswa" element={<PrivateShell><HalamanTautkanAkunSiswa /></PrivateShell>} />
        <Route path="/pelaksanaan/presensi" element={<PrivateShell><HalamanPresensi /></PrivateShell>} />
        <Route path="/pelaksanaan/jurnal" element={<PrivateShell><HalamanJurnal /></PrivateShell>} />
        <Route path="/program-kegiatan" element={<PrivateShell><HalamanProgramKegiatan /></PrivateShell>} />
        <Route path="/pengaturan/google" element={<PrivateShell><HalamanGoogleWorkspace /></PrivateShell>} />
        <Route path="/pengaturan/api-ai" element={<PrivateShell><HalamanPengaturanKoneksi /></PrivateShell>} />
        <Route path="/pengaturan/koneksi" element={<PrivateShell><HalamanPengaturanKoneksi /></PrivateShell>} />
        <Route path="/asesmen/bank-soal" element={<PrivateShell><HalamanBankSoal /></PrivateShell>} />
        <Route path="/asesmen/ujian-online" element={<PrivateShell><HalamanUjianOnline /></PrivateShell>} />
        <Route path="/siswa/ujian" element={<PrivateShell><HalamanUjianOnline /></PrivateShell>} />
        <Route path="/siswa/nilai" element={<PrivateShell><HalamanNilaiUjianSiswa /></PrivateShell>} />
        <Route path="/perangkat/cover" element={<PrivateShell><HalamanCover /></PrivateShell>} />
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
        <Route path="/chat" element={<PrivateShell><ChatFeatureGate><HalamanChat /></ChatFeatureGate></PrivateShell>} />
        <Route path="/chat/baru" element={<PrivateShell><ChatFeatureGate><HalamanChat /></ChatFeatureGate></PrivateShell>} />
        <Route path="/chat/kontak" element={<PrivateShell><ChatFeatureGate><HalamanChat /></ChatFeatureGate></PrivateShell>} />
        <Route path="/chat/grup" element={<PrivateShell><ChatFeatureGate><HalamanChat /></ChatFeatureGate></PrivateShell>} />
        <Route path="/chat/telepon" element={<PrivateShell><ChatFeatureGate><HalamanChat /></ChatFeatureGate></PrivateShell>} />
        <Route path="/chat/video" element={<PrivateShell><ChatFeatureGate><HalamanChat /></ChatFeatureGate></PrivateShell>} />
        <Route path="/chat/:chatId" element={<PrivateShell><ChatFeatureGate><HalamanChat /></ChatFeatureGate></PrivateShell>} /> {/*[cite: 9] */}
        <Route path="/admin/dashboard/chat" element={<PrivateShell><ChatFeatureGate><HalamanSubMenu /></ChatFeatureGate></PrivateShell>} />
        <Route path="/asisten" element={<PrivateShell><HalamanAsisten /></PrivateShell>} />

        <Route path="/profil" element={<Navigate to="/pengaturan/akun" replace />} />
        <Route path="*" element={user
          ? (passwordRecovery ? <Navigate to="/login" replace /> : selectedRole === 'demo' ? <Navigate to="/trial" replace /> : <PrivateShell><HalamanSubMenu /></PrivateShell>)
          : <Navigate to="/login" replace />} /> {/*[cite: 9] */}
      </Routes>
    </Suspense>
  );
}

export default RouteWrapper;
