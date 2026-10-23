// web/src/menu.js
// ---------------------------------------------------------------------------
// menu.js — Adaptor menu/sidebar. Guru dan superadmin memakai katalog rute
// navigasi.js agar tautan sidebar dan route metadata selalu selaras.
//
// Rute memakai hash (#/...) supaya hosting statis tidak perlu rewrite SPA.
//
// Status item kompatibilitas:
//   rute    : halaman yang sudah ada (href "#/rute")
//   gulir   : bagian di halaman Dasbor (menggulir ke kartu terkait)
//   gas     : fitur yang masih berjalan di aplikasi perencanaan lama (Apps Script)
//   segera  : belum dibangun (tampil redup, tidak bisa diklik)
//
// Catatan:
//   - Grup "Dasbor" hanya punya 1 item → dirender sebagai link tunggal oleh
//     sidebar.js (tanpa chevron, tanpa sub-menu).
//   - Sub-menu Data Dasar memakai sub-rute bersih (#/datadasar/siswa, dst.).
//     Router mengenali pola /datadasar/:sub.
//     URL lama #/datadasar?tab=siswa tetap bekerja (dialihkan oleh subDariUrl()
//     di pages/dataDasar.js).
//   - Sub-menu Chat: #/chat, #/chat/kontak, #/chat/grup.
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helper pembuat item
// ---------------------------------------------------------------------------
import {
  GRUP_MENU as MENU_NAV_GURU,
  MENU_OPERATOR as MENU_NAV_OPERATOR,
  MENU_SUPERADMIN as MENU_NAV_SUPERADMIN,
  menuUntukPeran,
} from './navigasi.js';

const r = (judul, href, ikon) => ({ status: 'rute',   judul, href, ikon });
const g = (judul, kunci, ikon) => ({ status: 'gulir', judul, kunci, href: `#/dashboard?k=${kunci}`, ikon });
const p = (judul, ikon)        => ({ status: 'gas',    judul, ikon });
const s = (judul, ikon)        => ({ status: 'segera', judul, ikon });

// Tautan Chat dipakai berulang di beberapa peran.
const chat = { status: 'rute', judul: 'Chat', href: '#/chat', ikon: 'chat-dots' };

