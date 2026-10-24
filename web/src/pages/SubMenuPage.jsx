import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { cariMenu } from '../navigasi.js';
import Ikon from '../components/Ikon.jsx';
import TeacherWorkspacePage from './TeacherWorkspacePage.jsx';
import TeacherAccountPage from './TeacherAccountPage.jsx';
import PrivateWorkspaceRecords from './PrivateWorkspaceRecords.jsx';
import '../styles/submenu.css';

const ALUR = {
  'admin-dashboard': {
    ringkasan: 'Dashboard menampilkan ringkasan yang tersedia untuk akun sekolah. Monitoring aktivitas, ujian, dan chat khusus admin belum tersedia sebagai modul tersendiri.',
    langkah: ['Tinjau ringkasan pada Dashboard', 'Pilih modul aktif dari tautan terkait', 'Gunakan halaman panduan ini hanya sebagai petunjuk'],
  },
  'admin-pengguna': {
    ringkasan: 'Direktori pengguna dan penautan akun siswa tersedia. Persetujuan, pembuatan akun, dan pengubahan peran tidak dilakukan oleh halaman panduan ini.',
    langkah: ['Buka direktori atau penautan akun siswa', 'Tinjau data yang tersedia untuk tenant', 'Ikuti izin server pada modul tujuan'],
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
    ringkasan: 'Bank Soal tersedia untuk dibaca administrator sekolah. Paket ujian, jadwal, monitoring, dan analisis hasil admin belum tersedia.',
    langkah: ['Buka Bank Soal untuk meninjau soal', 'Perubahan soal hanya tersedia bagi guru', 'Jangan gunakan menu panduan sebagai laporan ujian'],
  },
  'admin-komunikasi': {
    ringkasan: 'Kanal Pengumuman menyimpan informasi resmi sekolah untuk dibaca pengguna yang berhak. Broadcast otomatis dan monitoring agregat belum tersedia.',
    langkah: ['Buat pengumuman untuk tenant sekolah aktif', 'Tinjau dan perbarui informasi yang diterbitkan', 'Gunakan Chat untuk komunikasi individual'],
  },
  'admin-konten': {
    ringkasan: 'Materi pembelajaran dapat dikelola dalam Ruang Kelas dan dokumen perencanaan melalui arsip. Perpustakaan digital admin belum tersedia.',
    langkah: ['Buka Ruang Kelas atau Arsip Perencanaan', 'Tinjau materi sesuai hak akses', 'Halaman ini tidak memublikasikan konten'],
  },
  'admin-keuangan': {
    ringkasan: 'Halaman ini menampilkan harga katalog dan kontak WhatsApp owner.',
    langkah: ['Buka Harga Paket', 'Tinjau harga katalog dan ekuivalen bulanannya', 'Hubungi owner melalui WhatsApp untuk bertanya'],
  },
  'admin-laporan': {
    ringkasan: 'Arsip Perencanaan dan Bank Soal tersedia. Laporan analitik akademik, keuangan, kinerja, serta ekspor admin belum tersedia.',
    langkah: ['Buka arsip atau Bank Soal', 'Tinjau data yang tersedia di modul tujuan', 'Menu laporan lain masih berupa panduan'],
  },
  'admin-pengaturan': {
    ringkasan: 'Tautan integrasi membuka pengaturan akun pribadi. Konfigurasi integrasi tingkat sekolah, API, cadangan, dan log admin belum tersedia.',
    langkah: ['Buka pengaturan akun pribadi hanya bila diperlukan', 'Perhatikan cakupan akun pada halaman tujuan', 'Jangan masukkan rahasia layanan sekolah pada halaman pribadi'],
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
    ringkasan: 'Susun bukti belajar, pantau capaian, dan tentukan tindak lanjut yang sesuai.',
    langkah: ['Tentukan tujuan dan kriteria', 'Siapkan instrumen penilaian', 'Tinjau hasil dan tindak lanjut'],
  },
  pemantauan: {
    ringkasan: 'Satukan catatan siswa agar perkembangan dan kebutuhan pendampingan mudah ditinjau.',
    langkah: ['Pilih siswa atau kelas', 'Catat perkembangan yang teramati', 'Tentukan tindak lanjut'],
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
    langkah: ['Pilih anak yang terhubung', 'Tinjau nilai dan kehadiran yang tersedia', 'Hubungi sekolah jika hubungan akun perlu diperbaiki'],
  },
  'ortu-komunikasi': {
    ringkasan: 'Gunakan kanal komunikasi sekolah untuk berkoordinasi mengenai perkembangan anak.',
    langkah: ['Pilih percakapan atau kontak', 'Sampaikan kebutuhan secara ringkas', 'Jaga kerahasiaan informasi anak'],
  },
  perencanaan: {
    ringkasan: 'Siapkan perangkat ajar yang konsisten dengan tujuan, urutan, dan kebutuhan belajar siswa.',
    langkah: ['Pilih mata pelajaran dan periode', 'Susun perangkat pembelajaran', 'Tinjau dan arsipkan hasil'],
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
    { label: 'Ruang Kelas', path: '/ruang-kelas', ikon: 'book' },
    { label: 'Bank Soal', path: '/asesmen/bank-soal', ikon: 'file' },
    { label: 'Chat Sekolah', path: '/chat', ikon: 'chat' },
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
    { label: 'Arsip Perencanaan', path: '/laporan/arsip-perencanaan', ikon: 'file' },
    { label: 'Materi Ruang Kelas', path: '/ruang-kelas', ikon: 'book' },
  ],
  'admin-komunikasi': [
    { label: 'Kanal Pengumuman', path: '/pengumuman', ikon: 'file' },
    { label: 'Chat Sekolah', path: '/chat', ikon: 'chat' },
    { label: 'Testimoni', path: '/testimoni', ikon: 'chat' },
  ],
  'admin-keuangan': [
    { label: 'Harga Paket', path: '/purchase', ikon: 'badge' },
  ],
  'admin-laporan': [
    { label: 'Arsip Perencanaan', path: '/laporan/arsip-perencanaan', ikon: 'file' },
    { label: 'Bank Soal', path: '/asesmen/bank-soal', ikon: 'file' },
  ],
  'admin-pengaturan': [
    { label: 'Google Workspace pribadi', path: '/pengaturan/google', ikon: 'settings' },
    { label: 'AI & Layanan pribadi (provider nonaktif)', path: '/pengaturan/api-ai', ikon: 'settings' },
  ],
  'admin-bantuan': [
    { label: 'Chat Sekolah', path: '/chat', ikon: 'chat' },
  ],
};

