const tautan = (label, path, ikon, search = '') => ({ label, path, ikon, search });
const perencanaan = (label, jenis, ikon) =>
  tautan(label, '/perencanaan', ikon, `?jenis=${jenis}`);

export function adalahPeranGuru(role) {
  return ['guru', 'guru_bk', 'guru_kokurikuler', 'guru_ekstrakurikuler']
    .includes(String(role || '').trim().toLowerCase());
}

export const GRUP_MENU = [
  {
    id: 'beranda', label: 'Dashboard', ikon: 'home',
    item: [tautan('Dashboard', '/dashboard', 'home')],
  },
  {
    id: 'chat', label: 'Asisten & Chat', ikon: 'chat',
    item: [
      tautan('Asisten AI', '/asisten', 'spark'),
      tautan('Semua Percakapan', '/chat', 'chat'),
      tautan('Kontak', '/chat/kontak', 'users'),
      tautan('Grup', '/chat/grup', 'users'),
      tautan('Testimoni', '/testimoni', 'chat'),
    ],
  },
  {
    id: 'datadasar', label: 'Data Dasar', ikon: 'database',
    item: [
      tautan('Profil Guru & Sekolah', '/datadasar/profil', 'user'),
      tautan('Tahun Ajaran & Semester', '/datadasar/ta', 'calendar'),
      tautan('Kelas & Mapel Saya', '/datadasar/kelas', 'book'),
      tautan('Data Siswa', '/datadasar/siswa', 'users'),
      tautan('Barcode & Kartu Absensi', '/datadasar/barcode', 'qr'),
      tautan('Jadwal Mengajar', '/datadasar/jadwal', 'calendar'),
      tautan('Kelompok & Denah Duduk', '/datadasar/denah', 'grid'),
    ],
  },
  {
    id: 'perencanaan', label: 'Sumber Perencanaan', ikon: 'book',
    item: [
      tautan('Peta Sebaran TP', '/perencanaan', 'chart', '?jenis=atp&tampilan=peta'),
      perencanaan('RPE (Rincian Pekan Efektif)', 'rpe', 'calendar'),
      perencanaan('ATP (Alur Tujuan Pembelajaran)', 'atp', 'book'),
      perencanaan('Program Tahunan', 'prota', 'calendar'),
      perencanaan('Program Semester', 'prosem', 'calendar'),
      perencanaan('KKTP', 'kktp', 'check'),
      perencanaan('Modul Ajar', 'modul', 'book'),
      tautan('Modul Ajar Untuk Siswa', '/perangkat/modul-siswa', 'book'),
      tautan('Cover Perangkat', '/perangkat/cover', 'file'),
      tautan('Hasil Perencanaan', '/hasil/perencanaan', 'file'),
    ],
  },
  {
    id: 'pelaksanaan', label: 'Pelaksanaan Pembelajaran', ikon: 'book',
    item: [
      tautan('Jurnal Mengajar Harian', '/pelaksanaan/jurnal', 'file'),
      tautan('Presensi Siswa', '/pelaksanaan/presensi', 'check'),
      tautan('Program BK & Kegiatan', '/program-kegiatan', 'file'),
      tautan('Realisasi terhadap Rencana', '/pelaksanaan/realisasi', 'chart'),
      tautan('Pembelajaran Berdiferensiasi', '/pelaksanaan/berdiferensiasi', 'users'),
      tautan('Kegiatan Kelas Khusus', '/pelaksanaan/kelas-khusus', 'users'),
      tautan('Catatan Kelas Cepat', '/pelaksanaan/catatan-cepat', 'file'),
    ],
  },
  {
    id: 'asesmen', label: 'Asesmen dan Penilaian', ikon: 'check',
    item: [
      tautan('Asesmen Diagnostik', '/asesmen/diagnostik', 'check'),
      tautan('Asesmen Formatif', '/asesmen/formatif', 'check'),
      tautan('Asesmen Sumatif', '/asesmen/sumatif', 'check'),
      tautan('Rubrik & Instrumen', '/asesmen/rubrik', 'file'),
      tautan('Bank Soal', '/asesmen/bank-soal', 'book'),
      tautan('Analisis Hasil', '/asesmen/analisis', 'chart'),
      tautan('Remedial & Pengayaan', '/asesmen/remedial', 'refresh'),
      tautan('Nilai & Capaian Rapor', '/asesmen/rapor', 'chart'),
      tautan('Ujian Online', '/asesmen/ujian-online', 'book'),
      tautan('Generator Soal AI', '/asesmen/generator-ai', 'spark'),
      tautan('Penilaian Otomatis', '/asesmen/penilaian-otomatis', 'spark'),
    ],
  },
  {
    id: 'pemantauan', label: 'Pemantauan Siswa', ikon: 'users',
    item: [
      tautan('Profil Siswa Satu Halaman', '/pemantauan/profil-siswa', 'user'),
      tautan('Catatan Perkembangan', '/pemantauan/catatan', 'file'),
      tautan('Penguatan Karakter & Projek', '/pemantauan/karakter', 'chart'),
      tautan('Pendampingan & Tindak Lanjut', '/pemantauan/pendampingan', 'users'),
      tautan('Komunikasi dengan Orang Tua', '/pemantauan/komunikasi', 'chat'),
    ],
  },
  {
    id: 'refleksi', label: 'Refleksi & Pengembangan Profesional', ikon: 'spark',
    item: [
      tautan('Refleksi Pembelajaran', '/refleksi/pembelajaran', 'refresh'),
      tautan('Supervisi & Observasi', '/refleksi/supervisi', 'users'),
      tautan('Portofolio Guru', '/refleksi/portofolio', 'file'),
      tautan('Pengembangan Kompetensi', '/refleksi/kompetensi', 'spark'),
      tautan('Rencana Perbaikan', '/refleksi/perbaikan', 'check'),
    ],
  },
  {
    id: 'laporan', label: 'Laporan dan Arsip', ikon: 'file',
    item: [
      tautan('Laporan Harian s.d. Bulanan', '/laporan/harian-bulanan', 'file'),
      tautan('Laporan Penilaian', '/laporan/penilaian', 'file'),
      tautan('Laporan Ketercapaian', '/laporan/ketercapaian', 'chart'),
      tautan('Laporan Kinerja Guru', '/laporan/kinerja-guru', 'file'),
      tautan('Ekspor & Cetak', '/laporan/ekspor-cetak', 'file'),
      tautan('Hasil Perencanaan (Arsip)', '/laporan/arsip-perencanaan', 'file'),
      tautan('Dokumen Hanya-Baca', '/laporan/dokumen', 'file'),
      tautan('Riwayat Cetak', '/laporan/riwayat-cetak', 'calendar'),
    ],
  },
  {
    id: 'kolaborasi', label: 'Kolaborasi', ikon: 'users',
    item: [
      tautan('Ruang Kerja Tim / MGMP', '/kolaborasi/ruang-kerja', 'users'),
      tautan('Berbagi Praktik Baik', '/kolaborasi/praktik-baik', 'file'),
      tautan('Akses Kepala Sekolah', '/kolaborasi/kepala-sekolah', 'users'),
      tautan('Grup Chat', '/kolaborasi/grup-chat', 'chat'),
      tautan('Guru Pengganti', '/kolaborasi/guru-pengganti', 'users'),
    ],
  },
  {
    id: 'pengaturan', label: 'Pengaturan', ikon: 'settings',
    item: [
      tautan('Akun & Keamanan', '/pengaturan/akun', 'settings'),
      tautan('Peran & Hak Akses', '/pengaturan/peran', 'users'),
      tautan('Preferensi', '/pengaturan/preferensi', 'settings'),
      tautan('Cadangan & Pemulihan', '/pengaturan/cadangan', 'file'),
      tautan('Integrasi Google', '/pengaturan/google', 'settings'),
      tautan('AI & Layanan', '/pengaturan/api-ai', 'settings'),
      tautan('Pusat Bantuan', '/pengaturan/bantuan', 'chat'),
      tautan('Notifikasi', '/pengaturan/notifikasi', 'chat'),
    ],
  },
];