// ---------------------------------------------------------------------------
// MENU GURU — 10 grup
// ---------------------------------------------------------------------------
export const MENU_GURU = [
  {
    id: 'dasbor', judul: 'Dashboard', ikon: 'speedometer2',
    items: [
      r('Dashboard', '#/dashboard', 'house'),
    ],
  },
  {
    id: 'datadasar', judul: 'Data Dasar', ikon: 'database',
    items: [
      r('Profil Guru & Sekolah',   '#/datadasar/profil',  'person-badge'),
      r('Tahun Ajaran & Semester', '#/datadasar/ta',      'calendar3'),
      r('Kelas & Mapel Saya',      '#/datadasar/kelas',   'journal-bookmark'),
      r('Data Siswa',              '#/datadasar/siswa',   'mortarboard'),
      r('Barcode & Kartu Absensi', '#/datadasar/barcode', 'qr-code'),
      r('Jadwal Mengajar',         '#/datadasar/jadwal',  'calendar-week'),
      r('Kelompok & Denah Duduk',  '#/datadasar/denah',   'grid-3x3'),
    ],
  },
  {
    id: 'perencanaan', judul: 'Sumber Perencanaan', ikon: 'layers',
    items: [
      s('Peta Sebaran TP',                 'geo-alt'),
      p('RPE (Rincian Pekan Efektif)',     'calendar-range'),
      p('ATP (Alur Tujuan Pembelajaran)',  'signpost-split'),
      p('Program Tahunan',                 'calendar4'),
      p('Program Semester',                'calendar4-week'),
      p('KKTP',                            'bullseye'),
      p('Modul Ajar',                      'journal-text'),
      p('Modul Ajar Untuk Siswa',          'person-video3'),
      p('Cover Perangkat',                 'file-earmark-image'),
      s('Hasil Perencanaan',               'archive'),
    ],
  },
  {
    id: 'pelaksanaan', judul: 'Pelaksanaan Pembelajaran', ikon: 'pencil-square',
    items: [
      s('Jurnal Mengajar Harian',       'journal-check'),
      s('Presensi Siswa',               'person-check'),
      s('Realisasi terhadap Rencana',   'check2-all'),
      s('Pembelajaran Berdiferensiasi', 'diagram-3'),
      s('Kegiatan Kelas Khusus',        'people-fill'),
      s('Catatan Kelas Cepat',          'sticky'),
    ],
  },
  {
    id: 'asesmen', judul: 'Asesmen dan Penilaian', ikon: 'clipboard-check',
    items: [
      s('Asesmen Diagnostik',    'clipboard-pulse'),
      s('Asesmen Formatif',      'clipboard-data'),
      s('Asesmen Sumatif',       'clipboard2-check'),
      s('Rubrik & Instrumen',    'list-check'),
      r('Bank Soal',             '#/asesmen/bank-soal', 'collection'),
      s('Analisis Hasil',        'graph-up'),
      s('Remedial & Pengayaan',  'arrow-repeat'),
      s('Nilai & Capaian Rapor', 'award'),
      s('Ujian Online',          'pc-display'),
      s('Generator Soal AI',     'robot'),
      s('Penilaian Otomatis',    'magic'),
    ],
  },
  {
    id: 'pemantauan', judul: 'Pemantauan Siswa', ikon: 'people',
    items: [
      s('Profil Siswa Satu Halaman',    'person-vcard'),
      s('Catatan Perkembangan',         'journal-richtext'),
      s('Penguatan Karakter & Projek',  'star'),
      s('Pendampingan & Tindak Lanjut', 'life-preserver'),
      r('Komunikasi dengan Orang Tua',  '#/chat', 'chat-dots'),
    ],
  },
  {
    id: 'refleksi', judul: 'Refleksi & Pengembangan Profesional', ikon: 'lightbulb',
    items: [
      s('Refleksi Pembelajaran',  'arrow-counterclockwise'),
      s('Supervisi & Observasi',  'binoculars'),
      s('Portofolio Guru',        'briefcase'),
      s('Pengembangan Kompetensi','rocket-takeoff'),
      s('Rencana Perbaikan',      'tools'),
    ],
  },
  {
    id: 'laporan', judul: 'Laporan dan Arsip', ikon: 'file-earmark-bar-graph',
    items: [
      s('Laporan Harian s.d. Bulanan', 'file-earmark-ruled'),
      s('Laporan Penilaian',           'file-earmark-check'),
      s('Laporan Ketercapaian',        'file-earmark-medical'),
      s('Laporan Kinerja Guru',        'file-earmark-person'),
      s('Ekspor & Cetak',              'printer'),
      p('Hasil Perencanaan (Arsip)',   'archive'),
      s('Dokumen Hanya-Baca',          'file-lock2'),
      s('Riwayat Cetak',               'clock-history'),
    ],
  },
  {
    id: 'kolaborasi', judul: 'Kolaborasi', ikon: 'chat-square-text',
    items: [
      s('Ruang Kerja Tim / MGMP', 'microsoft-teams'),
      s('Berbagi Praktik Baik',   'share'),
      s('Akses Kepala Sekolah',   'building'),
      s('Pengumuman & Pesan',     'megaphone'),
      s('Guru Pengganti',         'person-plus'),
    ],
  },
  {
    id: 'pengaturan', judul: 'Pengaturan', ikon: 'gear',
    items: [
      s('Akun & Keamanan',      'shield-lock'),
      s('Peran & Hak Akses',    'key'),
      s('Preferensi',           'sliders'),
      s('Cadangan & Pemulihan', 'cloud-arrow-up'),
      s('Integrasi Google',     'google'),
      s('AI & Layanan',        'robot'),
      s('Pusat Bantuan',        'question-circle'),
      s('Notifikasi',           'bell'),
    ],
  },
];

// ---------------------------------------------------------------------------
// Grup "Utama" dan MENU_ADMIN
// ---------------------------------------------------------------------------
const GRUP_UTAMA = {
  id: 'utama', judul: 'Utama', ikon: 'speedometer2',
  items: [
    r('Dashboard', '#/dashboard', 'house'),
    r('Chat',      '#/chat',      'chat-dots'),
  ],
};

export const MENU_ADMIN = [
  GRUP_UTAMA,
  {
    id: 'administrasi', judul: 'Administrasi', ikon: 'building',
    items: [
      s('Instansi',   'building'),
      s('Pengguna',   'people'),
      s('Template',   'file-earmark-text'),
    ],
  },
];