const MODUL_GURU_AKTIF = {
  chat: [
    { label: 'Percakapan', path: '/chat', ikon: 'chat' },
    { label: 'Grup Chat', path: '/chat/grup', ikon: 'users' },
  ],
  pelaksanaan: [
    { label: 'Presensi Siswa', path: '/pelaksanaan/presensi', ikon: 'check' },
    { label: 'Program BK & Kegiatan', path: '/program-kegiatan', ikon: 'file' },
  ],
  asesmen: [
    { label: 'Bank Soal', path: '/asesmen/bank-soal', ikon: 'book' },
    { label: 'Ujian Online', path: '/asesmen/ujian-online', ikon: 'check' },
  ],
  pemantauan: [
    { label: 'Ruang Kelas', path: '/ruang-kelas', ikon: 'book' },
    { label: 'Presensi Siswa', path: '/pelaksanaan/presensi', ikon: 'check' },
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
  if (role === 'guru' && item.path === '/pengaturan/akun') return <TeacherAccountPage />;
  if (role === 'guru' && item.path === '/guru/catatan-pribadi') {
    return <TeacherWorkspacePage grup={grup} item={item} />;
  }
  const modulAktifAdmin = role === 'admin_sekolah'
    ? MODUL_ADMIN_AKTIF[grup.id] || []
    : [];
  const modulAktifGuru = role === 'guru' ? MODUL_GURU_AKTIF[grup.id] || [] : [];

  const alur = ALUR[grup.id] || {
    ringkasan: 'Pilih aktivitas yang dibutuhkan dan lanjutkan ke modul terkait.',
    langkah: ['Pilih konteks kerja', 'Tinjau informasi yang tersedia', 'Lanjutkan ke aktivitas terkait'],
  };
  const terkait = grup.item.filter((sub) => sub !== item && sub.path);
  const statusModul = role === 'siswa'
    ? 'Data jadwal, materi, tugas, ujian, atau nilai hanya muncul setelah sekolah menautkan data akademik ke akun siswa. Catatan di bawah ini bersifat pribadi dan bukan data akademik resmi.'
    : ['ortu', 'orang_tua'].includes(role)
      ? 'Informasi anak hanya tersedia setelah sekolah menautkan akun orang tua secara resmi. Catatan di bawah ini bersifat pribadi dan tidak menampilkan data anak yang belum ditautkan.'
      : role === 'guru'
        ? 'Menu ini belum memiliki modul akademik khusus. Ruang kerja di bawah membantu mencatat tindak lanjut pribadi, bukan pengganti data akademik resmi.'
      : role === 'operator'
        ? 'Akses data operasional tetap dibatasi oleh peran dan tenant sekolah. Ruang kerja di bawah menyimpan catatan pribadi, bukan perubahan data operasional.'
        : `Tautan menu ${item.label} tersedia. Ruang kerja ini menyediakan catatan pribadi, bukan pengganti modul data khusus atau arsip resmi. Gunakan modul terkait untuk data operasional.`;
  const tersediaRuangKerja = !['superadmin', 'demo'].includes(role);

  return (
    <div className="ale-submenu-page">
      <header className="ale-submenu-hero">
        <div className="ale-submenu-hero-copy">
          <p className="ale-submenu-kicker"><Ikon nama={grup.ikon} />{grup.label}</p>
          <h2>{item.label}</h2>
          <p>{alur.ringkasan}</p>
        </div>
        <span className="ale-submenu-state"><span aria-hidden="true" />{tersediaRuangKerja ? 'Ruang kerja tersedia' : 'Panduan · baca saja'}</span>
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
            {alur.langkah.map((langkah, index) => (
              <li key={langkah}>
                <span className="ale-submenu-step-number">{index + 1}</span>
                <span>{langkah}</span>
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

      {tersediaRuangKerja && (
        <PrivateWorkspaceRecords
          route={item.path}
          search={item.search || ''}
          heading={`Catatan ${item.label}`}
        />
      )}

      {(modulAktifAdmin.length > 0 || modulAktifGuru.length > 0) && (
        <section className="ale-submenu-related" aria-labelledby="submenu-active-modules-title">
          <div className="ale-submenu-section-heading">
            <div>
              <p className="ale-submenu-kicker">Tindakan tersedia</p>
              <h3 id="submenu-active-modules-title">Buka modul terkait</h3>
            </div>
            <span>Kesiapan dan izin dijelaskan di setiap halaman tujuan</span>
          </div>
          <div className="ale-submenu-links">
            {[...modulAktifAdmin, ...modulAktifGuru]
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
