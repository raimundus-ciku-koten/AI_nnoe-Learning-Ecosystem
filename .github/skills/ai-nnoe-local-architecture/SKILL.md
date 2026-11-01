---
name: ai-nnoe-local-architecture
description: "Gunakan saat menyesuaikan, mengimplementasikan, meninjau, atau memperbaiki AI_nnoe lokal berbasis Ollama—termasuk Asisten AI/Teman Belajar, prompt, riwayat percakapan, RAG, streaming, validasi keluaran, dan keamanan. Gunakan referensi arsitektur AI modern dengan tetap mematuhi batas privasi dan biaya proyek."
argument-hint: "[alur atau kebutuhan AI_nnoe]"
---

# Rekayasa AI_nnoe lokal

## Tujuan

Menerapkan pola arsitektur AI modern pada AI_nnoe tanpa memindahkan prompt, riwayat,
dokumen, atau biaya pengguna ke layanan milik pengelola. Gunakan
[ringkasan referensi arsitektur](./references/referensi-arsitektur-ai-modern.md)
sebagai sumber pola dan batas adaptasinya, bukan sebagai spesifikasi proyek yang
otomatis mengesampingkan instruksi workspace.
Untuk peta empat pilar dan status implementasi terkini, gunakan
[adaptasi Cetak Biru Integrasi Fitur AI](./references/cetak-biru-integrasi-fitur-ai.md).

## Gunakan untuk

- Mengubah atau menambah alur AI lokal, Asisten AI, Teman Belajar, atau tutor Sokratik.
- Menyesuaikan prompt sistem, konteks percakapan, validasi respons, atau keluaran terstruktur.
- Menambahkan streaming, pembatalan, pemuatan dokumen/RAG, atau interaksi model Ollama.
- Meninjau privasi, keamanan, ketahanan, dan pengalaman pengguna pada fitur AI_nnoe.

## Batas arsitektur yang wajib dijaga

- Baca `.github/copilot-instructions.md` dan kode alur terkait sebelum mengubah apa pun.
  Kode saat ini menggunakan React/Vite pada `web/` dan merutekan AI lokal melalui
  `web/src/services/aiProviders.js`; verifikasi implementasi terbaru, jangan
  menganggap rincian ini tetap berlaku tanpa pemeriksaan.
- AI generatif harus tetap lokal di Ollama, memakai endpoint loopback yang telah
  divalidasi. Jangan menambah panggilan ke provider AI cloud, mengirim prompt ke
  server pengelola, atau menaruh kunci API di kode klien.
- Jangan menambah penyimpanan terpusat milik pengelola untuk profil, prompt,
  riwayat, dokumen, atau kunci AI. Pertahankan penyimpanan yang dikendalikan
  pengguna sesuai instruksi proyek.
- Jangan menambahkan Express, LangChain, PostgreSQL/pgvector, tabel chat, maupun
  layanan berbayar hanya karena dicontohkan PDF. Perluasan backend, skema,
  penyimpanan, biaya, atau batas kepercayaan memerlukan keputusan eksplisit;
  bila belum tersedia, tandai **PERLU KONFIRMASI**.
- Setiap panggilan AI memerlukan validasi input dan keluaran, timeout, pesan
  kegagalan yang jelas, serta fallback nyata yang tetap lokal. Pembatalan oleh
  pengguna bukan kegagalan yang harus memicu fallback. Jangan mengklaim fallback
  tersedia jika tidak ada jalur cadangan yang berfungsi.
- Seluruh teks antarmuka dan dokumen berbahasa Indonesia baku. Ikuti format cetak
  resmi proyek; jangan mengganti standar proyek dengan contoh PDF generik.

## Prosedur kerja

1. **Tetapkan alur dan batas perubahan.** Identifikasi apakah permintaan untuk
   Asisten AI/Teman Belajar, dokumen pembelajaran, Bank Soal, RAG, atau infrastruktur.
   Baca pemanggil, service AI, validator, UI, tes, dan instruksi/domain terkait.
   Telusuri prompt serta konteks yang benar-benar dikirim; jangan mengasumsikan
   alur-alur itu berbagi tujuan yang sama.
