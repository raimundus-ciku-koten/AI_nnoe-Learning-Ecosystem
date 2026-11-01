# Adaptasi Cetak Biru Integrasi Fitur AI

Dokumen ini memetakan **AI_nnoe — Cetak Biru Integrasi Fitur AI Multi-Platform,
versi 1.0, 1 November 2026** ke aplikasi yang ada. PDF adalah acuan kapabilitas
dan kriteria penerimaan, bukan mandat untuk menyalin arsitektur atau kode contoh.
Status di bawah diverifikasi terhadap implementasi lokal pada 1 November 2026.

## Pemetaan empat pilar

| Pilar dan acuan | Status pada aplikasi | Adaptasi dan batas yang berlaku |
|---|---|---|
| **1. Reasoning Engine** — Bab 6, T-01–T-04, T-13 | Sebagian. Teman Belajar menggunakan prompt Sokratik, aliran NDJSON Ollama, pembatalan, dan model cadangan lokal. Parser baru memisahkan serta membuang blok `<think>` dari jawaban, termasuk saat tag terpotong atau tidak ditutup. | Aliran NDJSON langsung ke Ollama dipertahankan, bukan SSE melalui Express. Catatan penalaran mentah tidak ditampilkan kepada siswa maupun guru; hak akses di klien bukan kontrol server yang otoritatif. Panel penalaran guru hanya dapat dipertimbangkan setelah batas akses server dan kebijakan kontennya diputuskan. |
| **2. Multimodal dan perangkat bantu** — Bab 7, T-05–T-08 | Sebagian. PDF berbasis teks diindeks dan dicari lokal; halaman sumber disertakan dalam konteks dan daftar sumber. Prompt meminta sitasi inline hanya dari sumber yang ditemukan. | Retrieval saat ini leksikal/BM25, bukan embedding. Batas PDF lokal 10 MB, lebih ketat daripada batas indikatif PDF. Vision, SearXNG, eksekusi alat, OCR, dan unggah ke server belum tersedia. Dokumen dan indeks tetap di browser; hanya potongan yang cocok dikirim ke Ollama localhost. |
| **3. Visual dan desain** — Bab 8, T-09, T-11, T-12 | Sebagian/terbatas. Aplikasi memiliki renderer cover dan format cetak Bank Soal; generator Bank Soal memvalidasi konteks, opsi, rasionalisasi, dan tingkat Bloom C4–C6 untuk HOTS. Sanitizer SVG ber-allowlist tersedia pada panel artifact. | Design JSON yang dihasilkan AI, koreksi kontras otomatis, dan ekspor PDF headless belum tersedia. Format cetak dokumen pembelajaran yang berlaku tetap standar proyek, bukan format generik contoh PDF. |
| **4. Artifacts Panel** — Bab 9, T-10, T-15 | Sebagian. Protokol streaming mengekstrak artifact Markdown, HTML, SVG, kuis, dan kode; kuis divalidasi sebelum dirender; HTML memakai iframe sandbox tanpa skrip/akses induk dengan CSP; SVG dibatasi allowlist dan telah diuji di browser terhadap tag aktif, event handler, dan referensi paint eksternal; revisi ber-ID sama dapat dipilih selama percakapan masih di memori. | Design JSON dan penyimpanan versi persisten belum tersedia. Artifacts bersifat sementara dan hilang saat percakapan direset atau halaman ditutup. Isolasi iframe HTML dan keseluruhan kontrol T-10 masih memerlukan uji browser keamanan end-to-end sebelum dinyatakan siap produksi. |

## Kontrol lintas-pilar

- Ollama localhost, timeout, validasi prompt/hasil, pesan gagal yang dapat
  ditindaklanjuti, fallback model lokal, dan pembatalan adalah jalur AI yang
  digunakan. Tidak ada AI provider cloud atau penyimpanan prompt/percakapan
  terpusat baru.
- Autentikasi aplikasi memakai BFF serverless yang ada. Server Vite biasa tidak
  menjalankan fungsi `api/`; pengujian login lokal perlu runtime Vercel yang
  dikonfigurasi. Jangan menyamarkan respons HTML fallback sebagai sesi anonim
  atau menganggap pengujian login berhasil.
- SSE/Express/LangChain, vector store, analisis gambar, pencarian web, panel
  Design JSON, serta penyimpanan versi persisten memerlukan keputusan arsitektur,
  ancaman, privasi, dan operasional masing-masing. Jangan menambah dependensi,
  layanan berbiaya, atau skema server hanya karena tercantum di PDF.
- Angka target PDF (TTFT, akurasi parser, ukuran berkas, dan beban serentak)
  adalah sasaran usulan; jangan mengklaim tercapai sebelum ada pengukuran dan
  pengujian yang sesuai.
- Daftar periksa go-live Bab 13 dan Lampiran C belum dianggap terpenuhi hanya
  karena build lokal lulus. Uji hosted, autentikasi, beban, privasi, dan
  konfigurasi produksi tetap diperlukan.

## Urutan adaptasi

1. Pertahankan jalur lokal yang sudah aman; tutup kebocoran konten model,
   pertegas sitasi halaman RAG, dan uji penghentian/fallback.
2. Pertahankan artifact kuis/Markdown/HTML/SVG/kode lokal dengan validasi dan
   renderer terkendali; uji isolasi sandbox end-to-end dan perluas pengujian
   input SVG adversarial sebelum rilis.
3. Pertimbangkan vision dan pencarian web hanya setelah validasi unggahan,
   isolasi lokal, timeout, dan pengendalian jaringan selesai.
4. Tunda Design JSON, vector store, SSE/Express, riwayat terpusat, dan fitur
   berbiaya sampai ada persetujuan eksplisit dan rencana pengujian produksi.

Jika kebutuhan mengharuskan mengubah batas lokal atau mengaktifkan fitur yang
belum memiliki kontrol tersebut, tandai **PERLU KONFIRMASI** dan jangan
mengklaim siap produksi.