const grup = (id, label, ikon, item) => ({ id, label, ikon, item });
const MENU_TANPA_PERAN = [
  grup('beranda', 'Dashboard', 'home', [
    tautan('Dashboard', '/dashboard', 'home'),
  ]),
];
const MENU_DEMO = [
  grup('uji-coba', 'Uji Coba', 'book', [
    tautan('Simulasi data contoh', '/trial', 'book'),
  ]),
];
const MENU_SISWA = [
  grup('siswa-dashboard', 'Dashboard', 'home', [
    tautan('Dashboard', '/dashboard', 'home'),
  ]),
  grup('siswa-belajar', 'Ruang Belajar', 'book', [
    tautan('Jadwal dan Tugas', '/siswa/jadwal', 'calendar'),
    tautan('Materi', '/siswa/materi', 'book'),
    tautan('Ujian Saya', '/siswa/ujian', 'check'),
    tautan('Nilai Saya', '/siswa/nilai', 'chart'),
  ]),
  grup('siswa-akun', 'Akun dan Langganan', 'settings', [
    tautan('Paket dan Langganan', '/purchase', 'badge'),
  ]),
  grup('siswa-chat', 'Komunikasi', 'chat', [
    tautan('Percakapan', '/chat', 'chat'),
    tautan('Kontak', '/chat/kontak', 'users'),
    tautan('Grup', '/chat/grup', 'users'),
  ]),
];
const MENU_ORTU = [
  grup('ortu-dashboard', 'Dashboard', 'home', [
    tautan('Dashboard', '/dashboard', 'home'),
  ]),
  grup('ortu-anak', 'Perkembangan Anak', 'chart', [
    tautan('Ringkasan Anak', '/orang-tua/anak', 'user'),
    tautan('Nilai dan Kehadiran', '/orang-tua/nilai-kehadiran', 'chart'),
  ]),
  grup('ortu-komunikasi', 'Komunikasi', 'chat', [
    tautan('Percakapan', '/chat', 'chat'),
    tautan('Kontak', '/chat/kontak', 'users'),
  ]),
];
const MENU_KONTEKS_TERBATAS = [
  grup('beranda', 'Dashboard', 'home', [
    tautan('Dashboard', '/dashboard', 'home'),
  ]),
];
export const MENU_OPERATOR = [
  grup('operator-dashboard', 'Dashboard', 'home', [
    tautan('Dashboard', '/dashboard', 'home'),
  ]),
  grup('operator-sekolah', 'Operasional Sekolah', 'database', [
    tautan('Data Siswa', '/datadasar/siswa', 'users'),
    tautan('Barcode & Kartu Absensi', '/datadasar/barcode', 'qr'),
    tautan('Presensi', '/pelaksanaan/presensi', 'check'),
  ]),
  grup('operator-komunikasi', 'Komunikasi', 'chat', [
    tautan('Percakapan', '/chat', 'chat'),
    tautan('Kontak', '/chat/kontak', 'users'),
    tautan('Grup', '/chat/grup', 'users'),
  ]),
];

