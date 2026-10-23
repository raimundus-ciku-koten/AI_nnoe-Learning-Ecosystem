import React from 'react';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext.jsx';
import Ikon from '../components/Ikon.jsx';
import '../styles/admin-help.css';

const FAQ = [
  {
    question: 'Bagaimana memperbarui identitas sekolah dan siklus akademik?',
    answer: 'Buka Administrasi Sekolah > Manajemen Instansi. Gunakan Profil Sekolah untuk nama, NPSN, dan kepala sekolah; gunakan Tahun Ajaran atau Semester untuk siklus berjalan.',
    href: '/admin/instansi/profil',
    label: 'Buka pengaturan sekolah',
  },
  {
    question: 'Mengapa saya tidak dapat membuka menu tertentu?',
    answer: 'Akses aplikasi mengikuti peran, status akun, dan sekolah aktif. Hubungi administrator platform untuk provisioning atau koreksi tenant. Jangan mencoba membuka URL lain untuk melewati pembatasan.',
  },
  {
    question: 'Bagaimana menautkan siswa ke akun siswa atau wali?',
    answer: 'Gunakan menu Manajemen Pengguna untuk alur penautan yang tersedia. Pastikan identitas dan persetujuan wali diverifikasi sekolah sebelum menghubungkan akun dengan data siswa.',
    href: '/admin/pengguna/tautkan-siswa',
    label: 'Buka manajemen pengguna',
  },
  {
    question: 'Bagaimana membagikan informasi resmi kepada warga sekolah?',
    answer: 'Gunakan Kanal Pengumuman sekolah. Isi pesan seperlunya dan hindari mencantumkan data pribadi siswa pada pengumuman yang dapat dibaca banyak peran.',
    href: '/admin/komunikasi/pengumuman',
    label: 'Buka kanal pengumuman',
  },
  {
    question: 'Apakah halaman yang terlihat berarti database sudah siap?',
    answer: 'Tidak. Halaman lokal atau Preview tidak membuktikan migrasi, RLS, provider autentikasi, maupun konfigurasi Production sudah aktif. Periksa status rilis dan jangan menjalankan migrasi sebelum backup/restore disposable, rekonsiliasi skema, tinjauan, dan persetujuan selesai.',
  },
  {
    question: 'Bagaimana menjaga penggunaan tetap hemat biaya?',
    answer: 'Jangan aktifkan provider berbayar, workflow backup, atau layanan baru tanpa memeriksa kuota dan harga. Free tier dapat berubah atau tidak mencukupi; penggunaan layanan yang sudah ada tetap dapat menimbulkan biaya.',
  },
];

const PANDUAN = [
  {
    title: 'Periksa konteks sekolah',
    text: 'Pastikan akun administrator sekolah aktif dan terhubung ke tenant yang benar sebelum memperbarui profil, pengguna, pengumuman, atau data akademik.',
  },
  {
    title: 'Gunakan alur yang sudah tersedia',
    text: 'Profil sekolah, siklus akademik, hubungan wali-siswa, pengumuman, jadwal/tugas/materi, dan asesmen tertentu memiliki halaman khusus. Menu lain mungkin masih berupa panduan atau belum memiliki alur penyimpanan.',
  },
  {
    title: 'Jaga privasi dan akses',
    text: 'Simpan hanya informasi yang diperlukan. Jangan membagikan kata sandi, secret, token, identitas siswa, atau isi audit kepada orang yang tidak berwenang.',
  },
  {
    title: 'Tindak lanjuti masalah akses',
    text: 'Catat nama halaman, waktu kejadian, dan pesan kesalahan tanpa data pribadi. Gunakan percakapan aplikasi dengan petugas sekolah yang berwenang bila tersedia.',
  },
];

function pathInfo(pathname) {
  if (pathname.endsWith('/faq')) return 'faq';
  if (pathname.endsWith('/support')) return 'support';
  return 'guide';
}

export default function AdminHelpPage() {
  const { pathname } = useLocation();
  const { role } = useAuth();
  const page = pathInfo(pathname);

  if (role !== 'admin_sekolah') {
    return (
      <section className="ale-kartu admin-help-denied" role="alert">
        <h1>Pusat bantuan admin tidak tersedia</h1>
        <p>Halaman ini hanya tersedia bagi administrator sekolah.</p>
      </section>
    );
  }

  const title = page === 'faq' ? 'Pertanyaan Umum' : page === 'support' ? 'Kontak Support' : 'Panduan Admin';

  return (
    <main className="admin-help">
      <header className="admin-help-header">
        <div>
          <p className="admin-help-kicker"><Ikon nama="question" /> Bantuan dan dukungan</p>
          <h1>{title}</h1>
          <p>Panduan penggunaan yang aman dan sesuai kemampuan aplikasi saat ini.</p>
        </div>
        <a href="#/dashboard">Kembali ke Dashboard</a>
      </header>

      <nav className="admin-help-nav" aria-label="Pusat bantuan">
        <a href="#/admin/bantuan/panduan" aria-current={page === 'guide' ? 'page' : undefined}>Panduan Admin</a>
        <a href="#/admin/bantuan/faq" aria-current={page === 'faq' ? 'page' : undefined}>FAQ</a>
        <a href="#/admin/bantuan/support" aria-current={page === 'support' ? 'page' : undefined}>Kontak Support</a>
      </nav>

      {page === 'support' ? (
        <section className="ale-kartu admin-help-card" aria-labelledby="admin-support-title">
          <div className="admin-help-card-icon"><Ikon nama="chat" /></div>
          <h2 id="admin-support-title">Hubungi melalui kanal yang tersedia</h2>
          <p>
            Jika percakapan Chat sudah tersedia untuk akun Anda, sampaikan nama halaman,
            waktu kejadian, langkah yang dilakukan, dan pesan kesalahan tanpa menyertakan
            kata sandi, token, data pribadi siswa, atau secret.
          </p>
          <a className="admin-help-primary" href="#/chat">
            <Ikon nama="chat" /> Buka Chat aplikasi
          </a>
          <p className="admin-help-note">
            Halaman ini tidak mengirim tiket atau pesan otomatis. Respons dukungan bergantung
            pada petugas yang tersedia di lingkungan sekolah.
          </p>
        </section>
      ) : page === 'faq' ? (
        <section className="ale-kartu admin-help-card" aria-labelledby="admin-faq-title">
          <h2 id="admin-faq-title">Pertanyaan yang sering diajukan</h2>
          <div className="admin-help-faq">
            {FAQ.map((item) => (
              <details key={item.question}>
                <summary>{item.question}</summary>
                <p>{item.answer}</p>
                {item.href && <a href={`#${item.href}`}>{item.label}</a>}
              </details>
            ))}
          </div>
        </section>
      ) : (
        <section className="ale-kartu admin-help-card" aria-labelledby="admin-guide-title">
          <h2 id="admin-guide-title">Prinsip operasional sekolah</h2>
          <ol className="admin-help-guide">
            {PANDUAN.map((item) => (
              <li key={item.title}>
                <span aria-hidden="true"><Ikon nama="check" /></span>
                <div><h3>{item.title}</h3><p>{item.text}</p></div>
              </li>
            ))}
          </ol>
          <p className="admin-help-note">
            Beberapa menu belum memiliki fungsi domain aktif. Jangan gunakan menu panduan
            sebagai bukti bahwa data sudah tersimpan atau backend telah siap.
          </p>
        </section>
      )}
    </main>
  );
}
