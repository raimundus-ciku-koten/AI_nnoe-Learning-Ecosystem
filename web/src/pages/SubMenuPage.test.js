import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GRUP_MENU, menuUntukPeran } from '../navigasi.js';

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
  setPlatformControl: vi.fn(async () => ({ changed: true, state: platformControls })),
}));
vi.mock('../lib/supabase.ts', () => ({ supabase: {} }));
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
    auth.activeRole = null;
  });

  it('menonaktifkan ruang belajar siswa dan orang tua yang belum memiliki alur kerja', () => {
    auth.role = 'siswa';
    expect(renderSubmenu('/siswa/jadwal')).toContain('Jadwal dan Tugas belum tersedia');

    auth.role = 'orang_tua';
    expect(renderSubmenu('/orang-tua/anak')).toContain('Ringkasan Anak belum tersedia');
  });

  describe('submenu ruang kerja guru', () => {
    beforeEach(() => {
      auth.role = 'guru';
    });

    it('menandai submenu guru tanpa alur kerja sebagai belum tersedia', () => {
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
        expect(html, path).toContain(`${item.label.replaceAll('&', '&amp;')} belum tersedia`);
        expect(html, path).toContain('Alur kerja untuk menu ini belum tersedia');
        expect(html, path).not.toContain('Buat catatan kerja');
      }
    });

    it('tidak membuka ruang kerja generik untuk menu yang belum tersedia', () => {
      auth.user = null;
      const html = renderSubmenu('/pelaksanaan/jurnal');
      expect(html).toContain('Jurnal Mengajar Harian belum tersedia');
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

    it('mengikuti peran aktif saat akun berpindah dari peran utama admin ke guru', () => {
      auth.role = 'admin_sekolah';
      auth.activeRole = 'guru';
      const html = renderSubmenu('/pelaksanaan/jurnal');

      expect(html).toContain('Jurnal Mengajar Harian belum tersedia');
      expect(html).not.toContain('Halaman tidak ditemukan');
    });

    it.each(['guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'])(
      'menyediakan ruang kerja untuk peran aktif %s',
      (role) => {
        auth.role = 'guru';
        auth.activeRole = role;
        const html = renderSubmenu('/pelaksanaan/jurnal');

        expect(html).toContain('Jurnal Mengajar Harian belum tersedia');
        expect(html).not.toContain('Halaman tidak ditemukan');
      },
    );
  });

  const menuPlatform = menuUntukPeran('superadmin');
  const itemsPlatform = menuPlatform
    .flatMap((group) => group.item)
    .filter((item) => item.path?.startsWith('/platform/')
      && !item.disabled
      && ![
        '/platform/tenant/sekolah',
        '/platform/pengguna/admin-sekolah',
        '/platform/supabase-users',
      ].includes(item.path));

  it('merender setiap submenu platform aktif sebagai modul operasional', () => {
    expect(itemsPlatform.length).toBeGreaterThan(0);

    for (const item of itemsPlatform) {
      const html = renderOperations(item.path);
      expect(html, item.path).not.toContain('belum tersedia');
      expect(html, item.path).not.toContain('Panduan · baca saja');
      expect(html, item.path).not.toContain('Rute ini belum terdaftar');
    }
  });

  it('menyediakan status tanpa tautan untuk modul platform informasional', () => {
    for (const item of menuPlatform.flatMap((group) => group.item)
      .filter((entry) => entry.path?.startsWith('/platform/') && entry.disabled)) {
      const html = renderOperations(item.path);
      expect(html, item.path).toContain(`${item.label} belum tersedia`);
      expect(html, item.path).toContain('Alur kerja untuk menu ini belum tersedia');
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

  it('menampilkan manajemen pengguna berbasis Supabase', () => {
    auth.role = 'superadmin';
    const render = () => renderToStaticMarkup(React.createElement(PlatformUsersPage));
    expect(render()).toContain('Manajemen pengguna platform');
    expect(render()).toContain('Masuk sebagai superadmin');
    expect(render()).toContain('Supabase Auth');
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

  it('menyajikan snapshot operasional dan membatasi halaman yang hanya informasional', () => {
    expect(renderOperations('/platform/tenant/paket')).toContain('Paket belum tersedia');
    expect(renderOperations('/platform/pengguna/peran')).toContain('Peran Global belum tersedia');
    expect(renderOperations('/platform/fitur/menu')).toContain('Menu Builder belum tersedia');
    expect(renderOperations('/platform/dashboard/statistik')).toContain('Statistik Global');
    expect(renderOperations('/platform/laporan/biaya')).toContain('Biaya belum tersedia');

    auth.role = 'guru';
    expect(renderOperations('/platform/tenant/paket')).toContain('Akses platform dibatasi');
  });
});
