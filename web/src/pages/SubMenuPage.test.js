import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GRUP_MENU, MENU_SUPERADMIN } from '../navigasi.js';

const auth = vi.hoisted(() => ({
  role: 'superadmin',
  user: { uid: 'guru-test' },
  tenantId: 'sekolah-test',
  profile: { nama: 'Guru Tes' },
  updateProfil: vi.fn(),
  resetPassword: vi.fn(),
}));
const platformControls = vi.hoisted(() => ({
  loading: false,
  maintenance: false,
  features: { aiAssistant: true, aiGeneration: true },
  error: '',
}));
vi.mock('../context/AuthContext.jsx', () => ({
  useAuth: () => auth,
}));
vi.mock('../context/PlatformControlContext.jsx', () => ({
  usePlatformControls: () => platformControls,
  MaintenanceGuard: ({ children }) => {
    if (platformControls.maintenance && auth.role !== 'superadmin') {
      return React.createElement('main', { role: 'status' }, 'Platform sedang dalam pemeliharaan');
    }
    return children;
  },
}));
vi.mock('../services/platformAdminApi.js', () => ({
  createPlatformUser: vi.fn(),
  setPlatformControl: vi.fn(async () => ({ changed: true, state: platformControls })),
}));
vi.mock('../lib/supabase.ts', () => ({ supabase: {} }));
vi.mock('../firebase/index.js', () => ({ db: {} }));
vi.mock('firebase/firestore', () => ({
  addDoc: vi.fn(),
  collection: vi.fn(() => ({})),
  deleteDoc: vi.fn(),
  doc: vi.fn(() => ({})),
  getDocs: vi.fn(async () => ({ docs: [] })),
  limit: vi.fn(),
  orderBy: vi.fn(),
  query: vi.fn(),
  serverTimestamp: vi.fn(),
  startAfter: vi.fn(),
  updateDoc: vi.fn(),
}));
vi.mock('../firebase/core/app.js', () => ({
  appCheck: null,
  firebaseEnv: {
    projectId: 'project-test',
    authDomain: 'auth.test',
    storageBucket: 'bucket.test',
    databaseURL: 'https://database.test',
  },
  pakaiEmulator: false,
}));

import SubMenuPage from './SubMenuPage.jsx';
import PlatformTenantsPage from './PlatformTenantsPage.jsx';
import PlatformUsersPage from './PlatformUsersPage.jsx';
import PlatformOperationsPage, { aktivitasAudit, rincianAudit } from './PlatformOperationsPage.jsx';
import { MaintenanceGuard } from '../context/PlatformControlContext.jsx';

function renderSubmenu(path, search = '') {
  return renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      { initialEntries: [`${path}${search}`] },
      React.createElement(SubMenuPage),
    ),
  );
}

function renderOperations(path) {
  return renderToStaticMarkup(
    React.createElement(
      MemoryRouter,
      { initialEntries: [path] },
      React.createElement(PlatformOperationsPage),
    ),
  );
}