// ---------------------------------------------------------------------------
// MENU TAMBAHAN per peran — digabung oleh gabungMenu()
// ---------------------------------------------------------------------------
const TAMBAHAN = {
  guru: [
    {
      id: 'x-chat', judul: 'Chat', ikon: 'chat-dots', setelah: 'dasbor',
      items: [
        // ulang:true → tetap muncul walaupun sudah ada item dengan href #/chat.
        { ...chat, judul: 'Semua Percakapan', ulang: true },
        r('Kontak', '#/chat/kontak', 'person-rolodex'),
        r('Grup',   '#/chat/grup',   'people-fill'),
      ],
    },
  ],

  admin_sekolah: [
    {
      id: 'x-asesmen', judul: 'Asesmen dan Penilaian', ikon: 'clipboard-check',
      items: [
        r('Bank Soal', '#/asesmen/bank-soal', 'collection'),
      ],
    },
    {
      id: 'x-pengguna', judul: 'Pengguna dan Akun', ikon: 'people',
      items: [
        s('Daftar Pengguna',          'people'),
        s('Impor Akun Guru (Excel)',  'file-earmark-spreadsheet'),
        s('Undangan Tautan',          'link-45deg'),
        s('Persetujuan Akun',         'person-check'),
        s('Data Siswa dan Orang Tua', 'person-hearts'),
      ],
    },
    {
      id: 'x-instansi', judul: 'Profil dan Template Instansi', ikon: 'building',
      items: [
        s('Profil Sekolah',         'building-gear'),
        s('Kepala Sekolah dan NIP', 'person-vcard'),
        s('Template Dokumen',       'file-earmark-text'),
        s('Standar Format',         'rulers'),
      ],
    },
    {
      id: 'x-kalender', judul: 'Kalender Akademik', ikon: 'calendar3',
      items: [
        s('Kalender Akademik',           'calendar3'),
        s('Pekan Efektif Bawaan',        'calendar-week'),
        s('Impor Kalender (Excel/Word)', 'file-earmark-arrow-up'),
      ],
    },
    {
      id: 'x-penugasan', judul: 'Penugasan', ikon: 'layers',
      items: [
        s('Penugasan Guru dan Mapel',     'person-workspace'),
        s('Rombel dan Wali Kelas',        'diagram-3'),
        s('Hubungan Orang Tua dan Siswa', 'people'),
      ],
    },
    {
      id: 'x-pantau', judul: 'Pemantauan Perangkat', ikon: 'graph-up-arrow',
      items: [
        s('Status Dokumen Guru',          'file-earmark-check'),
        s('Jatah Generate per Guru',      'speedometer2'),
        s('Laporan untuk Kepala Sekolah', 'clipboard-data'),
      ],
    },
    {
      id: 'x-komunikasi', judul: 'Komunikasi', ikon: 'chat-dots',
      items: [
        // Chat sudah ada di GRUP_UTAMA; hanya tambahkan yang belum ada.
        s('Pengumuman', 'megaphone'),
      ],
    },
    {
      id: 'x-log', judul: 'Aktivitas dan Log', ikon: 'clock-history',
      items: [
        s('Log Aktivitas',         'activity'),
        s('Riwayat Akses Dokumen', 'file-earmark-lock'),
      ],
    },
    {
      id: 'x-akun', judul: 'Pengaturan', ikon: 'gear',
      items: [
        s('Mode Admin / Guru', 'arrow-left-right'),
        s('Profil Saya',       'person-circle'),
        s('Notifikasi',        'bell'),
        s('Hubungkan Google',  'google'),
      ],
    },
  ],

  superadmin: [
    {
      id: 'x-sekolah', judul: 'Sekolah dan Admin', ikon: 'building',
      items: [
        s('Daftar Sekolah',             'list-ul'),
        s('Tambah Admin Sekolah',       'person-plus'),
        s('Kelola Super Admin',         'shield-check'),
        s('Kuota Pengguna per Sekolah', 'speedometer2'),
      ],
    },
    {
      id: 'x-ai', judul: 'Prompt dan AI', ikon: 'robot',
      items: [
        s('Prompt AI Global', 'journal-code'),
        s('Penyedia AI',      'cpu'),
        s('Penggunaan AI',    'graph-up'),
      ],
    },
    {
      id: 'x-toggle', judul: 'Feature Toggle', ikon: 'toggle-on',
      items: [
        s('Fitur Global',    'globe'),
        s('Jurnal Mengajar', 'journal-check'),
        s('Presensi',        'person-check'),
        s('Nilai',           'award'),
      ],
    },
    {
      id: 'x-keamanan', judul: 'Keamanan dan Peran', ikon: 'shield-lock',
      items: [
        s('Peran dan Hak Akses', 'key'),
        s('Log Audit',           'clipboard-data'),
      ],
    },
    {
      id: 'x-pantau', judul: 'Pemantauan Platform', ikon: 'activity',
      items: [
        s('Kuota AI',              'speedometer2'),
        s('Aktivitas Platform',    'activity'),
        s('Pengguna Aktif Harian', 'people'),
      ],
    },
    {
      id: 'x-komunikasi', judul: 'Komunikasi', ikon: 'chat-dots',
      items: [
        s('Pengumuman Platform', 'megaphone'),
      ],
    },
  ],

  siswa: [
    {
      id: 'x-belajar', judul: 'Belajar', ikon: 'book',
      items: [
        s('Jadwal dan Tugas', 'calendar-check'),
        s('Materi',           'journal-text'),
        s('Ujian Saya',       'pc-display'),
        s('Nilai Saya',       'award'),
      ],
    },
  ],

  ortu: [
    {
      id: 'x-anak', judul: 'Perkembangan Anak', ikon: 'graph-up-arrow',
      items: [
        s('Ringkasan Anak',      'person-vcard'),
        s('Nilai dan Kehadiran', 'clipboard-data'),
      ],
    },
  ],
};

