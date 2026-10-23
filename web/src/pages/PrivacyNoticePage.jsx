import React from 'react';
import '../styles/privacy-notice.css';

const dataGroups = [
  ['Akun dan keamanan', 'Alamat email, nama profil, peran, sekolah, status akun, dan token autentikasi.'],
  ['Data pembelajaran', 'Data siswa, kelas, kehadiran, bank soal, nilai atau asesmen, dan dokumen yang dimasukkan oleh sekolah atau pengguna.'],
  ['Komunikasi', 'Pesan, metadata percakapan, lampiran yang dipilih pengguna, dan token notifikasi perangkat bila notifikasi diaktifkan.'],
  ['Integrasi pilihan pengguna', 'Berkas Drive/Sheets yang dibuat atau dipilih langsung oleh pengguna. Token Google Workspace hanya disimpan sementara di memori halaman.'],
  ['Draf program BK dan kegiatan', 'Draf program hanya berada di memori halaman hingga ditutup. Gunakan cetak atau Simpan sebagai PDF untuk membuat salinan lokal; jangan masukkan identitas siswa atau isi konseling.'],
];

export default function PrivacyNoticePage() {
  return (
    <main className="privacy-notice" aria-labelledby="privacy-title">
      <article className="privacy-notice-content">
        <p className="privacy-notice-kicker">AI_nnoe Learning Ecosystem</p>
        <h1 id="privacy-title">Informasi Privasi dan Data Pribadi</h1>
        <p className="privacy-notice-warning" role="note">
          Informasi ini menjelaskan kategori data dan kontrol yang dirancang untuk aplikasi. Pemilik memberikan
          identitas pengelola dan kontak privasi di bawah ini serta menyetujui draf usulan retensi dan persetujuan
          wali. Draf ini belum ditinjau secara hukum atau diterapkan secara teknis. Dasar pemrosesan dan ketentuan
          final masih perlu ditetapkan; halaman ini belum menjadi kebijakan privasi final.
        </p>
        <h2>Pengelola dan kontak privasi</h2>
        <p>Identitas pengelola yang diberikan pemilik: <strong>AI_nnoe Corp</strong>.</p>
        <p>
          Ajukan pertanyaan atau permintaan terkait privasi melalui{' '}
          <a href="mailto:kotenraimundus@gmail.com">kotenraimundus@gmail.com</a>. Untuk permintaan data siswa,
          hubungi juga administrator sekolah yang mengelola akun.
        </p>
        <h2>Data yang dapat diproses</h2>
        <ul>
          {dataGroups.map(([title, description]) => (
            <li key={title}><strong>{title}:</strong> {description}</li>
          ))}
        </ul>
        <h2>Tujuan dan kendali akses</h2>
        <p>
          Data digunakan untuk menyediakan ruang kerja belajar, administrasi sekolah, komunikasi, dan fitur
          yang dipilih pengguna. Akses seharusnya dibatasi menurut peran dan sekolah; jangan memasukkan data
          yang tidak diperlukan. Jangan membagikan tautan rapat, berkas, atau informasi siswa kepada pihak
          yang tidak berwenang.
        </p>
        <h2>Penyimpanan dan layanan terkait</h2>
        <p>
          Aplikasi menggunakan Supabase untuk layanan aplikasi dan autentikasi. Konfigurasi proyek saat ini
          menunjuk region India Selatan; region ini belum dipindahkan ke Singapura. Integrasi Google Drive
          atau Sheets hanya berjalan setelah pengguna memilihnya. Cadangan terenkripsi ke R2 baru aktif setelah
          pemilik mengisi rahasia GitHub Actions dan menguji pemulihan; halaman ini tidak menyatakan bahwa
          backup produksi sudah berjalan.
        </p>
        <h2>Data anak dan retensi</h2>
        <p>
          Aplikasi ditujukan untuk mendukung pembelajaran, termasuk pada jenjang sekolah dasar. Draf usulan
          mensyaratkan persetujuan orang tua/wali sebelum data pribadi siswa SD diproses dan sekolah memverifikasi
          kewenangan pemberi persetujuan. Permintaan akses, koreksi, atau penghapusan diarahkan melalui administrator
          sekolah dan kontak privasi di atas. Proses pencatatan/verifikasi persetujuan dan pemenuhan permintaan
          belum diuji pada layanan hosted; dasar pemrosesan dan tata cara final perlu ditinjau sebelum penggunaan.
        </p>
        <p><strong>Jadwal retensi yang diusulkan (draf, belum aktif):</strong></p>
        <ul>
          <li>Akun dan profil: hapus atau anonimisasi paling lambat 90 hari setelah akun ditutup, jika tidak ada kewajiban hukum lain.</li>
          <li>Data belajar, kehadiran, dan nilai: mengikuti jadwal tertulis sekolah serta permintaan penghapusan yang sah.</li>
          <li>Log keamanan: simpan hingga 90 hari untuk keperluan keamanan.</li>
          <li>Cadangan: masa simpan bergulir hingga 30 hari jika layanan backup diaktifkan dan diuji.</li>
        </ul>
        <p>
          Jadwal tersebut adalah usulan, bukan jaminan penghapusan atau konfigurasi aktif. Otomasi penghapusan
          log/arsip belum diverifikasi pada database hosted dan backup belum terbukti berjalan. Jangan memasukkan
          data pribadi siswa sebelum dasar pemrosesan, kebijakan final, dan mekanisme operasional disetujui.
        </p>
        <p className="privacy-notice-updated">Terakhir diperbarui: 23 Oktober 2026 · Informasi operasional, bukan nasihat hukum.</p>
        <a href="#/login">Kembali ke halaman masuk</a>
      </article>
    </main>
  );
}
