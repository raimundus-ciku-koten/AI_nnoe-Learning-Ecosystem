import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { isSchoolAdminRole, isTeacherRole } from '../services/roleAccess.js';
import { cariMenu } from '../navigasi.js';
import Ikon from '../components/Ikon.jsx';
import TeacherWorkspacePage from './TeacherWorkspacePage.jsx';
import TeacherAccountPage from './TeacherAccountPage.jsx';
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
    ringkasan: 'Susun perangkat ajar menggunakan paket perencanaan, lalu tinjau dokumen tersimpan melalui arsip akun Anda.',
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
    { label: 'Modul Ajar untuk Siswa', path: '/perangkat/modul-siswa', ikon: 'book' },
    { label: 'Cover Perangkat', path: '/perangkat/cover', ikon: 'file' },
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
  ],
  refleksi: [
    { label: 'Catatan Kerja Pribadi', path: '/guru/catatan-pribadi', ikon: 'file' },
  ],
  laporan: [
    { label: 'Arsip Perencanaan', path: '/laporan/arsip-perencanaan', ikon: 'file' },
  ],
  kolaborasi: [
    { label: 'Percakapan', path: '/chat', ikon: 'chat' },
    { label: 'Grup Chat', path: '/chat/grup', ikon: 'users' },
  ],
  pengaturan: [
    { label: 'Akun & Keamanan', path: '/pengaturan/akun', ikon: 'settings' },
    { label: 'Integrasi Google', path: '/pengaturan/google', ikon: 'settings' },
  ],
};

const MODUL_ORTU_AKTIF = [
  { label: 'Pengumuman Sekolah', path: '/pengumuman', ikon: 'file' },
  { label: 'Percakapan dengan Sekolah', path: '/chat', ikon: 'chat' },
  { label: 'Kontak Sekolah', path: '/chat/kontak', ikon: 'users' },
];

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
  if (isTeacherRole(role) && item.path === '/pengaturan/akun') return <TeacherAccountPage />;
  if (isTeacherRole(role) && item.path === '/guru/catatan-pribadi') {
    return <TeacherWorkspacePage grup={grup} item={item} />;
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
  const ringkasan = isSchoolAdminRole(role) && item.path === '/admin/dashboard/chat'
    ? 'Monitoring Chat menampilkan ringkasan agregat chat per tenant tanpa isi percakapan atau identitas peserta; ini bukan audit log lengkap atau alat moderasi.'
    : alur.ringkasan;
  const langkah = isSchoolAdminRole(role) && item.path === '/admin/dashboard/chat'
    ? [
      'Tinjau jumlah percakapan baru 30 hari, pesan 7 hari, dan pengirim aktif.',
      'Angka hanya merangkum percakapan dengan peserta aktif dari tenant ini.',
      'Gunakan jalur perlindungan sekolah untuk tindak lanjut; halaman ini bukan alat moderasi.',
    ]
    : alur.langkah;
  const terkait = grup.item.filter((sub) => sub !== item && sub.path);
  const statusModul = role === 'siswa'
    ? 'Data jadwal, materi, tugas, ujian, atau nilai hanya muncul setelah sekolah menautkan data akademik ke akun siswa.'
    : ['ortu', 'orang_tua'].includes(role)
      ? 'Data anak belum ditampilkan karena hubungan akun wali-siswa harus diverifikasi oleh sekolah. Pengumuman dan Chat sekolah tetap tersedia sesuai hak akses.'
      : isTeacherRole(role)
      ? 'Menu ini belum memiliki modul akademik khusus. Catatan Kerja Pribadi tersedia terpisah dan bukan pengganti data akademik resmi.'
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
          <p>{ringkasan}</p>
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

      {(modulAktifAdmin.length > 0 || modulAktifGuru.length > 0 || modulAktifOrtu.length > 0) && (
        <section className="ale-submenu-related" aria-labelledby="submenu-active-modules-title">
          <div className="ale-submenu-section-heading">
            <div>
              <p className="ale-submenu-kicker">Tindakan tersedia</p>
              <h3 id="submenu-active-modules-title">Buka modul terkait</h3>
            </div>
            <span>Kesiapan dan izin dijelaskan di setiap halaman tujuan</span>
          </div>
          <div className="ale-submenu-links">
            {[...modulAktifAdmin, ...modulAktifGuru, ...modulAktifOrtu]
              .filter((modul) => modul.path !== item.path)
              .map((modul) => (
              <a key={modul.path} className="ale-submenu-link" href={`#${modul.path}`}>
                <span className="ale-submenu-link-icon"><Ikon nama={modul.ikon} /></span>
                <span><strong>{modul.label}</strong><small>Buka modul</small></span>
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
