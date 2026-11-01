# Audit paritas menu lintas peran

Dokumen ini mencatat menu yang benar-benar dirender oleh `web/src/navigasi.js` melalui
`web/src/components/AppShell.jsx`, bukan katalog adaptor lama di `web/src/menu.js`.
Path menu dibandingkan dengan deklarasi rute di `web/src/app/RouteWrapper.jsx`; sebagian path
dapat ditangani rute wildcard atau halaman panduan generik.

**Status menu bukan status paritas fitur.** Aktif berarti item mempunyai path yang dapat
ditangani rute aplikasi;
hal itu tidak membuktikan alur kerja, persistensi, izin, atau kesetaraan dengan kode lama.
Item nonaktif tidak mempunyai tautan agar tidak membuka halaman generik seolah-olah fitur
sudah siap. Saat Chat digate, satu status nonaktif dipertahankan per grup yang memuat Chat
agar grup khusus komunikasi tidak hilang.

## Bukti dan batas audit

- Katalog baru: `web/src/navigasi.js`; sidebar: `web/src/components/AppShell.jsx`;
  penjaga rute: `web/src/app/RouteWrapper.jsx`; halaman generik:
  `web/src/pages/SubMenuPage.jsx`.
- `web/src/navigasi.js` menonaktifkan path yang terdaftar pada `RUTE_TANPA_ALUR`. Untuk item
  aktif non-guru yang jatuh ke `SubMenuPage`, halaman menampilkan panduan baca-saja dan secara
  eksplisit menyatakan bahwa modul tersebut belum mengubah data. Rute `/platform/*` juga
  memakai satu handler wildcard; handler itu perlu ditinjau per submenu.
- `web/tests/menu-routes.test.mjs` menguji status nonaktif dan mewajibkan item aktif memiliki
  handler rute selain fallback global `*`; pengecualian akun guru harus ditangani eksplisit oleh
  halaman akun. Rute `/platform/*` tetap merupakan satu handler bersama. Tes rute tidak
  membuktikan keseluruhan alur komponen, penyimpanan, otorisasi server, ataupun end-to-end.