export const MENU_ADMIN_SEKOLAH = [
  grup('admin-dashboard', 'Dashboard Admin', 'chart', [
    tautan('Ringkasan Statistik', '/dashboard', 'chart'),
  ]),
  grup('admin-monitoring', 'Monitoring', 'chart', [
    tautan('Aktivitas Terbaru', '/admin/aktivitas', 'file'),
    tautan('Monitoring Ujian', '/admin/dashboard/ujian', 'check'),
    tautan('Monitoring Chat', '/admin/dashboard/chat', 'chat'),
  ]),
  grup('admin-instansi', 'Manajemen Instansi', 'database', [
    tautan('Profil Sekolah', '/admin/instansi/profil', 'user'),
    tautan('Tahun Ajaran', '/admin/instansi/tahun-ajaran', 'calendar'),
    tautan('Semester', '/admin/instansi/semester', 'calendar'),
    tautan('Unit dan Jenjang', '/admin/instansi/unit', 'book'),
  ]),
  grup('admin-chat', 'Chat', 'chat', [
    tautan('Percakapan', '/chat', 'chat'),
    tautan('Kontak', '/chat/kontak', 'users'),
    tautan('Grup', '/chat/grup', 'users'),
  ]),
  grup('admin-pengguna', 'Manajemen Pengguna', 'users', [
    tautan('Guru', '/admin/pengguna/guru', 'users'),
    tautan('Siswa', '/admin/pengguna/siswa', 'users'),
    tautan('Tautkan akun siswa ke roster', '/admin/pengguna/tautkan-siswa', 'users'),
    tautan('Orang Tua', '/admin/pengguna/orang-tua', 'users'),
    tautan('Admin Sekolah', '/admin/pengguna/admin', 'user'),
    tautan('Peran dan Hak Akses', '/admin/pengguna/peran', 'settings'),
  ]),
  grup('admin-akademik', 'Manajemen Akademik', 'book', [
    tautan('Kelas', '/admin/akademik/kelas', 'book'),
    tautan('Mata Pelajaran', '/admin/akademik/mapel', 'book'),
    tautan('Jadwal', '/admin/akademik/jadwal', 'calendar'),
    tautan('Kelompok', '/admin/akademik/kelompok', 'users'),
    tautan('Denah Duduk', '/admin/akademik/denah', 'grid'),
  ]),
  grup('admin-perencanaan', 'Manajemen Perencanaan', 'file', [
    tautan('Paket Guru', '/admin/perencanaan/paket', 'file'),
    tautan('Monitoring Perencanaan', '/admin/perencanaan/monitoring', 'chart'),
    tautan('Persetujuan Perangkat', '/admin/perencanaan/persetujuan', 'check'),
  ]),
  grup('admin-asesmen', 'Manajemen Asesmen', 'check', [
    tautan('Bank Soal', '/asesmen/bank-soal', 'book'),
    tautan('Paket Ujian', '/admin/asesmen/paket', 'file'),
    tautan('Jadwal Ujian', '/admin/asesmen/jadwal', 'calendar'),
    tautan('Monitoring Ujian', '/admin/asesmen/monitoring', 'chart'),
    tautan('Analisis Hasil', '/admin/asesmen/analisis', 'chart'),
  ]),
  grup('admin-konten', 'Manajemen Konten', 'file', [
    tautan('Modul Ajar', '/admin/konten/modul-ajar', 'book'),
    tautan('Bahan Ajar', '/admin/konten/bahan-ajar', 'file'),
    tautan('Perpustakaan Digital', '/admin/konten/perpustakaan', 'file'),
  ]),
  grup('admin-komunikasi', 'Manajemen Komunikasi', 'chat', [
    tautan('Kanal Pengumuman', '/admin/komunikasi/pengumuman', 'file'),
    tautan('Broadcast', '/admin/komunikasi/broadcast', 'users'),
    tautan('Monitoring Agregat', '/admin/komunikasi/monitoring', 'chart'),
    tautan('Moderasi Testimoni', '/testimoni', 'chat'),
  ]),
  grup('admin-keuangan', 'Manajemen Keuangan', 'chart', [
    tautan('Purchase Lisensi', '/purchase', 'file'),
    tautan('Pembayaran', '/admin/keuangan/pembayaran', 'file'),
    tautan('Tagihan', '/admin/keuangan/tagihan', 'file'),
    tautan('Laporan Keuangan', '/admin/keuangan/laporan', 'chart'),
  ]),
  grup('admin-laporan', 'Laporan dan Analitik', 'chart', [
    tautan('Laporan Akademik', '/admin/laporan/akademik', 'file'),
    tautan('Laporan Keuangan', '/admin/laporan/keuangan', 'file'),
    tautan('Laporan Kinerja', '/admin/laporan/kinerja', 'chart'),
    tautan('Ekspor', '/admin/laporan/ekspor', 'file'),
  ]),
  grup('admin-pengaturan', 'Pengaturan Sistem', 'settings', [
    tautan('Integrasi', '/admin/pengaturan/integrasi', 'settings'),
    tautan('API dan Layanan', '/admin/pengaturan/api', 'settings'),
    tautan('Cadangan', '/admin/pengaturan/cadangan', 'file'),
    tautan('Log Aktivitas', '/admin/pengaturan/log-aktivitas', 'file'),
  ]),
  grup('admin-bantuan', 'Bantuan dan Dukungan', 'chat', [
    tautan('Panduan Admin', '/admin/bantuan/panduan', 'file'),
    tautan('Kontak Support', '/admin/bantuan/support', 'chat'),
    tautan('FAQ', '/admin/bantuan/faq', 'chat'),
  ]),
];

