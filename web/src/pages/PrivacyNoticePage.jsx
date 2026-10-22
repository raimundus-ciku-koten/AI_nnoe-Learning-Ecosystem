import React from 'react';
import '../styles/privacy-notice.css';

const dataGroups = [
  ['Akun dan keamanan', 'Alamat email, nama profil, peran, sekolah, status akun, dan token autentikasi.'],
  ['Pendaftaran uji coba', 'Alamat email terverifikasi dan nama tampilan untuk mencegah penggunaan uji coba berulang; pilihan persona demo tidak menjadi peran akun.'],
  ['Data pembelajaran', 'Data siswa, kelas, kehadiran, bank soal, nilai atau asesmen, dan dokumen yang dimasukkan oleh sekolah atau pengguna.'],
  ['Komunikasi', 'Pesan, metadata percakapan, lampiran yang dipilih pengguna, dan token notifikasi perangkat bila notifikasi diaktifkan.'],
  ['Permintaan pendaftaran manual', 'Nama, email, nomor WhatsApp pemohon, pilihan paket, dan bila memilih jalur sekolah: nama, NPSN, jenjang, provinsi, kabupaten/kota, serta alamat lembaga yang dimasukkan ke formulir.'],
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
          Informasi ini menjelaskan kategori data dan kontrol yang dirancang untuk aplikasi. Ini belum menggantikan
          kebijakan privasi final: pemilik layanan dan sekolah perlu melengkapi identitas hukum, kontak,
          dasar pemrosesan, persetujuan orang tua, dan jadwal retensi sebelum penggunaan publik.
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
        <p>
          Pada formulir pendaftaran manual, isian hanya berada di memori halaman dan tidak dikirim atau
          disimpan oleh aplikasi. Jika pemohon memilih membuat PDF, berkas tersimpan di perangkat melalui
          dialog cetak browser. Pemohon sendiri yang memilih apakah akan melampirkannya di WhatsApp; aplikasi
          hanya membuka pesan umum dan tidak mengirim PDF maupun isian formulir secara otomatis. Jangan
          mencantumkan kata sandi, NIK/KK anak, nomor kartu pembayaran, atau salinan dokumen identitas.
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
          Sekolah dan pengelola tenant harus memastikan dasar pemrosesan yang sah, persetujuan orang tua/wali
          bila diperlukan, serta mekanisme akses, koreksi, dan penghapusan sesuai UU Pelindungan Data Pribadi
          (UU 27/2022). Penghapusan otomatis log atau arsip ujian belum diverifikasi pada database hosted.
          Tetapkan jadwal retensi dengan sekolah sebelum memasukkan data siswa.
        </p>
        <p>
          Untuk uji coba promosi, data simulasi hanya berada di memori browser. Catatan alamat email uji coba
          disimpan selama layanan beroperasi untuk menegakkan batas satu kali per email. Permintaan
          penghapusan yang terverifikasi harus diproses melalui mekanisme privasi resmi; penghapusan catatan
          akan memungkinkan alamat tersebut mendaftar uji coba lagi. Mekanisme permintaan dan kontak privasi
          resmi harus ditambahkan sebelum pendaftaran dibuka untuk publik. Jangan gunakan uji coba untuk
          memproses data anak atau data sekolah nyata.
        </p>
        <h2>Permintaan dan kontak</h2>
        <p>
          Untuk pertanyaan atau permintaan terkait data siswa, hubungi administrator sekolah yang mengelola akun.
          Sebelum halaman ini diterbitkan sebagai kebijakan final, pemilik layanan wajib menambahkan nama badan
          hukum, alamat/kontak privasi resmi, serta proses eskalasi dan tenggat respons.
        </p>
        <p className="privacy-notice-updated">Terakhir diperbarui: 21 Oktober 2026 · Informasi operasional, bukan nasihat hukum.</p>
        <a href="#/login">Kembali ke halaman masuk</a>
      </article>
    </main>
  );
}
