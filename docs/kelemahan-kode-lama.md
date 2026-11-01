# Temuan dan risiko pada kode lama perencanaan

## Batas audit

Audit statis atas sumber READ-ONLY yang diberikan pengguna di `D:\New folder (3)\`. Tidak
menjalankan Apps Script, mengakses spreadsheet/Drive, atau memeriksa konfigurasi produksi.
Temuan konfigurasi dan kebijakan di bawah bukan bukti bahwa data produksi saat ini terbuka.

## Temuan terkonfirmasi dari kode

| Area | Bukti | Temuan dan dampak |
|---|---|---|
| Fallback ATP | `4_Optimasi_Generate/08b_GenerateAtp.js`, pemanggilan `panggilGenerateMonolitik_` dengan `fallback: null` | Komentar/header menyebut fallback deterministik, tetapi pemanggilan ATP secara eksplisit tidak memasang fallback. Jika engine utama dan cadangan gagal, generator mengembalikan pesan gagal HTML alih-alih ATP deterministik; guru harus mencoba ulang. |
| Modul Siswa terpotong | `Script T/08h_GenerateModulSiswa.txt`, `orkestrasiModulSiswa_` dan `msModulTerpotong_` | Generator mencoba tambahan maksimal dua kali, tetapi setelah loop tetap melanjutkan normalisasi, penyimpanan, dan ekspor tanpa menolak hasil yang masih terpotong. Naskah yang belum memiliki seluruh bagian dapat tampak selesai. |
| Jumlah soal tidak diverifikasi | `Script T/08g_GenerateBankSoal.txt`, bagian `bs1`/`bs2` pada `panggilGenerateBagian_` | Prompt meminta jumlah PG/uraian yang tepat, tetapi kedua bagian menetapkan `minTables: 0`; tidak terlihat pemeriksaan akhir jumlah butir dan pasangan kunci sebelum simpan/PDF. |
| Cover tanpa dokumen lokal otomatis | `Script T/08i_GenerateCover.txt`, `generateCoverPerangkat` | Tanpa `forceImage`, fungsi mengembalikan `success: false` dengan instruksi memakai HTML/SVG lokal. Jika mode gambar dan teks sama-sama gagal, fungsi juga mengembalikan kegagalan/fallback flag; fallback itu bukan dokumen cover hasil generator ini. |
| Hasil simpan/ekspor dapat gagal tanpa status ke guru | `4_Optimasi_Generate/08b_GenerateAtp.js`, `08c_GenerateProta.js`; `Script T/08g_GenerateBankSoal.txt`, `08h_GenerateModulSiswa.txt`, `08i_GenerateCover.txt`, `08j_GenerateHasil.txt` | Beberapa pemanggil membungkus simpan/ekspor dengan `try/catch` kosong atau mengabaikan objek `{saved, pdf}`. Dokumen dapat tampil sebagai hasil generator meskipun arsip atau PDF gagal dibuat. Helper PDF mengembalikan error, tetapi pemanggil harus memeriksanya. |
| Sinkronisasi cache dapat diam-diam tidak tersedia | `4_Optimasi_Generate/08f_GenerateRpe.js`, `generateRPE`; `08b_GenerateAtp.js` | Penulisan cache RPE/ATP dibungkus catch yang mengabaikan kegagalan. Dokumen tetap dikembalikan, tetapi generator turunan dapat memakai cache lama/kosong. |
| Placeholder Modul Ajar | `4_Optimasi_Generate/08e_GenerateModul.js`, `susunNaskahModul_` | Renderer memasukkan teks `[Belum terisi otomatis.]` dan menghitung bagian wajib yang kosong. Perlu memastikan jalur akhir menolak atau memberi status belum selesai sebelum simpan; placeholder tidak boleh disalahartikan sebagai konten siap pakai. |
| Role fallback | `Script T/18_RoleRouter.txt`, `requireRole_` dan `getRoleContext` | Jika `resolveRole_` tidak tersedia, role ditetapkan ke `guru`; untuk handler yang mengizinkan `guru`, ini adalah fallback fail-open. Kondisi fungsi resolver dan semua handler pemanggil harus diuji. |
| Filter tenant bersyarat | `Script T/18_RoleRouter.txt`, `getAdminSekolahDashboard_` | Filter `idInstansi` hanya diterapkan bila nilainya ada; jika konteks instansi kosong, agregat menghitung semua guru. Belum membuktikan akses ke dokumen, tetapi berisiko memberi ringkasan lintas sekolah. |
| Gagal membersihkan Google Doc sementara | `Script T/08j_GenerateHasil.txt`, blok `finally` pada `eksporHtmlKePdfViaDocs_` | Penghapusan Doc sementara dilakukan, tetapi kegagalannya ditelan. Dokumen sementara dapat tertinggal di Drive tanpa pemberitahuan. |
| Format cetak tidak konsisten | `Script T/08j_GenerateHasil.txt`; `4_Optimasi_Generate/08f_GenerateRpe.js`; `Script T/08i_GenerateCover.txt` | Aturan bersama menyebut 12/14/11/9 pt dan spasi 1, sementara CSS khusus RPE menetapkan judul 16 pt, subjudul 13 pt, tabel 10 pt dan line-height 1.55; Cover memakai judul 28/16 pt. Hasil aktual bergantung pada generator/CSS yang menang. |

## Risiko kebijakan/konfigurasi yang perlu verifikasi

| Area | Bukti dokumenter | Risiko dan batas klaim |
|---|---|---|
| Pengiriman data ke provider AI | `1_HTML_APP/14_Privacy.txt` menyebut Gemini dan provider cadangan; generator mengirim blok konteks/prompt ke layanan AI. | Pernyataan “tidak membagikan data ke pihak ketiga” bertentangan dengan pengiriman prompt ke provider. Periksa payload nyata, persetujuan, dan ketentuan provider; file kebijakan tidak membuktikan log/retensi provider. |
| Berbagi spreadsheet | `1_HTML_APP/14_Privacy.txt` menyebut pengaturan “Anyone with the link” untuk sinkronisasi. | Jika masih diterapkan, pembaca tautan dapat mengakses data yang dibagikan. Ini klaim dalam dokumen kebijakan, bukan verifikasi permission spreadsheet saat ini; audit konfigurasi aktual sebelum menyimpulkan eksposur. |
| Retensi dan penghapusan | `1_HTML_APP/14_Privacy.txt` menyebut dokumen 2 tahun, log API 2.000 baris, dan aktivitas 1 tahun; `Script T/20_Privacy.txt` menyatakan pengguna dapat menghapus data melalui Drive/Sheets. | Tidak ada bukti bahwa kebijakan tersebut otomatis ditegakkan oleh job/trigger; cakupan penghapusan, cache, dan log perlu diuji. |
| Tahun ajaran dan kalender | Beberapa generator memiliki tahun ajaran bawaan dan RPE menyimpan hari libur per tanggal. | Nilai bawaan/kalender yang tidak diperbarui dapat menghasilkan identitas atau pekan efektif yang usang. Verifikasi setiap tahun ajaran; jangan mengarang tanggal. |

## Resiliensi yang sudah ada (bukan temuan kelemahan)

- `08j3_MonolitikEngine.js` mengatur Gemini utama, DeepSeek cadangan, retry, batas waktu total, dan validasi marker/panjang/HTML untuk pemanggilan yang memakai mesin tersebut.
- Prosem mencoba ulang bagian matriks yang tidak lengkap dan menahan penyimpanan bila diagnosa masih menunjukkan bagian gagal.
- KKTP menyediakan fallback deterministik dan koreksi ulang kode TP yang tidak sesuai kontrak.
- RPE menghitung naskah kanonik deterministik; AI polish nonaktif secara default dan kegagalannya kembali ke naskah kanonik.

## Batas tes

Temuan di atas berasal dari pembacaan kode. Belum ada eksekusi runtime Apps Script, tes permission Drive/Sheets, uji simulasi provider, atau pemeriksaan kebijakan produksi. Verifikasi lanjutan harus merekam hasil aktual dan tidak menyatakan risiko konfigurasi sebagai kebocoran terkonfirmasi.
