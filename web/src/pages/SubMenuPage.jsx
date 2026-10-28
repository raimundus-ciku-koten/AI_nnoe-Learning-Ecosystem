import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import { adalahPeranGuru, cariMenu } from '../navigasi.js';
import Ikon from '../components/Ikon.jsx';
import TeacherWorkspacePage from './TeacherWorkspacePage.jsx';
import TeacherAccountPage from './TeacherAccountPage.jsx';
import '../styles/submenu.css';

const ALUR = {
  'admin-dashboard': {
    ringkasan: 'Tinjau kondisi operasional sekolah melalui statistik, aktivitas, serta pemantauan ujian dan komunikasi yang dibatasi sesuai peran.',
    langkah: ['Pilih area operasional sekolah', 'Tinjau ringkasan dan aktivitas terbaru', 'Lanjutkan ke tindak lanjut yang berwenang'],
  },
  'admin-pengguna': {
    ringkasan: 'Kelola akun warga sekolah dalam tenant Anda. Pembuatan dan perubahan peran harus melalui proses server yang berizin.',
    langkah: ['Pilih jenis pengguna', 'Tinjau status atau permintaan akun', 'Proses persetujuan melalui alur resmi'],
  },
  'admin-instansi': {
    ringkasan: 'Jaga profil sekolah dan kalender akademik tetap akurat sebagai dasar pengelolaan kelas dan dokumen.',
    langkah: ['Tinjau identitas dan unit sekolah', 'Pastikan tahun ajaran serta semester aktif', 'Perbarui informasi melalui kewenangan sekolah'],
  },
  'admin-chat': {
    ringkasan: 'Gunakan chat untuk koordinasi warga sekolah dan orang tua tanpa membuka isi percakapan pribadi secara bebas.',
    langkah: ['Pilih percakapan, kontak, atau grup', 'Gunakan kanal resmi untuk pengumuman', 'Laporkan kebutuhan moderasi melalui alur yang tersedia'],
  },
  'admin-akademik': {
    ringkasan: 'Kelola struktur akademik sekolah agar kelas, mata pelajaran, jadwal, dan penugasan tetap selaras.',
    langkah: ['Pilih tahun ajaran aktif', 'Tinjau kelas, mapel, dan jadwal', 'Perbarui penugasan sesuai kewenangan'],
  },
  'admin-perencanaan': {
    ringkasan: 'Pantau dokumen perangkat ajar yang diunggah guru dan tindak lanjuti template atau persetujuan pada lingkup sekolah.',
    langkah: ['Pilih jenis perangkat atau periode', 'Tinjau status dokumen yang tersedia', 'Catat persetujuan atau tindak lanjut'],
  },
  'admin-asesmen': {
    ringkasan: 'Pantau paket dan pelaksanaan asesmen sekolah. Akses monitoring dibatasi pada informasi yang diperlukan untuk pengelolaan.',
    langkah: ['Pilih ujian atau periode', 'Tinjau status peserta dan hasil', 'Siapkan tindak lanjut akademik'],
  },
  'admin-komunikasi': {
    ringkasan: 'Kelola pengumuman dan komunikasi resmi sekolah dengan tetap menjaga privasi percakapan pribadi.',
    langkah: ['Pilih kanal atau sasaran', 'Siapkan pengumuman atau broadcast', 'Tinjau ringkasan dan laporan yang tersedia'],
  },
  'admin-konten': {
    ringkasan: 'Kelola bahan dan modul ajar sekolah agar dokumen pembelajaran mudah ditemukan serta sesuai akses pengguna.',
    langkah: ['Pilih koleksi atau jenis materi', 'Tinjau kelengkapan dan akses', 'Publikasikan melalui alur yang ditetapkan'],
  },
  'admin-keuangan': {
    ringkasan: 'Tinjau pembayaran dan tagihan sekolah serta siapkan laporan keuangan sesuai periode.',
    langkah: ['Pilih periode laporan', 'Tinjau pembayaran dan tagihan', 'Ekspor ringkasan yang diperlukan'],
  },
  'admin-laporan': {
    ringkasan: 'Susun analitik akademik, keuangan, dan kinerja berdasarkan data sekolah yang tersedia.',
    langkah: ['Pilih periode dan jenis laporan', 'Tinjau sumber data dan ringkasan', 'Ekspor hasil sesuai kebutuhan'],
  },
  'admin-pengaturan': {
    ringkasan: 'Kelola integrasi dan operasi sistem sekolah. Rahasia layanan tetap dikelola melalui penyimpanan tepercaya.',
    langkah: ['Tinjau konfigurasi yang aktif', 'Pastikan cakupan perubahan', 'Catat perubahan dan tindak lanjut'],
  },
  'admin-bantuan': {
    ringkasan: 'Temukan panduan pengelolaan sekolah dan jalur dukungan saat membutuhkan bantuan operasional.',
    langkah: ['Pilih panduan atau FAQ', 'Tinjau langkah pemecahan masalah', 'Hubungi dukungan dengan konteks yang relevan'],
  },
  'platform-dashboard': {
    ringkasan: 'Pantau kesehatan layanan dan penggunaan lintas tenant tanpa mencampur ruang lingkup data sekolah.',
    langkah: ['Pilih ringkasan platform', 'Tinjau kesehatan dan aktivitas global', 'Tindak lanjuti anomali sesuai kewenangan'],
  },
  'platform-tenant': {
    ringkasan: 'Kelola sekolah sebagai tenant, termasuk paket dan status langganan, pada tingkat platform.',
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

export default function SubMenuPage() {
  const { pathname, search } = useLocation();
  const { role } = useAuth();
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
  if (adalahPeranGuru(peranAktif) && item.path === '/pengaturan/akun') return <TeacherAccountPage />;
  if (adalahPeranGuru(peranAktif)) return <TeacherWorkspacePage grup={grup} item={item} />;

  const alur = ALUR[grup.id] || {
    ringkasan: 'Pilih aktivitas yang dibutuhkan dan lanjutkan ke modul terkait.',
    langkah: ['Pilih konteks kerja', 'Tinjau informasi yang tersedia', 'Lanjutkan ke aktivitas terkait'],
  };
  const terkait = grup.item.filter((sub) => sub !== item && sub.path);
  const statusModul = role === 'siswa'
    ? 'Data jadwal, materi, tugas, ujian, atau nilai hanya muncul setelah sekolah menautkan data akademik ke akun siswa. Halaman ini saat ini hanya panduan dan tidak mengubah data.'
    : ['ortu', 'orang_tua'].includes(role)
      ? 'Informasi anak hanya tersedia setelah sekolah menautkan akun orang tua secara resmi. Halaman ini saat ini hanya panduan dan tidak menampilkan data anak yang belum ditautkan.'
      : role === 'operator'
        ? 'Akses data operasional tetap dibatasi oleh peran dan tenant sekolah. Halaman ini hanya panduan dan tidak mengubah data.'
        : `Tautan dan halaman menu tersedia. Fitur data khusus untuk modul ${item.label} belum diaktifkan, sehingga halaman ini tidak mengubah data. Gunakan modul terkait yang sudah tersedia, atau hubungi administrator untuk informasi peluncuran.`;

  return (
    <div className="ale-submenu-page">
      <header className="ale-submenu-hero">
        <div className="ale-submenu-hero-copy">
          <p className="ale-submenu-kicker"><Ikon nama={grup.ikon} />{grup.label}</p>
          <h2>{item.label}</h2>
          <p>{alur.ringkasan}</p>
        </div>
        <span className="ale-submenu-state"><span aria-hidden="true" />Panduan · baca saja</span>
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
                <span><strong>{sub.label}</strong><small>Buka panduan</small></span>
                <span className="ale-submenu-arrow" aria-hidden="true">›</span>
              </a>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
