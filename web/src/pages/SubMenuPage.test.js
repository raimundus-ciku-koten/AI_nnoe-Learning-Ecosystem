import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GRUP_MENU, MENU_SUPERADMIN, menuUntukPeran,
} from '../navigasi.js';
import { hasRenderedDestination } from '../../tests/role-route-render-manifest.mjs';

const auth = vi.hoisted(() => ({
  role: 'superadmin',
  activeRole: null,
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

  it('menjelaskan batas data untuk siswa dan orang tua', () => {
    auth.role = 'siswa';
    expect(renderSubmenu('/siswa/jadwal')).toContain('menautkan data akademik ke akun siswa');
    expect(renderSubmenu('/siswa/jadwal')).not.toContain('Catatan di bawah ini');

    auth.role = 'orang_tua';
    const parentPage = renderSubmenu('/orang-tua/anak');
    expect(parentPage).toContain('hubungan akun wali-siswa harus diverifikasi');
    expect(parentPage).not.toContain('catatan pribadi bukan data akademik anak');
    expect(parentPage).toContain('href="#/pengumuman"');
    expect(parentPage).toContain('href="#/chat"');
    expect(parentPage).toContain('href="#/chat/kontak"');
  });

  it('memberi pintasan komunikasi sekolah pada setiap halaman wali tanpa membuka data anak', () => {
    auth.role = 'ortu';
    for (const path of ['/dashboard', '/orang-tua/anak', '/pengumuman', '/chat']) {
      const html = renderSubmenu(path);
      expect(html, path).toContain('Buka modul terkait');
      expect(html, path).toContain('hubungan akun wali-siswa harus diverifikasi');
      for (const destination of ['/pengumuman', '/chat', '/chat/kontak']) {
        if (destination !== path) {
          expect(html, path).toContain(`href="#${destination}"`);
        }
      }
    }
  });

  describe('submenu ruang kerja guru', () => {
    beforeEach(() => {
      auth.role = 'guru';
    });

    it('menjelaskan fallback guru dan menautkan catatan pribadi secara terpisah', () => {
      const targetPaths = [
        '/refleksi/pembelajaran',
        '/laporan/kinerja-guru',
        '/kolaborasi/praktik-baik',
      ];
      const teacherItems = GRUP_MENU.flatMap((group) => group.item);

      for (const path of targetPaths) {
        const item = teacherItems.find((entry) => entry.path === path);
        expect(item, `menu ${path} tersedia`).toBeDefined();
        const html = renderSubmenu(path);
        expect(html, path).toContain(`<h2>${item.label.replaceAll('&', '&amp;')}</h2>`);
        expect(html, path).toContain('belum memiliki modul akademik khusus');
        expect(html, path).toContain('Panduan · baca saja');
        expect(html, path).toContain('Catatan Kerja Pribadi');
        expect(html, path).not.toContain('Catatan pribadi opsional untuk guru');
        expect(html, path).not.toContain('Buat catatan kerja');
        expect(html, path).not.toContain('Hindari memasukkan nama');
      }

      expect(renderSubmenu('/asesmen/remedial')).toContain('href="#/asesmen/ujian-online"');
      expect(renderSubmenu('/laporan/kinerja-guru')).toContain('href="#/laporan/arsip-perencanaan"');
    });

    it('membuka ruang kerja pribadi hanya dari menu catatan kerja pribadi', () => {
      for (const role of ['guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler']) {
        auth.role = role;
        auth.activeRole = '';
        const html = renderSubmenu('/guru/catatan-pribadi');
        expect(html, role).toContain('Buat catatan kerja');
        expect(html, role).toContain('Catatan ini hanya dapat dibaca oleh akun guru Anda');
        expect(html, role).not.toContain('hanya tersedia bagi guru');
        if (role === 'guru_bk') {
          expect(html).toContain('Jangan simpan catatan konseling, diagnosis, atau detail kasus siswa');
        }
      }
      auth.role = 'guru';
      expect(renderSubmenu('/asesmen/remedial')).not.toContain('Buat catatan kerja');
    });

    it('menggunakan peran aktif saat akun berpindah konteks kerja', () => {
      auth.role = 'admin_sekolah';
      auth.activeRole = 'guru_bk';

      expect(renderSubmenu('/guru/catatan-pribadi')).toContain('Buat catatan kerja');

      auth.activeRole = '';
      auth.role = 'guru';
    });

    it('menautkan guru reguler dan spesialis ke jurnal serta laporan kelas yang tersedia', () => {
      for (const role of ['guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler']) {
        auth.role = role;
        auth.activeRole = '';
        const html = renderSubmenu('/pelaksanaan/realisasi');
        expect(html, role).toContain('href="#/pelaksanaan/jurnal"');
        expect(html, role).toContain('href="#/laporan/harian-bulanan"');
      }
    });

    it('menghubungkan menu perencanaan dan pemantauan ke sumber modul yang tersedia untuk semua role guru', () => {
      for (const role of ['guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler']) {
        auth.role = role;
        auth.activeRole = '';
        const planning = renderSubmenu('/perencanaan', '?jenis=rpe');
        expect(planning, role).toContain('href="#/laporan/arsip-perencanaan"');
        expect(planning, role).toContain('href="#/perangkat/modul-siswa"');

        const monitoring = renderSubmenu('/pemantauan/profil-siswa');
        expect(monitoring, role).toContain('Profil siswa, catatan kasus, dan intervensi individual bukan bagian');
        expect(monitoring, role).toContain('href="#/laporan/harian-bulanan"');
        expect(monitoring, role).toContain('href="#/pelaksanaan/presensi"');
      }
    });

    it('menggunakan peran aktif guru spesialis untuk pintasan perencanaan', () => {
      auth.role = 'admin_sekolah';
      auth.activeRole = 'guru_bk';
      expect(renderSubmenu('/perencanaan', '?jenis=rpe'))
        .toContain('href="#/laporan/arsip-perencanaan"');
    });

    it('tidak membuka data pribadi bila konteks guru/tenant tidak tersedia', () => {
      auth.user = null;
      const html = renderSubmenu('/guru/catatan-pribadi');
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
          expect(html).toContain('Buka halaman</small>');
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
    expect(render()).not.toContain('langganan');

    auth.role = 'admin_sekolah';
    expect(render()).toContain('Data tenant lintas sekolah hanya tersedia bagi superadmin.');
  });

  it('menggunakan role aktif untuk akses data tenant platform', () => {
    auth.role = 'admin_sekolah';
    auth.activeRole = 'superadmin';

    const render = () => renderToStaticMarkup(React.createElement(PlatformTenantsPage));
    expect(render()).toContain('Tenant sekolah');
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

  it('menampilkan tautan ke modul admin yang aktif tanpa memberi akses asesmen siswa', () => {
    auth.role = 'admin_sekolah';
    const adminAssessment = renderSubmenu('/admin/asesmen/paket');
    expect(adminAssessment).toContain('Buka modul terkait');
    expect(adminAssessment).toContain('href="#/asesmen/bank-soal"');
    expect(adminAssessment).not.toContain('href="#/asesmen/ujian-online"');

    auth.role = 'guru';
    expect(renderSubmenu('/admin/asesmen/paket')).not.toContain('Buka modul terkait');
  });

  it('menautkan laporan ke rapor resmi dan tidak menyamarkan katalog/akun pribadi sebagai modul admin', () => {
    auth.role = 'admin_sekolah';
    const report = renderSubmenu('/admin/laporan/akademik');
    expect(report).toContain('href="#/admin/akademik/rapor"');
    expect(report).toContain('Rapor Sekolah');

    const finance = renderSubmenu('/admin/keuangan/laporan');
    expect(finance).toContain('bukan modul keuangan sekolah');
    expect(finance).not.toContain('Buka modul terkait');

    const settings = renderSubmenu('/admin/pengaturan/integrasi');
    expect(settings).toContain('Pengaturan akun pribadi tidak mengelola layanan sekolah');
    expect(settings).not.toContain('Buka modul terkait');
  });

  it('membedakan ringkasan dan katalog materi dari perpustakaan digital yang masih berupa panduan', () => {
    auth.role = 'admin_sekolah';
    const guide = renderSubmenu('/admin/konten/perpustakaan');
    expect(guide).toContain('Buka modul terkait');
    expect(guide).toContain('href="#/admin/konten/materi"');
    expect(guide).toContain('perpustakaan digital admin belum tersedia');
  });

  it('menyelaraskan fallback admin alias tanpa memberi hak tambahan kepada operator', () => {
    const route = '/admin/asesmen/monitoring';
    auth.role = 'admin';
    const aliasHtml = renderSubmenu(route);
    auth.role = 'admin_sekolah';
    const schoolAdminHtml = renderSubmenu(route);
    expect(aliasHtml).toContain('Panduan · baca saja');
    expect(aliasHtml).toContain('Buka modul terkait');
    expect(schoolAdminHtml).toContain('Buka modul terkait');

    auth.role = 'operator';
    const operatorHtml = renderSubmenu(route);
    expect(operatorHtml).toContain('Halaman tidak ditemukan');
  });

  it('merender fallback katalog sebagai panduan tanpa menyamarkan catatan sebagai modul', () => {
    const roles = [
      'admin', 'admin_sekolah', 'guru', 'guru_bk', 'guru_kokurikuler',
      'guru_ekstrakurikuler', 'operator', 'siswa', 'ortu', 'orang_tua',
      'superadmin', 'demo', 'kepala_sekolah', 'wali_kelas',
    ];
    for (const role of roles) {
      auth.role = role;
      for (const item of menuUntukPeran(role).flatMap((group) => group.item)) {
        if (hasRenderedDestination(item.path)) continue;
        const html = renderSubmenu(item.path, item.search || '');
        expect(html, `${role}: ${item.path}`).toContain(`<h2>${item.label.replaceAll('&', '&amp;')}</h2>`);
        expect(html, `${role}: ${item.path}`).toContain('Panduan · baca saja');
        expect(html, `${role}: ${item.path}`).not.toContain('Catatan pribadi opsional untuk guru');
        expect(html, `${role}: ${item.path}`).not.toContain('Simpan catatan');
      }
    }
  });

  it('tidak menampilkan menu pembayaran atau tagihan admin', () => {
    auth.role = 'admin_sekolah';
    expect(renderSubmenu('/admin/asesmen/monitoring')).toContain('Admin sekolah dapat meninjau daftar ujian');
    expect(renderSubmenu('/admin/keuangan/pembayaran')).toContain('Halaman tidak ditemukan');
    expect(renderSubmenu('/admin/keuangan/tagihan')).toContain('Halaman tidak ditemukan');
    expect(renderSubmenu('/admin/pengaturan/cadangan')).toContain('cadangan, dan log admin belum tersedia');
  });

  it('labels admin activity and chat monitoring as available tenant summaries', () => {
    auth.role = 'admin_sekolah';
    const activity = renderSubmenu('/admin/aktivitas');
    expect(activity).toContain('Aktivitas Terbaru');
    expect(activity).toContain('peristiwa dari modul yang tercatat');
    expect(activity).toContain('Monitoring Chat');

    const chat = renderSubmenu('/admin/dashboard/chat');
    expect(chat).toContain('Monitoring Chat');
    expect(chat).toContain('ringkasan agregat chat');
    expect(chat).toContain('bukan audit log lengkap');
  });

  it('menampilkan kontrol feature flags dan pemeliharaan yang benar-benar terhubung', () => {
    expect(renderOperations('/platform/fitur/flags')).toContain('Generator perangkat ajar AI');
    expect(renderOperations('/platform/pengaturan/pemeliharaan')).toContain('Mode pemeliharaan global');
    expect(renderOperations('/platform/keamanan/audit')).toContain('Aktivitas platform terbaru');
  });

  it('menggunakan role aktif untuk halaman operasi platform', () => {
    auth.role = 'admin_sekolah';
    auth.activeRole = 'superadmin';

    expect(renderOperations('/platform/fitur/flags')).toContain('Generator perangkat ajar AI');
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
    expect(renderOperations('/platform/tenant/paket')).toContain('Tanya melalui WhatsApp (+6282236267895)');
    expect(renderOperations('/platform/pengguna/peran')).toContain('Matriks menu dan peran');
    expect(renderOperations('/platform/fitur/menu')).toContain('Katalog menu platform');
    expect(renderOperations('/platform/dashboard/statistik')).toContain('Statistik Global');
    expect(renderOperations('/platform/laporan/biaya'))
      .toContain('Data biaya operasional belum tersedia pada aplikasi ini.');

    auth.role = 'guru';
    expect(renderOperations('/platform/tenant/paket')).toContain('Akses platform dibatasi');
  });
});