- Referensi pelaksanaan lama tersedia di `D:\New folder (3)\ainnoe-pelaksanaan\`:
  `web/src/menu.js`, `web/src/pages/jurnal.js`, `web/src/pages/presensi.js`, dan
  `web/src/lib/pelaksanaan.js`. Sumber tersebut hanya dibaca.
- Referensi `D:\New folder (3)\ainnoe-menu-tambahan\web\src\menuTambahan.js` secara
  eksplisit menandai banyak menu tambahan sebagai `segera`; definisi menu itu bukan bukti
  bahwa alur backend atau perilakunya pernah tersedia.
- Paritas dokumen perencanaan dirinci terpisah di `docs/parity-matrix.md`.
- Untuk menu lain, perilaku lama, skema hosted, retensi, serta izin tenant belum dibuktikan
  satu per satu. Statusnya **PERLU KONFIRMASI**, bukan dianggap setara atau dihapus.

## Inventaris menu yang dirender

`Aktif` dan `Nonaktif` di tabel hanya menyatakan ketersediaan tautan saat ini.
Peran turunan guru (`guru_bk`, `guru_kokurikuler`, `guru_ekstrakurikuler`) memakai katalog
guru yang sama; `admin` memakai katalog admin sekolah. Kepala sekolah dan wali kelas saat ini
hanya memperoleh Dashboard.

| Peran | Grup | Aktif | Nonaktif |
|---|---|---|---|
| Guru | Dashboard | Dashboard | — |
| Guru | Asisten & Chat | Asisten AI; Testimoni | Chat |
| Guru | Data Dasar | Profil Guru & Sekolah; Tahun Ajaran & Semester; Kelas & Mapel Saya; Data Siswa; Barcode & Kartu Absensi; Jadwal Mengajar; Kelompok & Denah Duduk | — |
| Guru | Sumber Perencanaan | Peta Sebaran TP; RPE; ATP; Program Tahunan; Program Semester; KKTP; Modul Ajar; Cover Perangkat; Hasil Perencanaan | Modul Ajar Untuk Siswa |
| Guru | Pelaksanaan Pembelajaran | Jurnal Mengajar Harian; Presensi Siswa; Program BK & Kegiatan | Realisasi terhadap Rencana; Pembelajaran Berdiferensiasi; Kegiatan Kelas Khusus; Catatan Kelas Cepat |
| Guru | Asesmen dan Penilaian | Bank Soal; Ujian Online | Asesmen Diagnostik; Asesmen Formatif; Asesmen Sumatif; Rubrik & Instrumen; Analisis Hasil; Remedial & Pengayaan; Nilai & Capaian Rapor; Generator Soal AI; Penilaian Otomatis |
| Guru | Pemantauan Siswa | — | Profil Siswa Satu Halaman; Catatan Perkembangan; Penguatan Karakter & Projek; Pendampingan & Tindak Lanjut; Komunikasi dengan Orang Tua |
| Guru | Refleksi & Pengembangan Profesional | — | Refleksi Pembelajaran; Supervisi & Observasi; Portofolio Guru; Pengembangan Kompetensi; Rencana Perbaikan |
| Guru | Laporan dan Arsip | Hasil Perencanaan (Arsip) | Laporan Harian s.d. Bulanan; Laporan Penilaian; Laporan Ketercapaian; Laporan Kinerja Guru; Ekspor & Cetak; Dokumen Hanya-Baca; Riwayat Cetak |
| Guru | Kolaborasi | — | Ruang Kerja Tim / MGMP; Berbagi Praktik Baik; Akses Kepala Sekolah; Grup Chat; Guru Pengganti |
| Guru | Pengaturan | Akun & Keamanan; Pengaturan Koneksi; Integrasi Google; AI & Layanan | Peran & Hak Akses; Preferensi; Cadangan & Pemulihan; Pusat Bantuan; Notifikasi |
| Operator | Dashboard | Dashboard | — |
| Operator | Operasional Sekolah | Data Siswa; Barcode & Kartu Absensi; Presensi | — |
| Operator | Komunikasi | — | Chat |
| Admin sekolah | Dashboard Admin | Ringkasan Statistik | — |
| Admin sekolah | Monitoring | — | Aktivitas Terbaru; Monitoring Ujian; Chat |
| Admin sekolah | Manajemen Instansi | — | Profil Sekolah; Tahun Ajaran; Semester; Unit dan Jenjang |
| Admin sekolah | Manajemen Pengguna | Guru; Siswa; Tautkan akun siswa ke roster; Orang Tua; Admin Sekolah; Peran dan Hak Akses | — |
| Admin sekolah | Manajemen Akademik | — | Kelas; Mata Pelajaran; Jadwal; Kelompok; Denah Duduk |
| Admin sekolah | Manajemen Perencanaan | Paket Guru | Monitoring Perencanaan; Persetujuan Perangkat |
| Admin sekolah | Manajemen Asesmen | Bank Soal | Paket Ujian; Jadwal Ujian; Monitoring Ujian; Analisis Hasil |
| Admin sekolah | Manajemen Konten | — | Modul Ajar; Bahan Ajar; Perpustakaan Digital |
| Admin sekolah | Manajemen Komunikasi | Moderasi Testimoni | Kanal Pengumuman; Broadcast; Monitoring Agregat |
| Admin sekolah | Manajemen Keuangan | Purchase Lisensi | Pembayaran; Tagihan; Laporan Keuangan |
| Admin sekolah | Laporan dan Analitik | — | Laporan Akademik; Laporan Keuangan; Laporan Kinerja; Ekspor |
| Admin sekolah | Pengaturan Sistem | — | Integrasi; API dan Layanan; Cadangan; Log Aktivitas |
| Admin sekolah | Bantuan dan Dukungan | — | Panduan Admin; Kontak Support; FAQ |
| Superadmin | Dashboard Super Admin | Statistik Global | — |
| Superadmin | Monitoring Platform | Log Aktivitas | Kesehatan Sistem |
| Superadmin | Manajemen Tenant | Daftar Sekolah | Langganan; Paket |
| Superadmin | Chat Dukungan | — | Chat |
| Superadmin | Manajemen Pengguna Global | Akun Pengguna; Pengguna Supabase | Peran Global |
| Superadmin | Manajemen Menu dan Fitur | Feature Flags | Menu Builder; Izin Peran |
| Superadmin | Manajemen Konten Global | Paket Guru | Template Perangkat; Bank Soal Global; Modul |
| Superadmin | Manajemen AI | — | API Key Gemini; Template Prompt; Monitoring Penggunaan AI |
| Superadmin | Keamanan dan Audit | Audit Log | Supabase RLS |
| Superadmin | Laporan dan Analitik Global | Penggunaan | Performa; Biaya |
| Superadmin | Pengaturan Platform | Mode Pemeliharaan | Konfigurasi; Integrasi; Cadangan |
| Siswa | Dashboard | Dashboard | — |
| Siswa | Ruang Belajar | Ujian Saya; Nilai Saya | Jadwal dan Tugas; Materi |
| Siswa | Akun dan Langganan | Paket dan Langganan | — |
| Siswa | Komunikasi | — | Chat |
| Orang tua | Dashboard | Dashboard | — |
| Orang tua | Perkembangan Anak | — | Ringkasan Anak; Nilai dan Kehadiran |
| Orang tua | Komunikasi | — | Chat |
| Demo | Uji Coba | Simulasi data contoh | — |
| Kepala sekolah | Dashboard | Dashboard | — |
| Wali kelas | Dashboard | Dashboard | — |

| Peran/katalog | Jumlah item | Aktif | Nonaktif |
|---|---:|---:|---:|
| Guru dan peran turunan | 71 | 29 | 42 |
| Operator | 5 | 4 | 1 |
| Admin sekolah (`admin`) | 50 | 11 | 39 |
| Superadmin | 29 | 10 | 19 |
| Siswa | 7 | 4 | 3 |
| Orang tua (`ortu`/`orang_tua`) | 4 | 1 | 3 |
| Demo | 1 | 1 | 0 |
| Kepala sekolah | 1 | 1 | 0 |
| Wali kelas | 1 | 1 | 0 |

## Snapshot status sebelum implementasi Jurnal Mengajar

| Kelompok | Perilaku lama yang terbukti | Padanan baru | Status | Tindakan berikutnya |
|---|---|---|---|---|
| Perencanaan guru | Rantai dan perilaku generator per dokumen dicatat pada matriks khusus. | Menu mengarah ke mesin perencanaan untuk RPE, ATP, Prota, Prosem, KKTP, Modul Ajar, arsip, dan halaman Cover lokal; Modul Siswa masih dinonaktifkan. | Sebagian; lihat `docs/parity-matrix.md` | Tutup setiap gap dokumen sebelum menyebut setara. |
| Jurnal mengajar | Jurnal lama menyediakan draf/final, edit/hapus, filter riwayat, pemulihan draf lokal, dan ringkasan presensi sesi. Data utamanya disimpan per UID pada Firebase. | Item `/pelaksanaan/jurnal` dinonaktifkan. Tidak ditemukan tabel Supabase jurnal yang dapat dipakai untuk memigrasikan penyimpanan dengan aman. | Belum | Rancang model Supabase dan RLS pemilik/tenant; port perilaku, tes akses silang, draf, simpan, restore, dan error sebelum mengaktifkan tautan. |
| Presensi sesi | Presensi lama mengelola roster per sesi, status H/S/I/A, catatan, simpan ulang sesi, hapus, dan riwayat. | `/pelaksanaan/presensi` menampilkan riwayat scan pada `attendance_records`; migrasi itu hanya mendukung hasil scan hadir dan belum menyamakan pengambilan presensi per sesi. UI menyatakan migrasi hosted masih diperlukan. | Sebagian | Putuskan model presensi sesi dan migrasikan schema/RLS sebelum mengklaim paritas atau mengaktifkan pencatatan produksi. |
| Menu tambahan lintas peran | Sumber `ainnoe-menu-tambahan` mendefinisikan banyak entri sebagai `segera`, bukan implementasi perilaku. | Menu baru tersedia; banyak item masih nonaktif dan sejumlah rute aktif memakai modul operasional terbatas. | PERLU KONFIRMASI per fitur | Telusuri sumber lama per domain dan buktikan layar, layanan, penyimpanan, dan izin sebelum menaikkan status. |
| Chat | Referensi menyebut menu Chat; fitur baru saat ini digate sampai skema/izin siap. | Satu status Chat tanpa tautan ditampilkan pada setiap katalog peran saat feature gate mati. | Nonaktif dengan sengaja | Tetap nonaktif sampai schema, RLS, Realtime privat, dan pengujian staging terpenuhi. |

## Rencana awal sebelum implementasi Jurnal Mengajar

| Prioritas | Cakupan | Ukuran | Kriteria selesai |
|---|---|---:|---|
| P0 | Jurnal mengajar dan kesetaraan presensi sesi | L | Alur lama dipetakan; skema Supabase forward-only dengan RLS diuji untuk pemilik, tenant, dan akses ditolak; draf, simpan, ubah, hapus, restore, riwayat, serta error diuji; baru kemudian status menu diputuskan. |
| P0 | Selesaikan gap pada dokumen perencanaan dan Bank Soal | L | Matriks dokumen menunjukkan perilaku dan tes nyata; preview/cetak, penyimpanan, akses, dan ekspor dibuktikan. |
| P0 | Audit alur admin sekolah, siswa, dan orang tua terhadap sumber lama yang benar-benar tersedia | L | Tiap alur memiliki file/fungsi sumber atau alasan **PERLU KONFIRMASI**; izin diuji di server, bukan hanya menu. |
| P1 | Audit modul aktif lain (data dasar, ujian online, program kegiatan, tenant, pengguna, kontrol platform) | M | Jalur pengguna, layanan, penyimpanan, empty/error state, dan akses tenant dibuktikan dengan tes terarah. |
| P2 | Bangun menu yang sumber lamanya hanya berstatus `segera` atau tidak ditemukan | L | Cakupan, kebijakan data, dan perilaku disetujui sebelum fitur baru diaktifkan. |

Perubahan status menu hanya dilakukan setelah alur dan kontrol akses terkait selesai serta
teruji. Jumlah item adalah snapshot kode dan perlu diperbarui bersama perubahan katalog.

## Gerbang cakupan dan rilis

Seluruh kapabilitas yang dipilih pengguna tetap menjadi cakupan target; tidak ada item yang
boleh dianggap selesai hanya karena tautannya aktif, atau dihapus/dinonaktifkan tanpa alasan
dan keputusan yang tercatat. Pemilik memilih menahan rilis publik sampai seluruh kapabilitas
target memiliki desain aman tanpa biaya owner yang terverifikasi dan implementasi yang lulus
uji. Status saat ini **NO-GO publik**.

Untuk setiap item menu, audit lanjutan harus membuktikan halaman/alur, service, sumber
persistensi, otorisasi pada batas tepercaya, status gagal/kosong, pengujian, serta
kelayakan biaya. Item yang belum punya bukti harus tetap ditandai belum siap; item lintas
akun tidak boleh diaktifkan hanya dengan feature flag klien atau penyimpanan lokal. Gerbang
ini tidak mengizinkan perubahan hosted, billing, push, atau deploy.

## Pembaruan status Jurnal Mengajar

Catatan ini menggantikan status Jurnal Mengajar dan prioritas P0 gabungan pada tabel di atas,
yang merupakan snapshot sebelum implementasi. Menu `/pelaksanaan/jurnal` kini aktif; halaman,
layanan, dan migrasi telah ditambahkan, tetapi belum diterapkan atau diuji pada database hosted.

| Area | Status saat ini | Tindak lanjut |
|---|---|---|
| Jurnal pribadi | Sebagian | Uji di staging setelah migrasi; cakupan query/RLS dibatasi per pemilik dan tenant. |
| Draf lokal | Tersedia | Draf tersimpan pada browser/perangkat ini; tampilkan peringatan privasi dan sediakan penghapusan. |
| Presensi sesi H/S/I/A | Belum | Tetap menjadi P0 terpisah; jangan menyamakan data scan presensi dengan data sesi. |