// ---------------------------------------------------------------------------
// Fungsi penggabungan dan pemilihan menu
// ---------------------------------------------------------------------------
const norm = (t) => String(t ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/&/g, ' dan ')
  .replace(/[^a-z0-9]+/g, '');

export function gabungMenu(role, dasar) {
  try {
    if (!Array.isArray(dasar)) return dasar;
    const tambahan = TAMBAHAN[role] || [];
    if (!tambahan.length) return dasar;

    const hasil = dasar.map((grup) => ({
      ...grup,
      items: Array.isArray(grup.items) ? [...grup.items] : [],
    }));

    const judulAda = new Set();
    const idAda = new Set();
    let punyaChat = false;

    hasil.forEach((grup) => {
      if (grup.id) idAda.add(grup.id);
      grup.items.forEach((item) => {
        judulAda.add(norm(item.judul));
        if (item.href === '#/chat') punyaChat = true;
      });
    });

    tambahan.forEach((t) => {
      const baru = t.items.filter((item) =>
        item.href === '#/chat' && !item.ulang
          ? !punyaChat
          : !judulAda.has(norm(item.judul))
      );
      baru.forEach((item) => {
        judulAda.add(norm(item.judul));
        if (item.href === '#/chat') punyaChat = true;
      });
      if (!baru.length) return;

      if (t.gabung) {
        const lama = hasil.find((grup) => grup.id === t.id);
        if (lama) lama.items.push(...baru);
        return;
      }

      const lama = hasil.find((grup) => norm(grup.judul) === norm(t.judul));
      if (lama) {
        lama.items.push(...baru);
        return;
      }

      let id = t.id;
      while (idAda.has(id)) id += '-2';
      idAda.add(id);

      const grupBaru = { id, judul: t.judul, ikon: t.ikon, items: baru };
      const idx = t.setelah ? hasil.findIndex((grup) => grup.id === t.setelah) : -1;
      if (idx >= 0) hasil.splice(idx + 1, 0, grupBaru);
      else hasil.push(grupBaru);
    });

    return hasil;
  } catch (err) {
    console.warn('[menu] penggabungan menu tambahan dilewati:', err);
    return dasar;
  }
}

export function menuUntuk(role) {
  const bersih = String(role || '').toLowerCase().trim();
  if (bersih === 'admin_sekolah' || bersih === 'admin') return gabungMenu('admin_sekolah', MENU_ADMIN);
  if (bersih === 'superadmin') return dariNavigasi(MENU_NAV_SUPERADMIN);
  if (['siswa', 'ortu', 'orang_tua'].includes(bersih)) {
    return dariNavigasi(menuUntukPeran(bersih));
  }
  if (bersih === 'operator') return dariNavigasi(MENU_NAV_OPERATOR);
  if (bersih === 'guru') {
    return dariNavigasi(MENU_NAV_GURU);
  }
  return dariNavigasi(menuUntukPeran(bersih));
}

function dariNavigasi(grupNavigasi) {
  return grupNavigasi.map((grup) => ({
    id: grup.id,
    judul: grup.label,
    ikon: grup.ikon,
    items: grup.item.map((item) => r(
      item.label,
      `#${item.path}${item.search || ''}`,
      item.ikon,
    )),
  }));
}

export function semuaItem(role) {
  return menuUntuk(role).flatMap((grup) =>
    Array.isArray(grup.items) ? grup.items : [grup]
  );
}

export function cariItem(role, id) {
  return semuaItem(role).find((item) => item.id === id);
}

export function cariMenu(role, kata) {
  const q = String(kata ?? '').trim().toLowerCase();
  if (!q) return [];
  return semuaItem(role)
    .filter((item) => String(item.judul ?? '').toLowerCase().includes(q))
    .slice(0, 8);
}