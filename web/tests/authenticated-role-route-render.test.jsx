import React from 'react';
import { PassThrough } from 'node:stream';
import { renderToPipeableStream } from 'react-dom/server';
import { MemoryRouter, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { menuUntukPeran } from '../src/navigasi.js';
import { canOpenRolePath } from '../src/services/roleAccess.js';

const auth = vi.hoisted(() => ({
  loading: false,
  user: { uid: 'authenticated-route-test-user' },
  role: 'admin_sekolah',
  activeRole: null,
  tenantId: 'authenticated-route-test-tenant',
  passwordRecovery: false,
}));

vi.mock('../src/context/AuthContext.jsx', () => ({
  AuthProvider: ({ children }) => children,
  useAuth: () => auth,
}));
vi.mock('../src/context/UserMenuAccessContext.jsx', () => ({
  UserMenuAccessProvider: ({ children }) => children,
  useUserMenuAccess: () => ({
    loading: false,
    forUserId: auth.user.uid,
    error: null,
    disabledKeys: [],
    refresh: vi.fn(),
  }),
}));
vi.mock('../src/context/UserIntegrationConsentContext.jsx', () => ({
  UserIntegrationConsentProvider: ({ children }) => children,
  useUserIntegrationConsent: () => ({
    loading: false,
    forUserId: auth.user.uid,
    error: null,
    needsOnboarding: false,
    consent: { services: [] },
    refresh: vi.fn(),
  }),
}));
vi.mock('../src/context/PlatformControlContext.jsx', () => ({
  MaintenanceGuard: ({ children }) => children,
  PlatformControlProvider: ({ children }) => children,
  usePlatformControls: () => ({ features: { aiGeneration: false } }),
}));
vi.mock('../src/components/PrivilegedMfaGate.jsx', () => ({
  default: ({ children }) => children,
}));
vi.mock('../src/components/IntegrationConsentOnboarding.jsx', () => ({
  default: () => <div data-route-page="IntegrationConsentOnboarding" />,
}));
vi.mock('../src/components/AppShell.jsx', () => ({
  default: ({ path, children }) => <main data-app-path={path}>{children}</main>,
}));
vi.mock('../src/auth.js', () => ({ logout: vi.fn() }));
vi.mock('../src/services/announcementAudio.js', () => ({ ucapkanNotifikasi: vi.fn() }));

function probe(name) {
  return function RouteProbe() {
    return <div data-route-page={name}>{name}</div>;
  };
}

function legacyProbe(name) {
  return { [`halaman${name}`]: vi.fn() };
}

vi.mock('../src/pages/login.js', () => legacyProbe('Login'));
vi.mock('../src/pages/dashboard.js', () => legacyProbe('Dashboard'));
vi.mock('../src/pages/perencanaan.js', () => legacyProbe('Perencanaan'));
vi.mock('../src/pages/chat.js', () => legacyProbe('Chat'));
vi.mock('../src/pages/dataDasar.js', () => legacyProbe('DataDasar'));
vi.mock('../src/pages/scan.js', () => legacyProbe('Scan'));

vi.mock('../src/pages/AsistenPage.jsx', () => ({ default: probe('Asisten') }));
vi.mock('../src/pages/GuidanceProgramPage.jsx', () => ({ default: probe('ProgramKegiatan') }));
vi.mock('../src/pages/SubMenuPage.jsx', () => ({
  default: function FallbackProbe() {
    const location = useLocation();
    return <div data-route-fallback={location.pathname}>Panduan fallback</div>;
  },
}));
vi.mock('../src/pages/PlanningArchivePage.jsx', () => ({ default: probe('ArsipPerencanaan') }));
vi.mock('../src/pages/PurchasePage.jsx', () => ({ default: probe('Purchase') }));
vi.mock('../src/pages/TestimonialPage.jsx', () => ({ default: probe('Testimoni') }));
vi.mock('../src/pages/RuangKelasPage.jsx', () => ({ default: probe('RuangKelas') }));
vi.mock('../src/pages/AdminUsersPage.jsx', () => ({ default: probe('AdminPengguna') }));
vi.mock('../src/pages/StudentGuardianVerificationPage.jsx', () => ({ default: probe('VerifikasiWali') }));
vi.mock('../src/pages/SchoolAnnouncementsPage.jsx', () => ({ default: probe('Pengumuman') }));
vi.mock('../src/pages/AttendancePage.jsx', () => ({ default: probe('Presensi') }));
vi.mock('../src/pages/ClassroomJournalPage.jsx', () => ({ default: probe('Jurnal') }));
vi.mock('../src/pages/ClassroomActivityReportPage.jsx', () => ({ default: probe('LaporanAktivitas') }));
vi.mock('../src/pages/GoogleWorkspacePage.jsx', () => ({ default: probe('GoogleWorkspace') }));
vi.mock('../src/pages/AIIntegrationsPage.jsx', () => ({ default: probe('IntegrasiAI') }));
vi.mock('../src/pages/QuestionBankPage.jsx', () => ({ default: probe('BankSoal') }));
vi.mock('../src/pages/OnlineAssessmentPage.jsx', () => ({ default: probe('UjianOnline') }));
vi.mock('../src/pages/ClassroomAssessmentReportPage.jsx', () => ({ default: probe('AnalisisPenilaian') }));
vi.mock('../src/pages/SchoolAssessmentOverviewPage.jsx', () => ({ default: probe('AsesmenAdminSekolah') }));
vi.mock('../src/pages/SchoolActivityOverviewPage.jsx', () => ({ default: probe('MonitoringSekolah') }));
vi.mock('../src/pages/SchoolActivityReportOverviewPage.jsx', () => ({ default: probe('LaporanAktivitasAdminSekolah') }));
vi.mock('../src/pages/SchoolReportCardPage.jsx', () => ({ default: probe('RaporSekolah') }));
vi.mock('../src/pages/SchoolLeadershipPage.jsx', () => ({ default: probe('KepemimpinanSekolah') }));
vi.mock('../src/pages/HomeroomAssignmentsPage.jsx', () => ({ default: probe('PenugasanWali') }));
vi.mock('../src/pages/StudentLearningPage.jsx', () => ({ default: probe('BelajarSiswa') }));
vi.mock('../src/pages/ParentAcademicAccessPage.jsx', () => ({ default: probe('AksesAkademikOrangTua') }));
vi.mock('../src/pages/StudentAccountLinkPage.jsx', () => ({ default: probe('TautkanAkunSiswa') }));
vi.mock('../src/pages/PlatformTenantsPage.jsx', () => ({ default: probe('TenantPlatform') }));
vi.mock('../src/pages/PlatformUsersPage.jsx', () => ({ default: probe('PenggunaPlatform') }));
vi.mock('../src/pages/PlatformOperationsPage.jsx', () => ({ default: probe('OperasiPlatform') }));
vi.mock('../src/pages/SupabasePlatformUsersPage.jsx', () => ({ default: probe('PenggunaSupabase') }));
vi.mock('../src/pages/PrivacyNoticePage.jsx', () => ({ default: probe('Privasi') }));
vi.mock('../src/pages/TrialDemoPage.jsx', () => ({ default: probe('Trial') }));

import { RouteWrapper } from '../src/App.jsx';

const roleAliasRedirect = new Map([
  ['/admin/komunikasi/pengumuman', '/pengumuman'],
]);

function renderAuthenticatedRoute(path, search, role, activeRole = null) {
  auth.role = role;
  auth.activeRole = activeRole;
  auth.user = { uid: `authenticated-${role}` };
  const entry = `${roleAliasRedirect.get(path) || path}${search}`;
  const element = (
    <MemoryRouter initialEntries={[entry]}>
      <RouteWrapper />
    </MemoryRouter>
  );

  return new Promise((resolve, reject) => {
    let markup = '';
    const output = new PassThrough();
    output.on('data', (chunk) => { markup += chunk.toString(); });
    output.on('end', () => resolve(markup));
    const stream = renderToPipeableStream(element, {
      onAllReady() {
        stream.pipe(output);
      },
      onError: reject,
    });
  });
}

describe('authenticated role × route destination rendering', () => {
  afterEach(() => {
    auth.role = 'admin_sekolah';
    auth.activeRole = null;
  });

  it('renders the App route destination for every authorized role-menu entry', async () => {
    const roles = ['admin', 'admin_sekolah', 'operator',
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler',
      'siswa', 'ortu', 'orang_tua', 'superadmin', 'demo',
      'kepala_sekolah', 'wali_kelas'];
    const matrix = roles
      .flatMap((role) => menuUntukPeran(role).flatMap((group) => group.item
        .map((item) => ({ role, item }))));

    for (const { role, item } of matrix) {
      expect(canOpenRolePath(role, item.path), `${role}: ${item.path}`).toBe(true);
      const markup = await renderAuthenticatedRoute(item.path, item.search || '', role);
      expect(markup, `${role}: ${item.path}${item.search || ''}`).not.toContain('Halaman tidak ditemukan');
      expect(markup, `${role}: ${item.path}${item.search || ''}`).not.toContain('Akses menu belum dapat diverifikasi');
      expect(
        markup.includes(`data-app-path="${item.path}"`)
          || markup.includes(`data-route-fallback="${item.path}"`)
          || markup.includes('data-route-page="Trial"'),
        `${role}: ${item.path} did not render an app destination`,
      ).toBe(true);
    }

    const paths = [...new Map(matrix.map(({ item }) => [
      `${item.path}${item.search || ''}`,
      item,
    ])).values()];
    for (const item of paths) {
      for (const role of roles) {
        if (canOpenRolePath(role, item.path)) continue;
        const markup = await renderAuthenticatedRoute(item.path, item.search || '', role);
        expect(markup, `${role} must not render ${item.path}${item.search || ''}`)
          .not.toContain(`data-app-path="${item.path}"`);
        expect(markup, `${role} must not render fallback for ${item.path}`)
          .not.toContain(`data-route-fallback="${item.path}"`);
      }
    }
  });

  it('uses activeRole as the authenticated route authorization context', async () => {
    const markup = await renderAuthenticatedRoute(
      '/program-kegiatan', '', 'admin_sekolah', 'guru_bk',
    );
    expect(markup).toContain('data-route-page="ProgramKegiatan"');
  });

  it('renders admin assessment destinations only for the school admin roles', async () => {
    for (const path of [
      '/admin/dashboard/ujian',
      '/admin/asesmen/paket',
      '/admin/asesmen/jadwal',
      '/admin/asesmen/monitoring',
      '/admin/asesmen/analisis',
    ]) {
      for (const role of ['admin', 'admin_sekolah']) {
        const markup = await renderAuthenticatedRoute(path, '', role);
        expect(markup, `${role}: ${path}`).toContain('data-route-page="AsesmenAdminSekolah"');
      }
      const markup = await renderAuthenticatedRoute(path, '', 'operator');
      expect(markup, `operator: ${path}`).not.toContain('data-route-page="AsesmenAdminSekolah"');
    }
  });

  it('renders admin activity and chat monitoring only for school admins', async () => {
    for (const path of ['/admin/aktivitas', '/admin/dashboard/chat']) {
      for (const role of ['admin', 'admin_sekolah']) {
        const markup = await renderAuthenticatedRoute(path, '', role);
        expect(markup, `${role}: ${path}`).toContain('data-route-page="MonitoringSekolah"');
      }
      const markup = await renderAuthenticatedRoute(path, '', 'operator');
      expect(markup, `operator: ${path}`).not.toContain('data-route-page="MonitoringSekolah"');
    }
  });

  it('renders the school activity report only for school admin roles', async () => {
    for (const role of ['admin', 'admin_sekolah']) {
      const markup = await renderAuthenticatedRoute('/admin/laporan/aktivitas', '', role);
      expect(markup, role).toContain('data-route-page="LaporanAktivitasAdminSekolah"');
    }
    const markup = await renderAuthenticatedRoute('/admin/laporan/aktivitas', '', 'operator');
    expect(markup).not.toContain('data-route-page="LaporanAktivitasAdminSekolah"');
  });
});