2. **Petakan pola referensi ke implementasi yang ada.** Gunakan
   [ringkasan arsitektur](./references/referensi-arsitektur-ai-modern.md) dan
   [peta Cetak Biru Integrasi Fitur AI](./references/cetak-biru-integrasi-fitur-ai.md).
   Catat pola yang bisa dipakai, konflik dengan aturan proyek, dan asumsi yang
   belum terbukti. Pertahankan dependensi dan pembagian tanggung jawab yang sudah
   ada kecuali perubahan arsitektur memang diminta.
3. **Pisahkan mode tutor dari pembuatan dokumen.** Untuk mode Teman Belajar yang
   diminta secara eksplisit, gunakan scaffolding bertahap: pahami kebutuhan siswa,
   beri petunjuk yang sesuai tingkatnya, lalu ajukan satu pertanyaan pemantik.
   Jangan langsung memberikan jawaban akhir untuk latihan siswa. Bersikap suportif,
   adaptif terhadap kebingungan, dan gunakan LaTeX bila membantu penjelasan rumus.
   Jangan menerapkan aturan “jangan memberi jawaban akhir” pada alur guru yang
   meminta draf RPE, ATP, modul, atau soal lengkap.
4. **Jaga kontrak permintaan AI.** Validasi identitas sesi, workflow yang diizinkan,
   panjang dan bentuk input, konfigurasi endpoint/model, serta sinyal pembatalan.
   Bangun prompt dengan konteks minimum yang relevan; hindari data pribadi yang tidak
   diperlukan. Jangan membentuk prompt dari HTML mentah atau mempercayai instruksi
   yang disisipkan dalam dokumen pengguna.
5. **Validasi keluaran sebelum dipakai.** Gunakan schema/validator yang sudah
   dipakai domain terkait. Untuk keluaran terstruktur, periksa bentuk, jumlah,
   batas panjang, konsistensi relasi, serta aturan domain; tolak respons kosong,
   rusak, tidak lengkap, atau tidak sesuai. Jangan menyimpan atau merender keluaran
   gagal sebagai hasil sukses.
6. **Tangani kegagalan secara nyata.** Terapkan timeout dan fallback model lokal
   sesuai workflow. Tampilkan pesan yang dapat ditindaklanjuti tanpa membocorkan
   prompt sensitif atau rahasia; simpan diagnostik teknis hanya sesuai praktik
   privasi proyek. Jika model utama dan cadangan gagal, pertahankan input pengguna
   dan tampilkan kegagalan secara eksplisit.
7. **Bangun UI dengan aman dan aksesibel.** Pertahankan indikator proses, status
   pembatalan, dan auto-scroll yang tidak mengganggu pembacaan pesan lama.
   Jika menambahkan streaming, proses framing/chunk secara benar dan propagasikan
   `AbortSignal` sampai ke request Ollama. Render respons sebagai teks aman atau
   Markdown yang disanitasi; jangan merender HTML mentah dari model.
8. **Lindungi data dan batas kepercayaan.** Jangan memperluas akses localhost,
   origin CORS, izin, penyimpanan, atau pengiriman dokumen tanpa alasan dan
   pengujian. RAG hanya boleh memakai dokumen yang memang dapat diakses pengguna;
   jelaskan sumber jawaban bila tersedia, dan jangan menyatakan hasil sebagai
   fakta pasti ketika konteks tidak cukup.
9. **Uji jalur sukses dan gagal.** Tambahkan atau jalankan tes untuk input tidak
   valid, respons model kosong/rusak, timeout, fallback, pembatalan, pergantian
   akun, serta batas privasi yang terdampak. Jalankan tes terfokus dan build yang
   relevan; catat hasil aktual, bukan hasil yang diasumsikan.
10. **Laporkan secara jujur.** Ringkas apa yang berubah, alasan, tes yang benar-benar
    dijalankan, risiko/batas verifikasi, dan setiap hal **PERLU KONFIRMASI**.

## Kriteria selesai

- Perubahan sesuai dengan instruksi workspace dan alur AI yang dituju.
- Tidak ada pengiriman prompt atau data AI ke layanan cloud maupun penyimpanan
  terpusat baru yang tidak disetujui.
- Validasi, timeout, error yang dapat dipahami, fallback lokal, dan pembatalan
  berperilaku sesuai kontrak.
- Respons terstruktur tidak digunakan sebelum tervalidasi; Markdown/HTML model
  tidak membuka injeksi konten.
- Tes relevan lulus atau kegagalan dan keterbatasannya dilaporkan.
