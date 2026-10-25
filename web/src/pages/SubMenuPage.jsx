import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { isSchoolAdminRole, isTeacherRole } from '../services/roleAccess.js';
import { cariMenu } from '../navigasi.js';
import Ikon from '../components/Ikon.jsx';
import TeacherWorkspacePage from './TeacherWorkspacePage.jsx';
import TeacherAccountPage from './TeacherAccountPage.jsx';
import PrivateWorkspaceRecords from './PrivateWorkspaceRecords.jsx';
import NotificationPreferencesPage from './NotificationPreferencesPage.jsx';
import TeacherPreferencesPage from './TeacherPreferencesPage.jsx';
import '../styles/submenu.css';

const ALUR = {
  'admin-dashboard': {
    ringkasan: 'Dashboard menampilkan ringkasan sekolah. Linimasa aktivitas tercatat, ringkasan agregat chat, dan monitoring ujian tersedia sebagai modul tenant. Ini bukan audit log lengkap atau alat moderasi chat.',
    langkah: ['Tinjau ringkasan pada Dashboard', 'Pilih modul aktif dari tautan terkait', 'Gunakan halaman panduan ini hanya sebagai petunjuk'],
  },
  'admin-pengguna': {
    ringkasan: 'Direktori pengguna dan penautan akun siswa tersedia. Persetujuan, pembuatan akun, dan pengubahan peran tidak dilakukan oleh halaman panduan ini.',
    langkah: ['Buka direktori atau penautan akun siswa', 'Tinjau data yang tersedia untuk tenant', 'Ikuti izin server pada modul tujuan'],
  },
  'admin-monitoring': {
    ringkasan: 'Aktivitas Terbaru menyajikan peristiwa dari modul yang tercatat; Monitoring Ujian dan Chat menampilkan ringkasan berbatas tenant. Isi percakapan dan data siswa individual tidak ditampilkan.',
    langkah: ['Buka Aktivitas Terbaru untuk linimasa 30 hari dari sumber terpilih', 'Buka Monitoring Ujian atau Chat untuk ringkasan terkait', 'Jangan gunakan ringkasan ini sebagai audit log lengkap atau alat moderasi'],
  },
  'admin-instansi': {
    ringkasan: 'Profil sekolah dan data tahun ajaran tersedia melalui Data Dasar. Pengelolaan semester, unit, dan jenjang khusus admin belum menjadi modul tersendiri.',
    langkah: ['Buka Profil Sekolah atau Tahun Ajaran', 'Tinjau data yang tersedia', 'Gunakan akses dan penyimpanan yang disediakan modul tujuan'],
  },
  'admin-chat': {
    ringkasan: 'Percakapan, kontak, dan grup membuka modul Chat. Kanal pengumuman, broadcast, dan monitoring komunikasi admin belum tersedia.',
    langkah: ['Buka percakapan, kontak, atau grup', 'Gunakan fitur yang benar-benar tersedia di Chat', 'Jaga privasi percakapan pengguna'],
  },
  'admin-akademik': {
    ringkasan: 'Data Dasar menyediakan beberapa halaman kelas, jadwal, dan denah. Kelompok serta pengelolaan mata pelajaran khusus admin belum tersedia sebagai modul tersendiri.',
    langkah: ['Buka halaman kelas atau jadwal yang tersedia', 'Tinjau data dan batas penyimpanannya', 'Gunakan Ruang Kelas untuk aktivitas belajar'],
  },
  'admin-perencanaan': {
    ringkasan: 'Paket perencanaan dan arsip dokumen dapat dibuka. Monitoring serta persetujuan perangkat admin belum tersedia pada halaman ini.',
    langkah: ['Buka paket perencanaan atau arsip', 'Tinjau dokumen sesuai akses yang diberikan', 'Halaman panduan ini tidak menyimpan persetujuan'],
  },
  'admin-asesmen': {
    ringkasan: 'Admin sekolah dapat meninjau daftar ujian, jadwal, jumlah soal, peserta tertaut, jawaban terkumpul, dan antrean penilaian uraian dalam tenant. Penyusunan ujian serta penilaian uraian tetap dilakukan guru.',
    langkah: ['Buka Paket, Jadwal, Monitoring, atau Analisis Ujian', 'Tinjau hanya ringkasan tenant tanpa data jawaban individual', 'Gunakan Bank Soal untuk tinjauan; pengubahan soal tetap sesuai hak guru'],
  },
  'admin-komunikasi': {
    ringkasan: 'Kanal Pengumuman menyimpan informasi resmi sekolah untuk dibaca pengguna yang berhak. Broadcast otomatis dan monitoring agregat belum tersedia.',
    langkah: ['Buat pengumuman untuk tenant sekolah aktif', 'Tinjau dan perbarui informasi yang diterbitkan', 'Gunakan Chat untuk komunikasi individual'],
  },
  'admin-konten': {
    ringkasan: 'Ringkasan jumlah materi dan pengumuman tenant serta katalog baca-saja judul materi Ruang Kelas tersedia. Arsip perencanaan terenkripsi dan perpustakaan digital admin belum tersedia.',
    langkah: ['Tinjau hitungan melalui Ringkasan Materi Sekolah', 'Gunakan katalog untuk membuka kelas dan meninjau materi sumber', 'Ringkasan tidak menyatakan materi telah ditinjau atau dipublikasikan'],
  },
  'admin-keuangan': {
    ringkasan: 'Laporan transaksi dan pencatatan keuangan sekolah belum tersedia. Harga Paket hanya katalog informasi dan bukan modul keuangan sekolah.',
    langkah: ['Jangan gunakan halaman ini sebagai catatan transaksi', 'Gunakan prosedur keuangan resmi sekolah', 'Tunggu modul laporan keuangan dengan sumber data yang tervalidasi'],
  },
  'admin-laporan': {
    ringkasan: 'Rapor sekolah dan ringkasan aktivitas agregat Ruang Kelas tersedia. Laporan analitik akademik, keuangan, kinerja, serta ekspor admin lainnya belum tersedia.',
    langkah: ['Gunakan Rapor Sekolah untuk alur rapor', 'Tinjau ringkasan aktivitas hanya sebagai hitungan sumber yang tercatat', 'Menu laporan lainnya masih berupa panduan'],
  },
  'admin-pengaturan': {
    ringkasan: 'Konfigurasi integrasi tingkat sekolah, API, cadangan, dan log admin belum tersedia. Pengaturan akun pribadi tidak mengelola layanan sekolah.',
    langkah: ['Jangan masukkan rahasia layanan sekolah pada pengaturan pribadi', 'Kelola kredensial hanya melalui prosedur tepercaya yang disetujui', 'Tunggu modul admin sekolah yang memiliki audit dan cakupan tenant'],
  },
  'admin-bantuan': {
    ringkasan: 'Chat tersedia sebagai kanal aplikasi. Panduan admin, FAQ, dan kontak dukungan khusus belum terhubung ke layanan bantuan.',
    langkah: ['Buka Chat bila perlu berkomunikasi', 'Jangan menganggap panduan menu ini sebagai kanal support', 'Hindari membagikan kredensial melalui chat'],
  },
  'platform-dashboard': {
    ringkasan: 'Pantau kesehatan layanan dan penggunaan lintas tenant tanpa mencampur ruang lingkup data sekolah.',
    langkah: ['Pilih ringkasan platform', 'Tinjau kesehatan dan aktivitas global', 'Tindak lanjuti anomali sesuai kewenangan'],
  },
  'platform-tenant': {
    ringkasan: 'Tinjau sekolah sebagai tenant dan status operasionalnya pada tingkat platform.',
    langkah: ['Pilih tenant', 'Tinjau paket dan status layanan', 'Perbarui konfigurasi melalui proses berizin'],
  },
  'platform-fitur': {
    ringkasan: 'Atur ketersediaan fitur dan izin peran secara terukur, termasuk pengaktifan fitur bertahap per tenant.',
    langkah: ['Pilih fitur atau tenant', 'Tinjau dampak terhadap peran', 'Uji perubahan sebelum diterapkan'],
  },
  'platform-pengguna': {
    ringkasan: 'Kelola akun administrator sekolah dan peran global tanpa memperluas akses ke data tenant yang tidak terkait.',
    langkah: ['Pilih akun atau peran', 'Verifikasi identitas dan kebutuhan akses', 'Catat perubahan melalui audit'],
  },
  'platform-konten': {
    ringkasan: 'Kelola templat dan bahan pembelajaran global yang dapat digunakan lintas tenant.',
    langkah: ['Pilih konten atau templat', 'Tinjau versi dan akses', 'Publikasikan melalui alur yang disetujui'],
  },
  'platform-ai': {
    ringkasan: 'Kelola konfigurasi AI dan pemakaian dari sisi server. Rahasia API tidak ditampilkan atau disimpan di klien.',
    langkah: ['Pilih konfigurasi atau metrik AI', 'Tinjau pemakaian dan batas biaya', 'Ubah rahasia hanya melalui layanan tepercaya'],
  },
  'platform-keamanan': {
    ringkasan: 'Tinjau kontrol keamanan platform, audit, dan App Check untuk memastikan akses tetap terjaga.',
    langkah: ['Pilih kontrol atau rentang waktu', 'Tinjau temuan dan jejak audit', 'Terapkan tindak lanjut yang telah disetujui'],
  },
  'platform-laporan': {
    ringkasan: 'Pantau penggunaan, performa, dan biaya secara agregat untuk menjaga keberlangsungan layanan platform.',
    langkah: ['Pilih metrik dan rentang waktu', 'Tinjau tren lintas tenant', 'Tindak lanjuti anomali atau biaya'],
  },
  'platform-pengaturan': {
    ringkasan: 'Kelola konfigurasi, integrasi, pencadangan, dan mode pemeliharaan pada tingkat platform.',
    langkah: ['Tinjau konfigurasi aktif', 'Pastikan dampak lintas tenant', 'Jadwalkan perubahan dan pemulihan'],
  },
  pelaksanaan: {
    ringkasan: 'Catat kegiatan belajar, hubungkan dengan rencana, lalu tinjau pelaksanaannya.',
    langkah: ['Pilih kelas dan tanggal', 'Catat kegiatan atau kehadiran', 'Tinjau keterlaksanaan'],
  },
  asesmen: {
    ringkasan: 'Bank Soal, Ujian Online, analisis hasil kelas, remedial/pengayaan berbasis hasil, dan rapor terhubung ke modul. Asesmen diagnostik, formatif, sumatif, serta rubrik khusus masih berupa panduan.',
    langkah: ['Buka Bank Soal atau Ujian Online untuk menyusun dan melaksanakan CBT', 'Tinjau hasil tugas/kuis pada Analisis atau Remedial', 'Jangan anggap halaman panduan diagnostik, formatif, sumatif, atau rubrik sebagai instrumen tersimpan'],
  },
  pemantauan: {
    ringkasan: 'Tinjau aktivitas kelas dari jurnal mengajar dan sesi presensi yang tersimpan. Profil siswa, catatan kasus, dan intervensi individual bukan bagian dari ringkasan ini.',
    langkah: ['Pilih kelas yang memang Anda ampu', 'Tinjau laporan aktivitas pada rentang tanggal', 'Gunakan modul presensi atau Ruang Kelas untuk alur sumber terkait'],
  },
  refleksi: {
    ringkasan: 'Gunakan bukti pembelajaran untuk merefleksikan praktik dan merencanakan pengembangan.',
    langkah: ['Pilih kegiatan yang ditinjau', 'Catat bukti dan refleksi', 'Susun rencana pengembangan'],
  },
  laporan: {
    ringkasan: 'Pilih periode dan sumber data sebelum menyiapkan laporan atau arsip pembelajaran.',
    langkah: ['Pilih periode pelaporan', 'Tinjau sumber data yang tersedia', 'Siapkan keluaran yang dibutuhkan'],
  },
  kolaborasi: {
    ringkasan: 'Koordinasikan pekerjaan bersama dengan konteks, anggota, dan akses yang tepat.',
    langkah: ['Tentukan tujuan kolaborasi', 'Pilih anggota dan materi', 'Bagikan melalui kanal yang sesuai'],
  },
  pengaturan: {
    ringkasan: 'Kelola preferensi dan integrasi akun. Perubahan keamanan tetap dilakukan melalui layanan akun.',
    langkah: ['Tinjau pengaturan saat ini', 'Pastikan dampak perubahan', 'Kelola kredensial di layanan tepercaya'],
  },
  'siswa-dashboard': {
    ringkasan: 'Temukan kegiatan belajar dan pintasan ke ruang belajar yang tersedia untuk akun siswa.',
    langkah: ['Buka jadwal atau materi belajar', 'Tinjau tugas dan ujian yang diberikan', 'Hubungi guru melalui kanal komunikasi resmi'],
  },
  'siswa-belajar': {
    ringkasan: 'Ruang belajar siswa menampilkan pintasan ke kegiatan, materi, ujian, dan nilai sesuai akun.',
    langkah: ['Pilih kegiatan belajar', 'Tinjau informasi dari guru', 'Hubungi guru jika ada data yang belum tersedia'],
  },
  'siswa-chat': {
    ringkasan: 'Gunakan komunikasi untuk menghubungi guru atau bergabung ke percakapan yang telah diizinkan.',
    langkah: ['Pilih percakapan atau kontak', 'Pastikan percakapan sesuai kebutuhan belajar', 'Jangan membagikan informasi pribadi'],
  },
  'ortu-dashboard': {
    ringkasan: 'Temukan informasi perkembangan anak dan pintasan ke komunikasi dengan sekolah.',
    langkah: ['Pilih anak yang telah ditautkan', 'Tinjau informasi yang tersedia', 'Hubungi sekolah untuk koreksi data'],
  },
  'ortu-anak': {
    ringkasan: 'Tinjau ringkasan perkembangan anak yang telah ditautkan secara resmi ke akun orang tua.',
    langkah: ['Pastikan sekolah telah menautkan akun wali dan siswa secara resmi', 'Gunakan Pengumuman Sekolah atau Chat untuk menghubungi sekolah', 'Tinjau perkembangan anak setelah hubungan akun diverifikasi'],
  },
  'ortu-komunikasi': {
    ringkasan: 'Gunakan kanal komunikasi sekolah untuk berkoordinasi mengenai perkembangan anak.',
    langkah: ['Pilih percakapan atau kontak', 'Sampaikan kebutuhan secara ringkas', 'Jaga kerahasiaan informasi anak'],
  },
  perencanaan: {
    ringkasan: 'Susun perangkat ajar menggunakan paket perencanaan, lalu tinjau dokumen tersimpan melalui arsip akun Anda. Modul Ajar tersedia sebagai jenis dokumen; pembuat cover terpisah belum tersedia.',
    langkah: ['Pilih jenis dokumen dan periode pada Perencanaan', 'Simpan hasil ke paket yang dituju', 'Buka Hasil Perencanaan untuk menemukan dokumen yang tersimpan'],
  },
};

