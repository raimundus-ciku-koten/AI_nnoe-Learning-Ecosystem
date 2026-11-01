# Adaptasi Panduan Arsitektur Aplikasi AI Modern

Ringkasan ini disusun dari PDF pengguna **“Panduan Pengembang: Panduan Lengkap
Arsitektur & Fitur Aplikasi AI Modern”** (7 halaman). Dokumen tersebut memberi
contoh arsitektur produksi generik; ringkasan ini mempertahankan ide yang relevan
dan menandai bagian yang tidak boleh dipindahkan begitu saja ke AI_nnoe.

## Pola yang dapat diadaptasi

| Topik pada PDF | Prinsip yang berguna untuk AI_nnoe | Syarat adaptasi |
|---|---|---|
| UI percakapan React, indikator proses, dan auto-scroll (hlm. 1–2) | Beri umpan balik saat model bekerja, jaga fokus, dan bantu pengguna mengikuti percakapan. | Pertahankan pola komponen dan aksesibilitas yang sudah ada. Auto-scroll tidak boleh memaksa pengguna turun saat membaca pesan lama. |
| Markdown aman (hlm. 2) | Perlakukan semua keluaran model sebagai konten tak tepercaya. | PDF mencampur `rehypeRaw` dan sanitasi; jangan aktifkan HTML mentah secara default. Pilih rendering teks/Markdown dengan allowlist yang aman dan uji tautan, atribut, serta kode. |
| Validasi input, verifikasi identitas, dan pembatasan laju (hlm. 2–3) | Validasi di batas kepercayaan dan beri batas penggunaan yang sesuai. | Endpoint Ollama browser saat ini harus tetap loopback. JWT middleware Express pada PDF bukan bukti bahwa proyek membutuhkan server AI baru. Terapkan auth/rate limit server hanya jika backend baru disetujui. |
| Structured output untuk soal (hlm. 3) | Tetapkan kontrak keluaran dan validasi sebelum hasil ditampilkan, disimpan, atau diekspor. | Gunakan validator/schema domain yang sudah tersedia. Contoh Zod/LangChain dan Taksonomi Bloom adalah opsi, bukan dependensi atau aturan konten wajib. |
| Tutor Sokratik dan scaffolding (hlm. 4) | Untuk pengalaman Teman Belajar, bantu siswa bernalar melalui petunjuk bertahap, analogi yang sesuai, dan pertanyaan pemantik. | Berlaku hanya pada mode tutor. Alur guru untuk menghasilkan dokumen atau soal harus tetap memenuhi format keluaran yang diminta. Jangan mengarang konteks siswa atau tingkat kemampuan. |
| Ingestion PDF, chunking, embeddings, dan retrieval (hlm. 4–5) | RAG dapat membatasi jawaban pada sumber yang benar-benar tersedia. | PDF memberi contoh ukuran chunk 1.000 karakter/overlap 200 dan `nomic-embed-text`; angka serta model itu bukan keputusan proyek. Jangan memakai Supabase Vector Store atau mengirim dokumen ke cloud tanpa persetujuan eksplisit dan pemeriksaan privasi. |
| Streaming NDJSON dan pembatalan (hlm. 1, 5–6) | Pembatalan perlu menghentikan pekerjaan, bukan hanya menyembunyikan indikator UI. | Propagasikan sinyal abort ke request Ollama. Jika menambahkan streaming, pertahankan framing yang aman dan bersihkan state saat batal. Jangan menambahkan endpoint Express hanya untuk meniru contoh. |
| Chat history, tabel Supabase, dan RLS (hlm. 1, 5–6) | Percakapan memerlukan isolasi, kontrol retensi, serta akses yang dapat dijelaskan. | Contoh tabel/RLS memakai asumsi produk berbeda dan tidak boleh disalin. Ikuti aturan proyek tentang data milik pengguna; riwayat baru perlu keputusan lokasi, enkripsi, retensi, ekspor, dan penghapusan sebelum implementasi. |
| Render dokumen PDF (hlm. 7) | Pisahkan konten terstruktur dari presentasi dan verifikasi hasil akhir. | Gunakan aturan cetak proyek: Times New Roman 12, judul 14, tabel 11, header-meta 9, spasi 1, footer hanya kanan bawah, dan kop sekolah opsional. Pratinjau harus cocok dengan hasil cetak/PDF. |
| Konfigurasi produksi dan rahasia (hlm. 7) | Pisahkan konfigurasi lingkungan dan jangan menaruh rahasia pada frontend. | AI_nnoe memakai AI lokal; jangan menambah service key, JWT secret, atau kunci provider ke bundel klien. Jangan menambahkan infrastruktur berbiaya owner. |

## Konflik penting dengan batas proyek

PDF mengusulkan Express, LangChain, Supabase PostgreSQL/Auth/RLS, riwayat chat
terpusat, tabel kuis publik, pgvector, dan deployment Nginx. Semua itu merupakan
contoh alternatif arsitektur, bukan persyaratan AI_nnoe. Instruksi workspace
menetapkan AI lokal/BYOK, data penggunaan tetap dalam kendali pengguna, larangan
billing tak disengaja, dan aplikasi tidak bergantung pada database owner untuk
data pengguna. Karena itu:

1. Pertahankan Ollama lokal dan alur yang sudah ada; jangan menambah AI cloud.
2. Jangan memindahkan prompt, dokumen, riwayat, atau embeddings ke Supabase atau
   server owner tanpa persetujuan yang eksplisit.
3. Jangan menambah dependency/backend/schema hanya untuk mengikuti diagram PDF.
   Jika permintaan mengharuskan perubahan tersebut, hentikan implementasi bagian
   itu dan tandai **PERLU KONFIRMASI**.
4. Jangan menyalin SQL, kebijakan RLS, contoh rahasia, konfigurasi CORS, atau
   prompt kode PDF tanpa audit terhadap desain serta implementasi aktual.

## Asal-usul dan tingkat kepastian

- PDF menjadi sumber pola konseptual dan contoh teknis pada halaman yang disebut
  di tabel; kode di PDF bukan bukti bahwa komponen tersebut sudah ada atau cocok
  untuk repositori ini.
- Kondisi AI_nnoe harus dibuktikan ulang dari kode terkini sebelum setiap
  perubahan. Perbedaan antara dokumentasi, konfigurasi deployment, dan runtime
  yang belum dapat diverifikasi tetap **PERLU KONFIRMASI**.
- Jangan menyalin teks atau implementasi panjang dari PDF. Gunakan ringkasan ini
  sebagai panduan adaptasi, lalu rujuk sumber kode dan instruksi proyek sebagai
  acuan implementasi.