export const MENU_SUPERADMIN = [
  grup('platform-dashboard', 'Dashboard Super Admin', 'chart', [
    tautan('Statistik Global', '/platform/dashboard/statistik', 'chart'),
  ]),
  grup('platform-monitoring', 'Monitoring Platform', 'chart', [
    tautan('Kesehatan Sistem', '/platform/dashboard/kesehatan', 'settings'),
    tautan('Log Aktivitas', '/platform/dashboard/aktivitas', 'file'),
  ]),
  grup('platform-tenant', 'Manajemen Tenant', 'database', [
    tautan('Daftar Sekolah', '/platform/tenant/sekolah', 'users'),
    tautan('Langganan', '/platform/tenant/langganan', 'file'),
    tautan('Paket', '/platform/tenant/paket', 'book'),
  ]),
  grup('platform-chat', 'Chat Dukungan', 'chat', [
    tautan('Percakapan', '/chat', 'chat'),
    tautan('Kontak Admin Sekolah', '/chat/kontak', 'users'),
    tautan('Grup', '/chat/grup', 'users'),
  ]),
  grup('platform-pengguna', 'Manajemen Pengguna Global', 'users', [
    tautan('Akun Pengguna', '/platform/pengguna/admin-sekolah', 'users'),
    tautan('Pengguna Supabase', '/platform/supabase-users', 'users'),
    tautan('Peran Global', '/platform/pengguna/peran', 'settings'),
  ]),
  grup('platform-fitur', 'Manajemen Menu dan Fitur', 'settings', [
    tautan('Menu Builder', '/platform/fitur/menu', 'file'),
    tautan('Feature Flags', '/platform/fitur/flags', 'settings'),
    tautan('Izin Peran', '/platform/fitur/izin', 'users'),
  ]),
  grup('platform-konten', 'Manajemen Konten Global', 'file', [
    tautan('Paket Guru', '/admin/perencanaan/paket', 'users'),
    tautan('Template Perangkat', '/platform/konten/template', 'file'),
    tautan('Bank Soal Global', '/platform/konten/bank-soal', 'book'),
    tautan('Modul', '/platform/konten/modul', 'book'),
  ]),
  grup('platform-ai', 'Manajemen AI', 'spark', [
    tautan('API Key Gemini', '/platform/ai/api-key', 'settings'),
    tautan('Template Prompt', '/platform/ai/prompt', 'file'),
    tautan('Monitoring Penggunaan AI', '/platform/ai/monitoring', 'chart'),
  ]),
  grup('platform-keamanan', 'Keamanan dan Audit', 'settings', [
    tautan('Supabase RLS', '/platform/keamanan/rules', 'settings'),
    tautan('Audit Log', '/platform/keamanan/audit', 'file'),
  ]),
  grup('platform-laporan', 'Laporan dan Analitik Global', 'chart', [
    tautan('Penggunaan', '/platform/laporan/penggunaan', 'chart'),
    tautan('Performa', '/platform/laporan/performa', 'chart'),
    tautan('Biaya', '/platform/laporan/biaya', 'file'),
  ]),
  grup('platform-pengaturan', 'Pengaturan Platform', 'settings', [
    tautan('Konfigurasi', '/platform/pengaturan/konfigurasi', 'settings'),
    tautan('Integrasi', '/platform/pengaturan/integrasi', 'settings'),
    tautan('Cadangan', '/platform/pengaturan/cadangan', 'file'),
    tautan('Mode Pemeliharaan', '/platform/pengaturan/pemeliharaan', 'settings'),
  ]),
];