const MODUL_ADMIN_AKTIF = {
  'admin-dashboard': [
    { label: 'Dashboard Sekolah', path: '/dashboard', ikon: 'chart' },
  ],
  'admin-ruang-kelas': [
    { label: 'Ruang Kelas', path: '/ruang-kelas', ikon: 'book' },
  ],
  'admin-monitoring': [
    { label: 'Aktivitas Terbaru', path: '/admin/aktivitas', ikon: 'file' },
    { label: 'Ruang Kelas', path: '/ruang-kelas', ikon: 'book' },
    { label: 'Bank Soal', path: '/asesmen/bank-soal', ikon: 'file' },
    { label: 'Monitoring Ujian', path: '/admin/asesmen/monitoring', ikon: 'check' },
    { label: 'Monitoring Chat', path: '/admin/dashboard/chat', ikon: 'chat' },
  ],
  'admin-instansi': [
    { label: 'Profil Sekolah', path: '/datadasar/profil', ikon: 'user' },
    { label: 'Tahun Ajaran', path: '/datadasar/ta', ikon: 'calendar' },
  ],
  'admin-chat': [
    { label: 'Percakapan', path: '/chat', ikon: 'chat' },
    { label: 'Kontak', path: '/chat/kontak', ikon: 'users' },
    { label: 'Grup', path: '/chat/grup', ikon: 'users' },
  ],
  'admin-pengguna': [
    { label: 'Direktori Pengguna', path: '/admin/pengguna/guru', ikon: 'users' },
    { label: 'Tautkan Akun Siswa', path: '/admin/pengguna/tautkan-siswa', ikon: 'users' },
  ],
  'admin-akademik': [
    { label: 'Kelas dan Mapel', path: '/datadasar/kelas', ikon: 'book' },
    { label: 'Jadwal Mengajar', path: '/datadasar/jadwal', ikon: 'calendar' },
    { label: 'Ruang Kelas', path: '/ruang-kelas', ikon: 'book' },
  ],
  'admin-perencanaan': [
    { label: 'Paket Perencanaan', path: '/admin/perencanaan/paket', ikon: 'file' },
    { label: 'Arsip Perencanaan', path: '/laporan/arsip-perencanaan', ikon: 'file' },
  ],
  'admin-asesmen': [
    { label: 'Bank Soal', path: '/asesmen/bank-soal', ikon: 'file' },
  ],
  'admin-konten': [
    { label: 'Ringkasan Materi Sekolah', path: '/admin/konten/ringkasan', ikon: 'chart' },
    { label: 'Katalog Materi Ruang Kelas', path: '/admin/konten/materi', ikon: 'book' },
    { label: 'Arsip Perencanaan', path: '/laporan/arsip-perencanaan', ikon: 'file' },
    { label: 'Materi Ruang Kelas', path: '/ruang-kelas', ikon: 'book' },
  ],
  'admin-komunikasi': [
    { label: 'Kanal Pengumuman', path: '/pengumuman', ikon: 'file' },
    { label: 'Chat Sekolah', path: '/chat', ikon: 'chat' },
    { label: 'Testimoni', path: '/testimoni', ikon: 'chat' },
  ],
  'admin-laporan': [
    { label: 'Ringkasan Aktivitas Kelas', path: '/admin/laporan/aktivitas', ikon: 'chart' },
    { label: 'Rapor Sekolah', path: '/admin/akademik/rapor', ikon: 'file' },
  ],
  'admin-bantuan': [
    { label: 'Chat Sekolah', path: '/chat', ikon: 'chat' },
  ],
};

