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
  setPlatformControl: vi.fn(async () => ({ changed: true, state: platformControls })),
}));
vi.mock('../lib/supabase.ts', () => ({ supabase: {} }));
import SubMenuPage from './SubMenuPage.jsx';
import TeacherRubricPage from './TeacherRubricPage.jsx';
import { MODUL_AKTIF_TERKAIT } from './TeacherWorkspacePage.jsx';
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

  it('menghubungkan siswa ke feed akademik dan menjaga batas portal wali', () => {
    auth.role = 'siswa';
    const studentSchedule = renderSubmenu('/siswa/jadwal');
    expect(studentSchedule).toContain('Jadwal dan Tugas');
    expect(studentSchedule).toContain('kelas siswa yang terhubung');
    expect(studentSchedule).not.toContain('Panduan · baca saja');

    auth.role = 'orang_tua';
    expect(renderSubmenu('/orang-tua/anak')).toContain('Data hanya mencakup siswa yang ditautkan');
  });

  it('menampilkan portal ringkasan wali untuk kedua alias peran orang tua', () => {
    for (const role of ['ortu', 'orang_tua']) {
      auth.role = role;
      const html = renderSubmenu('/orang-tua/nilai-kehadiran');
      expect(html).toContain('Nilai dan kehadiran anak');
      expect(html).toContain('Memuat ringkasan');
      expect(html).not.toContain('Panduan · baca saja');
    }
    auth.role = 'superadmin';
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
        expect(html, path).toContain('Gunakan kerangka');
        expect(html, path).toContain('Hindari memasukkan nama');
        expect(html, path).not.toContain('Halaman informasi');
      }
    });

    it('menghubungkan ruang kerja guru ke modul aktif yang dapat diakses peran guru', () => {
      const teacherItems = GRUP_MENU.flatMap((group) => group.item);

      for (const [source, modules] of Object.entries(MODUL_AKTIF_TERKAIT)) {
        expect(teacherItems.some((item) => item.path === source), source).toBe(true);
        for (const module of modules) {
          expect(
            teacherItems.some((item) => item.path === module.path),
            `${source} -> ${module.path}`,
          ).toBe(true);
        }
      }

      const html = renderSubmenu('/asesmen/remedial');
      expect(html).toContain('Modul yang sudah tersedia');
      expect(html).toContain('href="#/asesmen/analisis"');
      expect(html).toContain('href="#/laporan/penilaian"');
    });

    it('menandai fitur AI/nonaktif dengan jelas tanpa membuka workspace catatan', () => {
      const generator = renderSubmenu('/asesmen/generator-ai');
      expect(generator).toContain('Generator soal AI belum diaktifkan.');
      expect(generator).toContain('tidak mengirim soal atau data ke penyedia AI');
      expect(generator).toContain('href="#/asesmen/bank-soal"');
      expect(generator).not.toContain('Buat catatan kerja');

      const grading = renderSubmenu('/asesmen/penilaian-otomatis');
      expect(grading).toContain('Penilaian otomatis belum tersedia sebagai alur resmi.');
      expect(grading).toContain('Jangan gunakan halaman catatan sebagai nilai resmi.');
      expect(grading).toContain('href="#/asesmen/ujian-online"');
      expect(grading).toContain('href="#/laporan/penilaian"');
      expect(grading).not.toContain('Buat catatan kerja');
    });

    it('menyediakan pembuat rubrik manual tanpa layanan eksternal', () => {
      const html = renderToStaticMarkup(React.createElement(TeacherRubricPage));
      expect(html).toContain('Pembuat Rubrik Penilaian');
      expect(html).toContain('Tidak ada data yang dikirim ke layanan AI.');
      expect(html).toContain('Draf disimpan hanya pada browser dan perangkat ini');
      expect(html).toContain('Sangat baik');
      expect(html).toContain('Perlu bimbingan');
      expect(html).toContain('Pratinjau skor rubrik');
      expect(html).toContain('tidak disimpan atau dikaitkan dengan identitas siswa');
      expect(html).toContain('Ekspor pratinjau skor anonim');
      expect(html).toContain('tanpa kolom nama atau identitas siswa');
      expect(html).toContain('Impor JSON');
      expect(html).toContain('Cadangan JSON');
      expect(html).toContain('Ekspor CSV');
    });

    it('menyediakan ruang kerja guru untuk seluruh peran spesialisasi guru', () => {
      for (const role of ['guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler']) {
        auth.role = role;
        const html = renderSubmenu('/pelaksanaan/jurnal');
        expect(html, role).toContain('Buat catatan kerja');
        expect(html, role).not.toContain('Panduan · baca saja');
      }
      auth.role = 'guru';
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
      && ![
        '/platform/tenant/sekolah',
        '/platform/pengguna/admin-sekolah',
        '/platform/supabase-users',
      ].includes(item.path));

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

  it('menghapus katalog billing dan menyajikan matriks navigasi', () => {
    expect(renderOperations('/platform/tenant/paket')).toContain('Modul platform tidak tersedia');
    expect(renderOperations('/platform/pengguna/peran')).toContain('Matriks menu dan peran');
    expect(renderOperations('/platform/fitur/menu')).toContain('Katalog menu platform');
    expect(renderOperations('/platform/dashboard/statistik')).toContain('Statistik Global');

    auth.role = 'guru';
    expect(renderOperations('/platform/tenant/paket')).toContain('Akses platform dibatasi');
  });
});