describe('submenu platform superadmin', () => {
  beforeEach(() => {
    auth.role = 'superadmin';
  });

  it('menjelaskan batas data untuk siswa dan orang tua', () => {
    auth.role = 'siswa';
    expect(renderSubmenu('/siswa/jadwal')).toContain('menautkan data akademik ke akun siswa');

    auth.role = 'orang_tua';
    expect(renderSubmenu('/orang-tua/anak')).toContain('menautkan akun orang tua secara resmi');
  });

  describe('submenu ruang kerja guru', () => {
    beforeEach(() => {
      auth.role = 'guru';
    });

    it('menampilkan ruang kerja catatan untuk submenu guru yang belum memiliki modul khusus', () => {
      const targetPaths = [
        '/pelaksanaan/jurnal',
        '/asesmen/remedial',
        '/pemantauan/catatan',
        '/refleksi/pembelajaran',
        '/laporan/kinerja-guru',
        '/kolaborasi/praktik-baik',
      ];
      const teacherItems = GRUP_MENU.flatMap((group) => group.item);

      for (const path of targetPaths) {
        const item = teacherItems.find((entry) => entry.path === path);
        expect(item, `menu ${path} tersedia`).toBeDefined();
        const html = renderSubmenu(path);
        expect(html, path).toContain(`<h1>${item.label.replaceAll('&', '&amp;')}</h1>`);
        expect(html, path).toContain('Buat catatan kerja');
        expect(html, path).toContain('Hindari memasukkan nama');
        expect(html, path).not.toContain('Halaman informasi');
      }
    });

    it('tidak membuka data pribadi bila konteks guru/tenant tidak tersedia', () => {
      auth.user = null;
      const html = renderSubmenu('/pelaksanaan/jurnal');
      expect(html).toContain('hanya tersedia bagi guru');
      expect(html).not.toContain('Buat catatan kerja');
      auth.user = { uid: 'guru-test' };
    });

    it('menyediakan pengelolaan nama profil dan pemulihan kata sandi untuk guru', () => {
      const html = renderSubmenu('/pengaturan/akun');
      expect(html).toContain('Akun &amp; Keamanan');
      expect(html).toContain('Simpan nama profil');
      expect(html).toContain('Kirim tautan reset kata sandi');
      expect(html).toContain('Peran dan akses sekolah dikelola');
    });
  });

  const itemsPlatform = MENU_SUPERADMIN
    .flatMap((group) => group.item)
    .filter((item) => item.path.startsWith('/platform/')
      && !['/platform/tenant/sekolah', '/platform/pengguna/admin-sekolah'].includes(item.path));

  it('merender setiap tautan platform sebagai halaman yang cocok dengan menu aktif', () => {
    expect(itemsPlatform.length).toBeGreaterThan(0);

    for (const item of itemsPlatform) {
      const html = renderSubmenu(item.path, item.search || '');
      expect(html).toContain(`<h2>${item.label}</h2>`);
      expect(html).toContain('Panduan · baca saja');
      expect(html).not.toContain('Halaman tidak ditemukan');
    }
  });

  it('menampilkan seluruh tautan lain dalam grup menu superadmin yang sama', () => {
    for (const group of MENU_SUPERADMIN) {
      for (const item of group.item.filter((entry) => entry.path.startsWith('/platform/'))) {
        const html = renderSubmenu(item.path, item.search || '');
        const related = group.item.filter((entry) => entry !== item);

        for (const entry of related) {
          const href = `href="#${entry.path}${entry.search || ''}"`
            .replaceAll('&', '&amp;');
          expect(html).toContain(href);
        }
      }
    }
  });

  it('tidak merender halaman platform untuk peran selain superadmin', () => {
    auth.role = 'admin_sekolah';
    const html = renderSubmenu('/platform/tenant/sekolah');

    expect(html).toContain('Halaman tidak ditemukan');
    expect(html).not.toContain('<h2>Daftar Sekolah</h2>');
  });

  it('membatasi daftar tenant global pada superadmin', () => {
    const render = () => renderToStaticMarkup(React.createElement(PlatformTenantsPage));
    expect(render()).toContain('Tenant sekolah');

    auth.role = 'admin_sekolah';
    expect(render()).toContain('Data tenant lintas sekolah hanya tersedia bagi superadmin.');
  });

  it('membatasi direktori admin global pada superadmin', () => {
    auth.role = 'superadmin';
    const render = () => renderToStaticMarkup(React.createElement(PlatformUsersPage));
    expect(render()).toContain('Tambahkan akun pengguna');
    expect(render()).toContain('Buat akun dan kirim email setel sandi');
    expect(render()).toContain('ID tenant sekolah');
    expect(render()).toContain('Akun pengguna');

    auth.role = 'admin_sekolah';
    expect(render()).toContain('Direktori dan pembuatan akun lintas tenant hanya tersedia bagi superadmin.');
  });

  it('menangani setiap rute platform selain daftar sekolah dan direktori admin', () => {
    for (const item of itemsPlatform) {
      const html = renderOperations(item.path);
      expect(html, item.path).not.toContain('Rute ini belum terdaftar');
      expect(html, item.path).not.toContain('Akses platform dibatasi');
    }
  });

  it('menampilkan kontrol feature flags dan pemeliharaan yang benar-benar terhubung', () => {
    expect(renderOperations('/platform/fitur/flags')).toContain('Generator perangkat ajar AI');
    expect(renderOperations('/platform/pengaturan/pemeliharaan')).toContain('Mode pemeliharaan global');
    expect(renderOperations('/platform/keamanan/audit')).toContain('Aktivitas platform terbaru');
  });

  it('merangkum peristiwa pembuatan akun pada audit platform', () => {
    const activity = {
      action: 'platform.user.created',
      role: 'guru',
      tenantId: 'sekolah-a',
      target: 'uid-baru',
    };
    expect(aktivitasAudit(activity)).toBe('Akun pengguna dibuat');
    expect(rincianAudit(activity)).toBe('Guru · tenant sekolah-a · UID uid-baru');
  });

  it('menerapkan mode pemeliharaan bagi peran biasa dan memberi akses superadmin', () => {
    const render = () => renderToStaticMarkup(
      React.createElement(MaintenanceGuard, null, React.createElement('p', null, 'Konten aplikasi')),
    );
    platformControls.maintenance = true;
    auth.role = 'guru';
    expect(render()).toContain('Platform sedang dalam pemeliharaan');
    expect(render()).not.toContain('Konten aplikasi');

    auth.role = 'superadmin';
    expect(render()).toContain('Konten aplikasi');
    platformControls.maintenance = false;
  });

  it('menyajikan katalog harga, matriks navigasi, dan batasan akses non-superadmin', () => {
    expect(renderOperations('/platform/tenant/paket')).toContain('Sekolah Basic');
    expect(renderOperations('/platform/pengguna/peran')).toContain('Matriks menu dan peran');
    expect(renderOperations('/platform/fitur/menu')).toContain('Katalog menu platform');
    expect(renderOperations('/platform/dashboard/statistik')).toContain('Statistik Global');
    expect(renderOperations('/platform/laporan/biaya'))
      .toContain('https://console.cloud.google.com/billing?project=project-test');

    auth.role = 'guru';
    expect(renderOperations('/platform/tenant/paket')).toContain('Akses platform dibatasi');
  });
});