const MODUL_GURU_AKTIF = {
  perencanaan: [
    { label: 'Perencanaan Pembelajaran', path: '/perencanaan', ikon: 'file' },
    { label: 'Hasil Perencanaan', path: '/laporan/arsip-perencanaan', ikon: 'file' },
    { label: 'Paket Modul Ajar', path: '/perencanaan?jenis=modul', ikon: 'book' },
  ],
  chat: [
    { label: 'Percakapan', path: '/chat', ikon: 'chat' },
    { label: 'Grup Chat', path: '/chat/grup', ikon: 'users' },
  ],
  pelaksanaan: [
    { label: 'Jurnal Mengajar Harian', path: '/pelaksanaan/jurnal', ikon: 'file' },
    { label: 'Presensi Siswa', path: '/pelaksanaan/presensi', ikon: 'check' },
    { label: 'Program BK & Kegiatan', path: '/program-kegiatan', ikon: 'file' },
    { label: 'Laporan Harian s.d. Bulanan', path: '/laporan/harian-bulanan', ikon: 'file' },
  ],
  asesmen: [
    { label: 'Remedial & Pengayaan', path: '/asesmen/remedial', ikon: 'refresh' },
    { label: 'Bank Soal', path: '/asesmen/bank-soal', ikon: 'book' },
    { label: 'Ujian Online', path: '/asesmen/ujian-online', ikon: 'check' },
  ],
  pemantauan: [
    { label: 'Laporan Aktivitas Kelas', path: '/laporan/harian-bulanan', ikon: 'file' },
    { label: 'Presensi Siswa', path: '/pelaksanaan/presensi', ikon: 'check' },
    { label: 'Ruang Kelas', path: '/ruang-kelas', ikon: 'book' },
    { label: 'Analisis Hasil', path: '/asesmen/analisis', ikon: 'chart' },
    { label: 'Program BK & Kegiatan', path: '/program-kegiatan', ikon: 'file', actionLabel: 'Buka rancangan' },
    { label: 'Percakapan', path: '/chat', ikon: 'chat' },
  ],
  laporan: [],
  kolaborasi: [
    { label: 'Percakapan', path: '/chat', ikon: 'chat' },
    { label: 'Grup Chat', path: '/chat/grup', ikon: 'users' },
  ],
};

