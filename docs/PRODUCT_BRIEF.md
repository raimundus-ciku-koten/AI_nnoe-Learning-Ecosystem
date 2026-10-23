# AI_nnoe Learning Ecosystem — product brief

## Ringkasan

AI_nnoe Learning Ecosystem (ALE) adalah ruang kerja digital untuk membantu
guru dan sekolah menata kegiatan pembelajaran, dari persiapan sampai refleksi.
Produk ini berorientasi pada alur sekolah dan akses berbasis peran, bukan
marketplace, layanan pembayaran, atau pendaftaran mandiri.

**Pernyataan produk:** Satu ruang kerja digital untuk mendukung perjalanan
belajar yang lebih terarah, kolaboratif, dan berpusat pada siswa.

## Pengguna dan kebutuhan

| Pengguna | Kebutuhan utama |
| --- | --- |
| Guru | Menyiapkan pembelajaran, menjalankan kegiatan, meninjau asesmen, dan mengelola catatan kerja. |
| Administrator sekolah | Mengelola akun, peran, pengaturan sekolah, dan akses sesuai tanggung jawab. |
| Siswa | Mengakses materi, jadwal, ujian, nilai, dan komunikasi yang disediakan sekolah. |
| Orang tua/wali | Melihat informasi perkembangan yang dibagikan sekolah dan berkomunikasi melalui kanal yang tersedia. |

## Ruang lingkup produk

- Data dasar sekolah dan kelas.
- Perencanaan dan perangkat pembelajaran.
- Dukungan pelaksanaan, jurnal, dan kehadiran.
- Asesmen, bank soal, dan laporan.
- Pengumuman, komunikasi, dan kolaborasi.
- Integrasi pilihan yang diaktifkan dan dikonfigurasi sekolah.

Daftar ini menjelaskan arah produk dan modul yang terdapat di sumber aplikasi,
bukan jaminan bahwa setiap fitur sudah aktif pada layanan hosted. Aktivasi
bergantung pada kesiapan skema backend, konfigurasi, dan verifikasi per fitur.
Landing page tidak menerima pendaftaran umum; akun disediakan administrator.

## Prinsip pengalaman

1. **Jelas dan sederhana:** navigasi mengikuti alur kerja sekolah.
2. **Akses seperlunya:** setiap pengguna hanya mendapat akses yang diberikan
   melalui peran dan kebijakan server/database.
3. **Transparan:** jangan menjanjikan fitur, integrasi, penyimpanan, atau hasil
   yang belum diverifikasi pada lingkungan yang digunakan.
4. **Ramah perangkat:** halaman publik dan alur utama harus responsif serta
   dapat digunakan dengan keyboard.
5. **Aman untuk data pendidikan:** minimalkan data, utamakan persetujuan dan
   tata kelola sekolah, serta jangan memakai data siswa untuk demo publik.

## Metrik keberhasilan yang perlu disepakati

Belum ada baseline atau target numerik yang tervalidasi. Sebelum peluncuran,
tetapkan dan ukur secara bertanggung jawab:

- waktu penyelesaian alur kerja terpilih;
- tingkat keberhasilan tugas pengguna pada tiap peran;
- kegagalan aplikasi dan waktu pemulihan;
- cakupan fitur yang benar-benar aktif dibandingkan fitur yang diumumkan;
- permintaan akses dan dukungan yang terselesaikan.

Jangan mengumpulkan analitik perilaku siswa atau data identitas untuk metrik
produk tanpa dasar pemrosesan, pemberitahuan, dan persetujuan yang sesuai.

## Model akses dan biaya

- Tidak ada harga, checkout, atau pendaftaran berbayar yang dijanjikan pada
  landing page ini.
- Akun dibuat/diberikan oleh administrator; pembuatan akun publik tetap
  dinonaktifkan.
- Pengembangan dan hosting dapat dimulai dengan paket gratis yang tersedia,
  tetapi kuota, fitur, retensi, dan ketentuan penyedia dapat berubah.
- Domain kustom, email profesional, layanan AI, penyimpanan tambahan, backup,
  TURN, atau skala penggunaan dapat menimbulkan biaya. Fitur berbayar jangan
  diaktifkan tanpa persetujuan pemilik dan perkiraan biaya.
- Sebelum status identitas pengelola diverifikasi dan ketentuan layanan serta
  kebijakan privasi disahkan, materi ini adalah profil produk—bukan penawaran
  komersial atau dokumen legal.

## Rencana bertahap

1. **Fondasi:** verifikasi identitas pengelola yang diberikan pemilik,
   tetapkan dasar pemrosesan, persetujuan orang tua/wali dan retensi, petakan
   peran, lalu validasi daftar fitur yang tersedia pada Staging.
2. **Pilot terbatas:** uji alur terpilih menggunakan akun dan data sintetis,
   selesaikan review akses/RLS, pemulihan cadangan, serta verifikasi operasional.
3. **Peluncuran terbatas:** aktifkan hanya fungsi yang lolos validasi,
   dokumentasikan dukungan dan respons insiden, lalu tinjau penggunaan.
4. **Perluasan:** prioritaskan fitur berdasarkan hasil pilot, kapasitas,
   keamanan, dan persetujuan biaya.

## Identitas publik

Implementasi menggunakan merek **AI_nnoe Learning Ecosystem** dan atribusi
inisiatif **Raimundus Ciku Koten**, sesuai metadata author repository. Pemilik
memberikan **AI_nnoe Corp** sebagai identitas pengelola dan
`kotenraimundus@gmail.com` sebagai kontak privasi publik. Status legal formal
identitas tersebut belum diverifikasi secara independen. Data ini tidak
menggantikan dasar pemrosesan atau ketentuan layanan yang perlu disetujui
sebelum peluncuran publik. Pemilik menyetujui draf usulan retensi: akun 90
hari setelah ditutup, data belajar mengikuti jadwal tertulis sekolah, log
keamanan 90 hari, dan backup bergulir 30 hari bila diaktifkan. Draf persetujuan
wali meminta persetujuan sebelum data siswa SD diproses dan verifikasi sekolah.
Usulan ini belum ditinjau secara hukum atau diterapkan secara teknis; bukan
jaminan penghapusan dan belum menjadi kebijakan final.

Pencarian nama persis **AI_nnoe Corp** pada portal AHU Ditjen AHU Online
memberikan hasil “Pencarian Tidak Ditemukan”. Hasil ini hanya mencakup pencarian
yang tersedia pada portal AHU untuk Perseroan Terbatas; hasil tersebut tidak
membuktikan ketiadaan badan hukum dengan nama serupa, bentuk lain, atau
yurisdiksi lain. Verifikasi memerlukan yurisdiksi pendirian dan dokumen resmi
atau nomor registrasi yang dapat dicocokkan. Karena itu nama tersebut tetap
dicantumkan sebagai identitas yang diberikan pemilik, bukan identitas legal
yang telah diverifikasi.
