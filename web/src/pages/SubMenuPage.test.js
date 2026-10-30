import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { GRUP_MENU, MENU_ADMIN_SEKOLAH, MENU_SUPERADMIN } from '../navigasi.js';

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
import { KATEGORI } from './AdminUsersPage.jsx';
import SchoolAnnouncementsPage from './SchoolAnnouncementsPage.jsx';
import QuestionBankPage from './QuestionBankPage.jsx';
import PlanningCoverPage from './PlanningCoverPage.jsx';
import AdminAssessmentPage from './AdminAssessmentPage.jsx';
import AdminSchoolUnitsPage from './AdminSchoolUnitsPage.jsx';
import OnlineAssessmentPage from './OnlineAssessmentPage.jsx';
import PlatformTenantsPage from './PlatformTenantsPage.jsx';
import PlatformUsersPage from './PlatformUsersPage.jsx';
import PlatformOperationsPage, { aktivitasAudit, rincianAudit } from './PlatformOperationsPage.jsx';
import ReportCardPage from './ReportCardPage.jsx';
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

    auth.role = 'orang_tua';
    expect(renderSubmenu('/orang-tua/anak')).toContain('menautkan akun orang tua secara resmi');
  });

  it('menjelaskan batas data sesuai peran aktif siswa', () => {
    auth.role = 'admin_sekolah';
    auth.activeRole = 'siswa';
    expect(renderSubmenu('/siswa/materi')).toContain('menautkan data akademik ke akun siswa');
  });

  describe('submenu ruang kerja guru', () => {
    beforeEach(() => {
      auth.role = 'guru';
    });

    it('menampilkan ruang kerja catatan untuk submenu guru yang belum memiliki modul khusus', () => {
      const targetPaths = [
        '/pelaksanaan/jurnal',
        '/pelaksanaan/tugas',
        '/pelaksanaan/catatan-cepat',
        '/pelaksanaan/realisasi',
        '/asesmen/remedial',
        '/pelaksanaan/berdiferensiasi',
        '/pemantauan/catatan',
        '/refleksi/pembelajaran',
        '/refleksi/supervisi',
        '/refleksi/portofolio',
        '/refleksi/kompetensi',
        '/refleksi/perbaikan',
        '/laporan/kinerja-guru',
        '/kolaborasi/praktik-baik',
      ];
      const teacherItems = GRUP_MENU.flatMap((group) => group.item);

      for (const path of targetPaths) {
        const item = teacherItems.find((entry) => entry.path === path);
        expect(item, `menu ${path} tersedia`).toBeDefined();
        const html = renderSubmenu(path);
        expect(html, path).toContain(`<h1>${item.label.replaceAll('&', '&amp;')}</h1>`);
        expect(html, path).toContain('Hindari memasukkan nama');
        expect(html, path).toContain('Buka Integrasi Google');
        expect(html, path).toContain('href="#/pengaturan/google"');
        if (path === '/pelaksanaan/jurnal') {
          expect(html).toContain('Jurnal mengajar</h2>');
          expect(html).toContain('Tujuan pembelajaran');
          expect(html).toContain('Kegiatan pembelajaran');
          expect(html).toContain('Capaian yang diamati');
          expect(html).toContain('Tindak lanjut');
          expect(html).toContain('rekam resmi sekolah');
        } else if (path === '/pelaksanaan/catatan-cepat') {
          expect(html).toContain('Catatan kelas cepat</h2>');
          expect(html).toContain('Pengamatan umum');
          expect(html).toContain('Respons guru');
          expect(html).toContain('Tindak lanjut');
          expect(html).toContain('Hindari memasukkan nama');
        } else if (path === '/pelaksanaan/realisasi') {
          expect(html).toContain('Realisasi terhadap Rencana</h2>');
          expect(html).toContain('Rencana yang ditinjau');
          expect(html).toContain('Status pelaksanaan');
          expect(html).toContain('Terlaksana sebagian');
          expect(html).toContain('Tindak lanjut');
        } else if (path === '/pelaksanaan/berdiferensiasi') {
          expect(html).toContain('Rencana pembelajaran berdiferensiasi</h2>');
          expect(html).toContain('Tujuan belajar');
          expect(html).toContain('Kebutuhan umum kelas');
          expect(html).toContain('Pilihan strategi');
          expect(html).toContain('Cek pemahaman');
        } else if (path === '/refleksi/pembelajaran') {
          expect(html).toContain('Refleksi pembelajaran</h2>');
          expect(html).toContain('Apa yang berjalan baik?');
          expect(html).toContain('Bukti belajar yang terlihat');
          expect(html).toContain('Apa yang perlu ditingkatkan?');
          expect(html).toContain('Langkah berikutnya');
        } else if (path === '/refleksi/kompetensi') {
          expect(html).toContain('Rencana pengembangan kompetensi</h2>');
          expect(html).toContain('Kompetensi yang dikembangkan');
          expect(html).toContain('Aktivitas belajar');
          expect(html).toContain('Target waktu');
          expect(html).toContain('Bukti atau capaian');
        } else if (path === '/refleksi/supervisi') {
          expect(html).toContain('Catatan supervisi dan observasi</h2>');
          expect(html).toContain('Fokus observasi');
          expect(html).toContain('Catatan faktual');
          expect(html).toContain('Umpan balik');
          expect(html).toContain('bukan evaluasi resmi');
        } else if (path === '/refleksi/portofolio') {
          expect(html).toContain('Entri portofolio guru</h2>');
          expect(html).toContain('Jenis karya');
          expect(html).toContain('Deskripsi karya');
          expect(html).toContain('Kompetensi terkait');
          expect(html).toContain('Tautan bukti HTTPS');
          expect(html).toContain('Berkas tidak diunggah');
        } else if (path === '/asesmen/remedial') {
          expect(html).toContain('Rencana remedial dan pengayaan</h2>');
          expect(html).toContain('Kebutuhan belajar kelas');
          expect(html).toContain('Rencana penguatan/remedial');
          expect(html).toContain('Rencana pengayaan');
          expect(html).toContain('Indikator tinjau ulang');
          expect(html).toContain('bukan daftar kasus');
        } else if (path === '/refleksi/perbaikan') {
          expect(html).toContain('Rencana perbaikan</h2>');
          expect(html).toContain('Fokus perbaikan');
          expect(html).toContain('Perubahan yang dicoba');
          expect(html).toContain('Indikator keberhasilan');
          expect(html).toContain('Tanggal tinjau ulang');
        } else if (path === '/pelaksanaan/tugas') {
          expect(html).toContain('Tugas pribadi</h2>');
          expect(html).toContain('Tenggat tugas');
          expect(html).toContain('Belum selesai');
          expect(html).toContain('Simpan tugas');
        } else {
          expect(html, path).toContain('Buat catatan kerja');
        }
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

    it('menyediakan pratinjau rapor simulasi untuk tiap jenjang', () => {
      auth.role = 'guru';
      auth.activeRole = null;
      auth.tenantId = 'sekolah-test';

      const html = renderToStaticMarkup(
        React.createElement(MemoryRouter, { initialEntries: ['/asesmen/rapor'] }, React.createElement(ReportCardPage)),
      );

      expect(html).toContain('Rapor');
      expect(html).toContain('TK');
      expect(html).toContain('SD');
      expect(html).toContain('SMP');
      expect(html).toContain('SMA');
      expect(html).toContain('Deskripsi capaian');
      expect(html).toContain('Catatan wali kelas');
      expect(html).toContain('seluruh identitas, nilai, kehadiran, dan catatan di bawah adalah data simulasi');
      expect(html).toContain('bukan dokumen rapor resmi');
    });

    it('mengikuti peran aktif saat akun berpindah dari peran utama admin ke guru', () => {
      auth.role = 'admin_sekolah';
      auth.activeRole = 'guru';
      const html = renderSubmenu('/pelaksanaan/jurnal');

      expect(html).toContain('<h1>Jurnal Mengajar Harian</h1>');
      expect(html).toContain('Tujuan pembelajaran');
      expect(html).not.toContain('Halaman tidak ditemukan');
    });

    it.each(['guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler'])(
      'menyediakan ruang kerja untuk peran aktif %s',
      (role) => {
        auth.role = 'guru';
        auth.activeRole = role;
        const html = renderSubmenu('/pelaksanaan/jurnal');

        expect(html).toContain('<h1>Jurnal Mengajar Harian</h1>');
        expect(html).toContain('Tujuan pembelajaran');
        expect(html).not.toContain('hanya tersedia bagi guru');
        expect(html).not.toContain('Halaman tidak ditemukan');
      },
    );
  });

  it('menyediakan task pribadi terenkripsi dan integrasi Google di menu Admin Sekolah', () => {
    auth.role = 'admin_sekolah';
    auth.activeRole = null;
    const adminItems = MENU_ADMIN_SEKOLAH.flatMap((group) => group.item);
    const html = renderSubmenu('/admin/tugas');

    expect(adminItems.some((item) => item.path === '/admin/tugas')).toBe(true);
    expect(adminItems.some((item) => item.path === '/pengaturan/google')).toBe(true);
    expect(html).toContain('<h1>Tugas Pribadi</h1>');
    expect(html).toContain('Google Calendar');
    expect(html).toContain('href="#/pengaturan/google"');
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

  it('menyajikan katalog harga, matriks navigasi, dan batasan akses non-superadmin', () => {
    expect(renderOperations('/platform/tenant/paket')).toContain('Sekolah Basic');
    expect(renderOperations('/platform/pengguna/peran')).toContain('Matriks menu dan peran');
    expect(renderOperations('/platform/fitur/menu')).toContain('Katalog menu platform');
    expect(renderOperations('/platform/fitur/menu-pengguna')).toContain('Menu per Pengguna');
    expect(renderOperations('/platform/dashboard/statistik')).toContain('Statistik Global');
    expect(renderOperations('/platform/konten/template')).toContain('Template Perangkat');
    expect(renderOperations('/platform/konten/bank-soal')).toContain('Bank Soal Global');
    expect(renderOperations('/platform/konten/modul')).toContain('Modul Global');
    expect(renderOperations('/platform/laporan/biaya'))
      .toContain('Data biaya billing tidak tersedia pada aplikasi ini.');

    auth.role = 'guru';
    expect(renderOperations('/platform/tenant/paket')).toContain('Akses platform dibatasi');
  });
});

describe('admin sekolah: cakupan pengguna', () => {
  it('memasukkan semua role guru spesialis ke direktori guru', () => {
    expect(KATEGORI.guru.roles).toEqual(expect.arrayContaining([
      'guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler', 'operator', 'demo',
    ]));
  });

  it.each([
    ['/admin/akademik/kelas', 'Kelas dan Rombel'],
    ['/admin/akademik/mapel', 'Mata Pelajaran'],
  ])('membuka editor penugasan nyata pada %s', (path, title) => {
    auth.role = 'admin_sekolah';
    auth.activeRole = null;
    const html = renderSubmenu(path);

    expect(html).toContain(`<h1>${title}</h1>`);
    expect(html).toContain('Penugasan guru');
    expect(html).not.toContain('Panduan · baca saja');
  });

  it('tidak mengarahkan submenu akademik yang belum didukung ke editor penugasan', () => {
    auth.role = 'admin_sekolah';
    auth.activeRole = null;
    const html = renderSubmenu('/admin/akademik/jadwal');

    expect(html).toContain('<h2>Jadwal</h2>');
    expect(html).toContain('Panduan · baca saja');
  });

  it('menyediakan pengelolaan unit sekolah khusus untuk admin tenant', () => {
    auth.role = 'admin_sekolah';
    auth.activeRole = null;
    const html = renderToStaticMarkup(React.createElement(AdminSchoolUnitsPage));

    expect(html).toContain('<h1 id="school-units-title">Unit dan Jenjang</h1>');
    expect(html).toContain('Tambah unit sekolah');
    expect(html).toContain('Jenjang pendidikan');
    expect(html).not.toContain('Panduan · baca saja');

    auth.role = 'guru';
    const denied = renderToStaticMarkup(React.createElement(AdminSchoolUnitsPage));
    expect(denied).toContain('hanya tersedia bagi admin sekolah');
    expect(denied).not.toContain('Tambah unit sekolah');
  });

  it('membuka monitoring ujian tenant yang hanya menampilkan data agregat', () => {
    auth.role = 'admin_sekolah';
    auth.activeRole = null;
    const html = renderSubmenu('/admin/dashboard/ujian');

    expect(html).toContain('<h1>Monitoring Ujian</h1>');
    expect(html).toContain('Nama siswa, jawaban, kunci, dan nilai individual tidak ditampilkan.');
    expect(html).not.toContain('Panduan · baca saja');
  });
});

describe('pengumuman tenant', () => {
  it('menyediakan pembacaan untuk guru dan kontrol tulis hanya untuk staf sekolah', () => {
    auth.role = 'guru';
    auth.activeRole = null;
    const guruHtml = renderToStaticMarkup(React.createElement(SchoolAnnouncementsPage));
    expect(guruHtml).toContain('Pengumuman terbaru');
    expect(guruHtml).not.toContain('Terbitkan pengumuman');

    for (const role of ['admin_sekolah', 'operator']) {
      auth.role = role;
      const staffHtml = renderToStaticMarkup(React.createElement(SchoolAnnouncementsPage));
      expect(staffHtml).toContain('Terbitkan pengumuman');
      expect(staffHtml).toContain('Jangan sertakan nilai');
    }
  });
});

describe('generator soal AI', () => {
  it('membuka halaman generator yang sama dengan fitur bank soal nyata', () => {
    auth.role = 'guru';
    auth.activeRole = null;
    auth.tenantId = 'sekolah-test';
    const html = renderToStaticMarkup(
      React.createElement(
        MemoryRouter,
        { initialEntries: ['/asesmen/generator-ai'] },
        React.createElement(QuestionBankPage),
      ),
    );

    expect(html).toContain('<h1>Generator Soal AI</h1>');
    expect(html).toContain('Buat draf dengan AI');
    expect(html).toContain('Simpan soal');
  });
});

describe('mode asesmen guru', () => {
  it.each([
    ['diagnostik', 'Asesmen Diagnostik'],
    ['formatif', 'Asesmen Formatif'],
    ['sumatif', 'Asesmen Sumatif'],
  ])('membuka builder %s melalui mesin ujian yang sama', (assessmentType, label) => {
    auth.role = 'guru';
    auth.activeRole = null;
    auth.tenantId = 'sekolah-test';
    const html = renderToStaticMarkup(
      React.createElement(OnlineAssessmentPage, { assessmentType }),
    );

    expect(html).toContain(`<h2 id="exam-create-title">Jadwalkan ${label}</h2>`);
    expect(html).toContain('Pilih soal');
    expect(html).toContain('Jadwal mulai, batas akhir, dan durasi dihitung serta ditegakkan server');
  });

  it('menggunakan peran guru aktif spesialis saat peran utama admin', () => {
    auth.role = 'admin_sekolah';
    auth.activeRole = 'guru_bk';
    const html = renderToStaticMarkup(
      React.createElement(OnlineAssessmentPage, { assessmentType: 'formatif' }),
    );

    expect(html).toContain('Jadwalkan Asesmen Formatif');
    expect(html).not.toContain('Modul ini tersedia untuk akun guru dan siswa aktif');
  });
});

describe('cover perangkat', () => {
  it('menyediakan pratinjau cetak untuk guru', () => {
    auth.role = 'guru';
    auth.activeRole = null;
    const html = renderToStaticMarkup(React.createElement(PlanningCoverPage));

    expect(html).toContain('<h1>Cover Perangkat</h1>');
    expect(html).toContain('Cetak / Simpan PDF');
    expect(html).toContain('Pratinjau cover perangkat');
  });

  it('menolak role yang bukan guru', () => {
    auth.role = 'siswa';
    auth.activeRole = null;
    const html = renderToStaticMarkup(React.createElement(PlanningCoverPage));

    expect(html).toContain('Cover perangkat ajar hanya tersedia bagi akun guru');
    expect(html).not.toContain('Cetak / Simpan PDF');
  });
});

describe('admin monitoring asesmen', () => {
  it.each([
    ['/admin/asesmen/paket', 'Paket Ujian'],
    ['/admin/asesmen/jadwal', 'Jadwal Ujian'],
    ['/admin/asesmen/monitoring', 'Monitoring Ujian'],
    ['/admin/asesmen/analisis', 'Analisis Hasil'],
  ])('merender ringkasan tenant pada %s', (path, title) => {
    auth.role = 'admin_sekolah';
    auth.activeRole = null;
    const html = renderToStaticMarkup(
      React.createElement(MemoryRouter, { initialEntries: [path] }, React.createElement(AdminAssessmentPage)),
    );

    expect(html).toContain(`<h1>${title}</h1>`);
    expect(html).toContain('Nama siswa, jawaban, kunci, dan nilai individual tidak ditampilkan.');
    expect(html).toContain('Ringkasan ujian');
  });
});