const MODUL_ORTU_AKTIF = [
  { label: 'Pengumuman Sekolah', path: '/pengumuman', ikon: 'file' },
  { label: 'Percakapan dengan Sekolah', path: '/chat', ikon: 'chat' },
  { label: 'Kontak Sekolah', path: '/chat/kontak', ikon: 'users' },
];

const PANDUAN_GURU = {
  '/pelaksanaan/realisasi': {
    ringkasan: 'Aplikasi belum mencocokkan dokumen perencanaan dengan bukti pelaksanaan secara otomatis. Jurnal mengajar adalah catatan kegiatan kelas yang tersedia untuk ditinjau.',
    langkah: ['Buka dokumen perencanaan milik akun Anda', 'Tinjau jurnal mengajar pada kelas yang Anda ampu', 'Bandingkan secara manual; halaman ini tidak menyimpan validasi realisasi'],
    status: 'Pelacakan rencana-ke-realisasi belum tersedia. Jurnal dan dokumen perencanaan tetap menjadi sumber terpisah.',
    actions: [
      { label: 'Jurnal Mengajar Harian', path: '/pelaksanaan/jurnal', ikon: 'file' },
      { label: 'Laporan Aktivitas Kelas', path: '/laporan/harian-bulanan', ikon: 'chart' },
      { label: 'Perencanaan Pembelajaran', path: '/perencanaan', ikon: 'book' },
    ],
  },
  '/pelaksanaan/berdiferensiasi': {
    ringkasan: 'Belum ada alur khusus untuk merancang dan melacak pembelajaran berdiferensiasi. Perencanaan umum dan jurnal kelas tersedia sebagai sumber terpisah.',
    langkah: ['Susun perangkat ajar pada Perencanaan', 'Catat kegiatan kelas pada Jurnal Mengajar', 'Jangan mencatat profil atau kebutuhan sensitif siswa pada panduan ini'],
    status: 'Modul diferensiasi dan pemantauan kebutuhan individual belum tersedia.',
    actions: [
      { label: 'Perencanaan Pembelajaran', path: '/perencanaan', ikon: 'book' },
      { label: 'Jurnal Mengajar Harian', path: '/pelaksanaan/jurnal', ikon: 'file' },
    ],
  },
  '/pelaksanaan/kelas-khusus': {
    ringkasan: 'Modul untuk kelas atau program khusus belum tersedia. Program BK & Kegiatan dapat menyimpan rancangan lokal, sedangkan kegiatan kelas tercatat melalui jurnal.',
    langkah: ['Gunakan rancangan lokal hanya untuk perencanaan non-sensitif', 'Catat kegiatan yang benar-benar berlangsung pada Jurnal Mengajar', 'Ikuti persetujuan serta prosedur sekolah untuk program resmi'],
    status: 'Rancangan lokal tidak membuktikan persetujuan, penugasan, atau arsip program sekolah.',
    actions: [
      { label: 'Program BK & Kegiatan', path: '/program-kegiatan', ikon: 'file', actionLabel: 'Buka rancangan lokal' },
      { label: 'Jurnal Mengajar Harian', path: '/pelaksanaan/jurnal', ikon: 'file' },
    ],
  },
  '/pelaksanaan/catatan-cepat': {
    ringkasan: 'Formulir catatan kelas cepat belum tersedia. Gunakan Jurnal Mengajar untuk pencatatan kegiatan resmi yang tersedia; catatan kerja pribadi bukan penggantinya.',
    langkah: ['Buka Jurnal Mengajar pada kelas yang Anda ampu', 'Simpan informasi yang relevan melalui formulir jurnal', 'Hindari menaruh data siswa pada catatan pribadi'],
    status: 'Menu catatan cepat belum menjadi modul. Jurnal Mengajar adalah sumber pencatatan kelas yang tersedia.',
    actions: [{ label: 'Jurnal Mengajar Harian', path: '/pelaksanaan/jurnal', ikon: 'file' }],
  },
  '/asesmen/diagnostik': {
    ringkasan: 'Alur diagnostik khusus dan penyimpanan hasilnya belum tersedia. Bank Soal dan Ujian Online membantu menyiapkan soal serta pelaksanaan asesmen umum.',
    langkah: ['Siapkan soal pada Bank Soal', 'Gunakan Ujian Online bila sesuai tujuan dan kebijakan sekolah', 'Tinjau hasil hanya pada modul sumber; jangan anggap halaman ini sebagai profil diagnostik siswa'],
    status: 'Klasifikasi, instrumen, dan tindak lanjut diagnostik khusus belum tersedia.',
    actions: [
      { label: 'Bank Soal', path: '/asesmen/bank-soal', ikon: 'book' },
      { label: 'Ujian Online', path: '/asesmen/ujian-online', ikon: 'check' },
    ],
  },
  '/asesmen/formatif': {
    ringkasan: 'Alur asesmen formatif khusus belum tersedia. Soal dapat dikelola di Bank Soal dan tugas atau kuis kelas dapat ditinjau pada modul Ruang Kelas.',
    langkah: ['Gunakan Bank Soal untuk mengelola butir yang tersedia', 'Buka Ujian Online atau Ruang Kelas sesuai jenis aktivitas', 'Gunakan Analisis Hasil hanya untuk data tugas dan kuis yang tercatat'],
    status: 'Pelacakan siklus formatif dan umpan balik khusus belum tersedia.',
    actions: [
      { label: 'Bank Soal', path: '/asesmen/bank-soal', ikon: 'book' },
      { label: 'Ujian Online', path: '/asesmen/ujian-online', ikon: 'check' },
      { label: 'Analisis Hasil', path: '/asesmen/analisis', ikon: 'chart' },
    ],
  },
  '/asesmen/sumatif': {
    ringkasan: 'Alur sumatif khusus dan rekap lintas sumber belum tersedia. Ujian Online dan analisis nilai hanya mencakup data yang tersimpan pada modul masing-masing.',
    langkah: ['Buat asesmen pada modul yang sesuai', 'Pastikan kriteria dan jadwal mengikuti ketentuan sekolah', 'Gunakan Rapor resmi untuk alur rapor; jangan menyamakan laporan kelas dengan rapor'],
    status: 'Rekap sumatif lintas asesmen dan pengesahan hasil belum tersedia pada menu ini.',
    actions: [
      { label: 'Ujian Online', path: '/asesmen/ujian-online', ikon: 'check' },
      { label: 'Analisis Hasil', path: '/asesmen/analisis', ikon: 'chart' },
      { label: 'Nilai & Capaian Rapor', path: '/asesmen/rapor', ikon: 'file' },
    ],
  },
  '/asesmen/rubrik': {
    ringkasan: 'Pustaka rubrik dan instrumen penilaian yang terversi belum tersedia. Bank Soal dan Ujian Online tidak menggantikan pengelolaan rubrik.',
    langkah: ['Gunakan instrumen yang telah disetujui sekolah', 'Kelola butir soal melalui Bank Soal bila relevan', 'Jangan menganggap nilai otomatis sebagai penilaian berbasis rubrik'],
    status: 'Editor, katalog, dan arsip rubrik belum tersedia.',
    actions: [{ label: 'Bank Soal', path: '/asesmen/bank-soal', ikon: 'book' }],
  },
  '/pemantauan/profil-siswa': {
    ringkasan: 'Belum ada profil siswa satu halaman. Pemantauan yang tersedia terbatas pada aktivitas kelas, jurnal, dan presensi; catatan kasus atau intervensi individual tidak ditampilkan.',
    langkah: ['Pilih kelas yang memang Anda ampu', 'Tinjau jurnal, laporan aktivitas, atau presensi pada modul sumber', 'Jangan menyimpan diagnosis atau detail kasus siswa pada panduan ini'],
    status: 'Profil individual, catatan kasus, dan intervensi siswa belum tersedia. Modul kelas hanya menampilkan data sesuai penugasan dan izin yang berlaku.',
    actions: [
      { label: 'Laporan Aktivitas Kelas', path: '/laporan/harian-bulanan', ikon: 'file' },
      { label: 'Presensi Siswa', path: '/pelaksanaan/presensi', ikon: 'check' },
    ],
  },
  '/pemantauan/karakter': {
    ringkasan: 'Belum ada arsip perkembangan karakter per siswa. Guru dapat menyusun rancangan kegiatan non-sensitif; rancangan bukan bukti observasi, penilaian karakter, atau persetujuan sekolah.',
    langkah: ['Susun tema kegiatan pada Program BK & Kegiatan bila relevan', 'Simpan rancangan tanpa nama atau detail pribadi siswa', 'Gunakan prosedur sekolah untuk observasi dan dokumentasi resmi'],
    status: 'Rancangan kegiatan hanya tersimpan lokal di browser; rekam perkembangan siswa dan arsip resmi belum tersedia.',
    actions: [{
      label: 'Program BK & Kegiatan',
      path: '/program-kegiatan',
      ikon: 'file',
      actionLabel: 'Buka rancangan lokal',
    }],
  },
  '/pemantauan/pendampingan': {
    ringkasan: 'Belum ada modul tindak lanjut atau catatan pendampingan individual. Hindari menyimpan informasi konseling, diagnosis, atau kasus siswa pada halaman panduan.',
    langkah: ['Gunakan prosedur pendampingan resmi sekolah', 'Untuk koordinasi umum, gunakan kanal komunikasi yang telah diizinkan', 'Jangan anggap jurnal kelas atau analisis hasil sebagai catatan konseling'],
    status: 'Pencatatan kasus individual tidak tersedia. Chat hanya menyediakan percakapan sesuai akses dan bukan arsip pendampingan.',
  },
  '/pemantauan/komunikasi': {
    ringkasan: 'Belum ada modul khusus komunikasi guru-orang tua yang memverifikasi relasi wali–siswa. Chat tersedia sesuai hak akses, tetapi tidak membuka data akademik anak.',
    langkah: ['Pastikan penerima dan tujuan komunikasi sesuai prosedur sekolah', 'Gunakan Chat hanya untuk percakapan yang diizinkan', 'Jangan membagikan nilai, presensi, atau informasi sensitif jika relasi belum diverifikasi'],
    status: 'Chat tersedia sebagai kanal umum; relasi wali–siswa dan akses akademik tetap harus diverifikasi oleh sekolah.',
    actions: [{ label: 'Percakapan', path: '/chat', ikon: 'chat' }],
  },
  '/kolaborasi/grup-chat': {
    ringkasan: 'Tautan ini membuka grup Chat yang diizinkan. Grup menyediakan percakapan, bukan ruang kerja dokumen atau repositori kolaborasi.',
    langkah: ['Buka grup Chat yang tersedia untuk akun Anda', 'Pastikan isi pesan sesuai tujuan dan izin peserta', 'Jangan membagikan data pribadi siswa tanpa dasar dan izin yang sesuai'],
    status: 'Grup Chat tersedia; penyimpanan berkas, penugasan, dan arsip praktik bersama belum tersedia.',
    actions: [{ label: 'Grup Chat', path: '/chat/grup', ikon: 'users' }],
  },
  '/refleksi/supervisi': {
    ringkasan: 'Belum ada penjadwalan, instrumen, persetujuan, atau arsip supervisi dan observasi pada aplikasi.',
    langkah: ['Koordinasikan supervisi melalui prosedur sekolah', 'Jangan masukkan hasil observasi ke catatan pribadi seolah-olah arsip resmi', 'Gunakan jurnal kelas hanya sebagai sumber kegiatan bila diperlukan'],
    status: 'Modul supervisi dan arsip observasi belum tersedia.',
    actions: [{ label: 'Jurnal Mengajar Harian', path: '/pelaksanaan/jurnal', ikon: 'file' }],
  },
  '/refleksi/portofolio': {
    ringkasan: 'Portofolio profesional guru belum tersedia. Arsip Perencanaan hanya menampilkan dokumen perencanaan milik akun, bukan portofolio kompetensi atau bukti kinerja.',
    langkah: ['Buka arsip untuk meninjau dokumen perencanaan yang tersimpan', 'Ikuti ketentuan sekolah untuk portofolio resmi', 'Jangan menyamakan arsip perencanaan dengan evaluasi kinerja'],
    status: 'Modul portofolio guru belum tersedia; arsip yang ada hanya untuk dokumen perencanaan.',
    actions: [{ label: 'Arsip Perencanaan', path: '/laporan/arsip-perencanaan', ikon: 'file' }],
  },
  '/refleksi/kompetensi': {
    ringkasan: 'Aplikasi belum memiliki profil kompetensi, riwayat pelatihan, atau rekam pengembangan profesional guru.',
    langkah: ['Gunakan sistem atau dokumen resmi yang ditetapkan sekolah', 'Jangan menganggap catatan pribadi sebagai rekam kompetensi', 'Kembali ke menu ini setelah sumber data dan kebijakan disepakati'],
    status: 'Modul kompetensi dan pengembangan profesional belum tersedia.',
  },
  '/laporan/ketercapaian': {
    ringkasan: 'Laporan ketercapaian kurikulum yang resmi belum tersedia. Analisis tugas dan kuis hanya menunjukkan hasil asesmen Ruang Kelas, bukan ketercapaian CP/TP menyeluruh.',
    langkah: ['Gunakan Analisis Hasil hanya untuk tugas dan kuis Ruang Kelas', 'Tinjau capaian kurikulum pada sumber resmi sekolah', 'Jangan menyimpulkan capaian seluruh mapel dari data terbatas'],
    status: 'Laporan ketercapaian kurikulum lintas sumber belum tersedia.',
    actions: [{ label: 'Analisis Tugas dan Kuis Ruang Kelas', path: '/asesmen/analisis', ikon: 'chart' }],
  },
  '/laporan/kinerja-guru': {
    ringkasan: 'Laporan kinerja atau penilaian guru belum tersedia. Jurnal dan arsip perencanaan bukan evaluasi kinerja maupun bukti supervisi.',
    langkah: ['Tinjau jurnal dan perencanaan hanya sebagai dokumen sumber milik Anda', 'Ikuti mekanisme penilaian resmi sekolah', 'Jangan gunakan hitungan aktivitas sebagai penilaian kinerja'],
    status: 'Modul kinerja guru dan evaluasi resmi belum tersedia.',
    actions: [
      { label: 'Laporan Aktivitas Kelas', path: '/laporan/harian-bulanan', ikon: 'file' },
      { label: 'Arsip Perencanaan', path: '/laporan/arsip-perencanaan', ikon: 'file' },
    ],
  },
  '/laporan/ekspor-cetak': {
    ringkasan: 'Pusat ekspor dan pencetakan terpadu belum tersedia. Beberapa laporan sumber menyediakan ekspor CSV untuk data terbatas; aplikasi tidak menyimpan riwayat cetak.',
    langkah: ['Buka laporan sumber yang diperlukan', 'Periksa filter dan cakupan data sebelum ekspor', 'Simpan berkas sesuai kebijakan perlindungan data sekolah'],
    status: 'Ekspor hanya tersedia pada beberapa laporan sumber; tidak ada arsip ekspor atau riwayat cetak terpadu.',
    actions: [
      { label: 'Laporan Aktivitas Kelas · CSV', path: '/laporan/harian-bulanan', ikon: 'file' },
      { label: 'Laporan Penilaian · CSV', path: '/laporan/penilaian', ikon: 'file' },
    ],
  },
  '/laporan/dokumen': {
    ringkasan: 'Pustaka dokumen baca-saja lintas modul belum tersedia. Arsip Perencanaan hanya memuat dokumen perencanaan akun yang tersimpan.',
    langkah: ['Gunakan Arsip Perencanaan untuk dokumen milik akun', 'Dokumen kelas lain tetap mengikuti hak akses sumbernya', 'Tidak ada indeks dokumen sekolah lintas modul pada halaman ini'],
    status: 'Pustaka dokumen terpadu belum tersedia.',
    actions: [{ label: 'Arsip Perencanaan', path: '/laporan/arsip-perencanaan', ikon: 'file' }],
  },
  '/laporan/riwayat-cetak': {
    ringkasan: 'Aplikasi belum mencatat pekerjaan cetak atau riwayat unduhan. CSV dapat dibuat ulang dari laporan sumber yang masih tersedia.',
    langkah: ['Buka laporan aktivitas atau penilaian untuk membuat ekspor baru', 'Simpan berkas pada lokasi yang dikelola sesuai kebijakan sekolah', 'Jangan mengandalkan halaman ini sebagai arsip audit cetak'],
    status: 'Riwayat cetak dan audit unduhan belum tersedia.',
    actions: [
      { label: 'Laporan Aktivitas Kelas', path: '/laporan/harian-bulanan', ikon: 'file' },
      { label: 'Laporan Penilaian', path: '/laporan/penilaian', ikon: 'file' },
    ],
  },
  '/kolaborasi/ruang-kerja': {
    ringkasan: 'Ruang kerja tim atau MGMP dengan berkas bersama, penugasan, dan kontrol versi belum tersedia. Chat grup hanya menyediakan percakapan sesuai izin.',
    langkah: ['Gunakan grup Chat untuk koordinasi yang diizinkan', 'Jangan mengirim data siswa melalui grup tanpa dasar dan izin yang sesuai', 'Berkas bersama dan pengelolaan MGMP belum disediakan'],
    status: 'Modul ruang kerja tim dan MGMP belum tersedia.',
    actions: [{ label: 'Grup Chat', path: '/chat/grup', ikon: 'users' }],
  },
  '/kolaborasi/praktik-baik': {
    ringkasan: 'Repositori berbagi praktik baik, kurasi, dan persetujuan publikasi belum tersedia.',
    langkah: ['Gunakan kanal kolaborasi resmi sekolah bila tersedia', 'Pastikan materi yang dibagikan tidak memuat data pribadi siswa', 'Aplikasi belum mengarsipkan praktik baik pada menu ini'],
    status: 'Repositori praktik baik belum tersedia.',
    actions: [{ label: 'Grup Chat', path: '/chat/grup', ikon: 'users' }],
  },
  '/kolaborasi/kepala-sekolah': {
    ringkasan: 'Berbagi akses kepala sekolah secara khusus belum dikonfigurasi sebagai alur persetujuan atau tinjauan dokumen.',
    langkah: ['Gunakan mekanisme akses sekolah yang telah ditetapkan', 'Jangan membagikan kata sandi atau tautan privat', 'Akses baca dan jejak audit perlu ditetapkan oleh pengelola sekolah'],
    status: 'Modul tinjauan dan pembagian akses kepala sekolah belum tersedia.',
  },
  '/kolaborasi/guru-pengganti': {
    ringkasan: 'Penugasan guru pengganti, delegasi kelas, dan pencabutan akses sementara belum tersedia.',
    langkah: ['Koordinasikan pengganti melalui prosedur sekolah', 'Jangan berbagi akun atau kredensial', 'Akses pengganti harus ditetapkan melalui alur admin yang terverifikasi'],
    status: 'Modul guru pengganti dan delegasi akses belum tersedia.',
  },
  '/pengaturan/peran': {
    ringkasan: 'Guru tidak dapat mengubah peran atau hak akses melalui menu ini. Peran dan akses sekolah dikelola melalui proses berizin oleh administrator.',
    langkah: ['Hubungi admin sekolah jika peran akun tidak sesuai', 'Jangan mencoba memakai akun atau hak pengguna lain', 'Katalog menu tidak menggantikan izin backend dan RLS'],
    status: 'Pengubahan peran tidak tersedia bagi guru.',
  },
  '/pengaturan/preferensi': {
    ringkasan: 'Preferensi ukuran teks dan pengurangan gerakan tersimpan lokal pada browser, terpisah untuk akun serta peran aktif.',
    langkah: ['Pilih ukuran teks yang nyaman', 'Atur pengurangan animasi bila diperlukan', 'Simpan perubahan pada perangkat ini'],
    status: 'Preferensi tampilan lokal; tidak disinkronkan lintas perangkat.',
  },
  '/pengaturan/cadangan': {
    ringkasan: 'Cadangan dan pemulihan sistem tidak tersedia untuk dikelola guru. Sinkronisasi dokumen pribadi bukan backup database sekolah.',
    langkah: ['Jangan mengunggah cadangan database melalui menu ini', 'Gunakan hanya prosedur pemulihan resmi yang dikelola administrator', 'Pemulihan perlu diuji pada lingkungan nonproduksi'],
    status: 'Modul backup dan pemulihan guru tidak tersedia; backup platform harus diverifikasi terpisah.',
  },
  '/pengaturan/bantuan': {
    ringkasan: 'Pusat bantuan dan tiket dukungan resmi belum terhubung. Chat aplikasi bukan jaminan kanal support atau tanggap insiden.',
    langkah: ['Gunakan kontak dukungan resmi sekolah yang telah disediakan', 'Jangan kirim kata sandi, token, atau data anak melalui chat', 'Aplikasi belum menyimpan tiket dukungan untuk menu ini'],
    status: 'Pusat bantuan dan sistem tiket belum tersedia.',
  },
};