function cocokJenis(item, path, search) {
  if (!item.search) return true;
  const target = new URLSearchParams(item.search);
  if (path === item.path) {
    const current = new URLSearchParams(search);
    return [...target].every(([key, value]) => current.get(key) === value);
  }
  if (target.has('tampilan')) return false;
  const jenis = target.get('jenis');
  return path.startsWith(`${item.path}/`) && path.endsWith(`/${jenis}`);
}

export function menuUntukPeran(role) {
  const peran = String(role || '').trim().toLowerCase();
  if (peran === 'admin_sekolah' || peran === 'admin') return MENU_ADMIN_SEKOLAH;
  if (peran === 'superadmin') return MENU_SUPERADMIN;
  if (peran === 'siswa') return MENU_SISWA;
  if (peran === 'ortu' || peran === 'orang_tua') return MENU_ORTU;
  if (peran === 'operator') return MENU_OPERATOR;
  if (peran === 'demo') return MENU_DEMO;
  if (['kepala_sekolah', 'wali_kelas'].includes(peran)) return MENU_KONTEKS_TERBATAS;
  if (adalahPeranGuru(peran)) return GRUP_MENU;
  return MENU_TANPA_PERAN;
}

export function cariMenu(path, search = '', role = 'guru') {
  for (const grup of menuUntukPeran(role)) {
    const item = grup.item
      .filter((calon) =>
        calon.path && (path === calon.path || path.startsWith(`${calon.path}/`)) &&
        cocokJenis(calon, path, search))
      .sort((a, b) => b.path.length - a.path.length)[0];
    if (item) return { grup, item };
  }
  return null;
}