export default function SubMenuPage() {
  const { pathname, search } = useLocation();
  const { role: baseRole, activeRole } = useAuth();
  const role = activeRole || baseRole;
  const menu = cariMenu(pathname, search, role);

  if (!menu) {
    return (
      <section className="ale-kartu ale-submenu-tidak-ada" aria-labelledby="submenu-404">
        <Ikon nama="file" />
        <h2 id="submenu-404">Halaman tidak ditemukan</h2>
        <p>Tautan yang dibuka tidak cocok dengan menu yang tersedia.</p>
        <a className="ale-submenu-tombol" href="#/dashboard">Kembali ke Dashboard</a>
      </section>
    );
  }
  const { grup, item } = menu;
  if (isTeacherRole(role) && ['/refleksi/portofolio', '/refleksi/kompetensi'].includes(item.path)) {
    const isPortfolio = item.path === '/refleksi/portofolio';
    return (
      <section className="ale-submenu-page" aria-labelledby="teacher-private-record-heading">
        <header className="ale-submenu-hero">
          <div className="ale-submenu-hero-copy">
            <p className="ale-submenu-kicker"><Ikon nama={grup.ikon} />{grup.label}</p>
            <h2 id="teacher-private-record-heading">{item.label}</h2>
            <p>
              {isPortfolio
                ? 'Simpan daftar karya dan tautan yang ingin Anda tinjau kembali secara pribadi.'
                : 'Catat topik belajar, pelatihan, atau keterampilan yang ingin Anda kembangkan.'}
            </p>
          </div>
          <span className="ale-submenu-state"><span aria-hidden="true" />Ruang kerja pribadi</span>
        </header>
        <p className="ale-private-workspace-privacy">
          Catatan ini hanya untuk akun dan peran aktif Anda. Ini bukan portofolio resmi, arsip sekolah,
          bukti kompetensi, sertifikat, penilaian kinerja, atau dokumen supervisi. Jangan mencantumkan
          identitas maupun informasi sensitif siswa.
        </p>
        <PrivateWorkspaceRecords
          route={item.path}
          heading={isPortfolio ? 'Karya pribadi' : 'Rencana pengembangan pribadi'}
        />
      </section>
    );
  }

  if (isTeacherRole(role) && item.path === '/pengaturan/akun') return <TeacherAccountPage />;
  if (isTeacherRole(role) && item.path === '/guru/catatan-pribadi') {
    return <TeacherWorkspacePage grup={grup} item={item} />;
  }
  if (isTeacherRole(role) && item.path === '/pengaturan/notifikasi') {
    return <NotificationPreferencesPage />;
  }
  if (isTeacherRole(role) && item.path === '/pengaturan/preferensi') {
    return <TeacherPreferencesPage />;
  }
  if (isTeacherRole(role) && ['/refleksi/pembelajaran', '/refleksi/perbaikan'].includes(item.path)) {
    const isImprovementPlan = item.path === '/refleksi/perbaikan';
    return (
      <section className="ale-submenu-page" aria-labelledby="teacher-reflection-heading">
        <header className="ale-submenu-hero">
          <div className="ale-submenu-hero-copy">
            <p className="ale-submenu-kicker"><Ikon nama={grup.ikon} />{grup.label}</p>
            <h2 id="teacher-reflection-heading">{item.label}</h2>
            <p>
              {isImprovementPlan
                ? 'Susun pengingat dan langkah perbaikan untuk diri sendiri berdasarkan praktik mengajar.'
                : 'Catat refleksi pribadi atas proses pembelajaran dan hal yang ingin Anda tinjau kembali.'}
            </p>
          </div>
          <span className="ale-submenu-state"><span aria-hidden="true" />Ruang kerja pribadi</span>
        </header>
        <p className="ale-private-workspace-privacy">
          Catatan ini hanya untuk akun dan peran aktif Anda. Ini bukan arsip sekolah, penilaian kinerja,
          dokumen supervisi, atau bukti persetujuan. Jangan mencantumkan identitas maupun informasi
          sensitif siswa.
        </p>
        <PrivateWorkspaceRecords
          route={item.path}
          heading={isImprovementPlan ? 'Rencana perbaikan pribadi' : 'Refleksi pembelajaran pribadi'}
        />
      </section>
    );
  }
  const modulAktifAdmin = isSchoolAdminRole(role)
    ? MODUL_ADMIN_AKTIF[grup.id] || []
    : [];
  const modulAktifGuru = isTeacherRole(role) ? MODUL_GURU_AKTIF[grup.id] || [] : [];
  const modulAktifOrtu = ['ortu', 'orang_tua'].includes(role)
    ? MODUL_ORTU_AKTIF
    : [];

  const alur = ALUR[grup.id] || {
    ringkasan: 'Pilih aktivitas yang dibutuhkan dan lanjutkan ke modul terkait.',
    langkah: ['Pilih konteks kerja', 'Tinjau informasi yang tersedia', 'Lanjutkan ke aktivitas terkait'],
  };
  const isCoverGuide = isTeacherRole(role) && item.path === '/perangkat/cover';
  const teacherGuide = isTeacherRole(role)
    ? PANDUAN_GURU[item.path]
    : null;
  const ringkasan = teacherGuide?.ringkasan
    || (isSchoolAdminRole(role) && item.path === '/admin/dashboard/chat'
      ? 'Monitoring Chat menampilkan ringkasan agregat chat per tenant tanpa isi percakapan atau identitas peserta; ini bukan audit log lengkap atau alat moderasi.'
      : alur.ringkasan);
  const langkah = teacherGuide?.langkah
    || (isSchoolAdminRole(role) && item.path === '/admin/dashboard/chat'
    ? [
      'Tinjau jumlah percakapan baru 30 hari, pesan 7 hari, dan pengirim aktif.',
      'Angka hanya merangkum percakapan dengan peserta aktif dari tenant ini.',
      'Gunakan jalur perlindungan sekolah untuk tindak lanjut; halaman ini bukan alat moderasi.',
    ]
      : alur.langkah);
  const terkait = grup.item.filter((sub) => (
    sub !== item
    && sub.path
    && !(isTeacherRole(role) && grup.id === 'refleksi' && sub.path === '/guru/catatan-pribadi')
  ));
  const statusModul = role === 'siswa'
    ? 'Data jadwal, materi, tugas, ujian, atau nilai hanya muncul setelah sekolah menautkan data akademik ke akun siswa.'
    : ['ortu', 'orang_tua'].includes(role)
      ? 'Data anak belum ditampilkan karena hubungan akun wali-siswa harus diverifikasi oleh sekolah. Pengumuman dan Chat sekolah tetap tersedia sesuai hak akses.'
      : isTeacherRole(role)
      ? isCoverGuide
        ? 'Pembuat cover perangkat belum tersedia. Gunakan Perencanaan untuk menyusun dokumen ajar; cover tidak dibuat atau disimpan oleh halaman ini.'
        : teacherGuide?.status || 'Menu ini belum memiliki modul akademik khusus. Catatan Kerja Pribadi tersedia terpisah dan bukan pengganti data akademik resmi.'
        : isSchoolAdminRole(role)
          ? modulAktifAdmin.length
            ? 'Modul tenant untuk sebagian alur pada bagian ini tersedia melalui tautan di bawah. Halaman ini sendiri hanya panduan dan ringkasannya bukan audit log lengkap.'
            : 'Halaman ini adalah panduan baca-saja. Modul administrasi khusus untuk menu ini belum tersedia; gunakan tautan modul terkait bila tersedia.'
          : role === 'operator'
            ? 'Halaman ini adalah panduan baca-saja. Akses operasional tetap mengikuti izin peran dan tenant sekolah.'
            : `Tautan menu ${item.label} membuka panduan baca-saja, bukan modul data atau arsip resmi. Gunakan modul terkait bila tersedia.`;
  return (
    <div className="ale-submenu-page">
      <header className="ale-submenu-hero">
        <div className="ale-submenu-hero-copy">
          <p className="ale-submenu-kicker"><Ikon nama={grup.ikon} />{grup.label}</p>
          <h2>{item.label}</h2>
          <p>{isCoverGuide
            ? 'Pembuat cover perangkat terpisah belum tersedia. Modul Ajar dapat disusun di dalam paket Perencanaan.'
            : ringkasan}</p>
        </div>
        <span className="ale-submenu-state">
          <span aria-hidden="true" />
          Panduan · baca saja
        </span>
      </header>

      <div className="ale-submenu-grid">
        <section className="ale-kartu ale-submenu-workflow" aria-labelledby="submenu-workflow-title">
          <div className="ale-kartu-kepala">
            <h3 id="submenu-workflow-title" className="ale-kartu-judul">
              <Ikon nama="clipboard" /> Alur kerja
            </h3>
            <span className="ale-submenu-label">Panduan</span>
          </div>
          <ol className="ale-submenu-steps">
            {langkah.map((langkahItem, index) => (
              <li key={langkahItem}>
                <span className="ale-submenu-step-number">{index + 1}</span>
                <span>{langkahItem}</span>
              </li>
            ))}
          </ol>
        </section>

        <aside className="ale-kartu ale-submenu-note" aria-labelledby="submenu-status-title">
          <span className="ale-submenu-note-icon"><Ikon nama={item.ikon} /></span>
          <h3 id="submenu-status-title">Status modul</h3>
          <p>{statusModul}</p>
        </aside>
      </div>

      {(modulAktifAdmin.length > 0
        || (teacherGuide?.actions || modulAktifGuru).length > 0
        || modulAktifOrtu.length > 0) && (
        <section className="ale-submenu-related" aria-labelledby="submenu-active-modules-title">
          <div className="ale-submenu-section-heading">
            <div>
              <p className="ale-submenu-kicker">Tindakan tersedia</p>
              <h3 id="submenu-active-modules-title">Buka modul terkait</h3>
            </div>
            <span>Kesiapan dan izin dijelaskan di setiap halaman tujuan</span>
          </div>
          <div className="ale-submenu-links">
            {[...modulAktifAdmin, ...(teacherGuide?.actions || modulAktifGuru), ...modulAktifOrtu]
              .filter((modul) => modul.path !== item.path)
              .map((modul) => (
                <a key={modul.path} className="ale-submenu-link" href={`#${modul.path}`}>
                  <span className="ale-submenu-link-icon"><Ikon nama={modul.ikon} /></span>
                  <span><strong>{modul.label}</strong><small>{modul.actionLabel || 'Buka modul'}</small></span>
                  <span className="ale-submenu-arrow" aria-hidden="true">›</span>
                </a>
              ))}
          </div>
        </section>
      )}

      {terkait.length > 0 && (
        <section className="ale-submenu-related" aria-labelledby="submenu-related-title">
          <div className="ale-submenu-section-heading">
            <div>
              <p className="ale-submenu-kicker">Jelajahi modul</p>
              <h3 id="submenu-related-title">Menu terkait</h3>
            </div>
            <span>{grup.item.length} menu di bagian ini</span>
          </div>
          <div className="ale-submenu-links">
            {terkait.map((sub) => (
              <a key={sub.label} className="ale-submenu-link" href={`#${sub.path}${sub.search || ''}`}>
                <span className="ale-submenu-link-icon"><Ikon nama={sub.ikon} /></span>
                <span><strong>{sub.label}</strong><small>Buka halaman</small></span>
                <span className="ale-submenu-arrow" aria-hidden="true">›</span>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
