---
name: qa-paritas-kode-lama
description: "Gunakan saat meninjau, menguji, atau menyatakan sebuah fitur perencanaan guru selesai atau setara kode lama."
---

# QA paritas kode lama

## Prosedur verifikasi

1. Baca baris terkait di `docs/parity-matrix.md`; verifikasi perilaku lama terhadap sumber READ-ONLY di `D:\New folder (3)\` (atau `_legacy/`) dan padanan baru terhadap file/fungsi, bukan dugaan.
2. Baca implementasi baru dan telusuri jalur pengguna, penyimpanan, akses, generator, pratinjau, serta ekspor yang relevan.
3. Jalankan tes terfokus yang mencakup jalur normal dan gagal. Jalankan tes proyek dan build yang relevan; catat perintah dan hasil aktual.
4. Periksa regresi, konsistensi data sumber/JP, privasi, otorisasi, penanganan kegagalan AI, dan kesamaan pratinjau dengan cetak.
5. Perbarui matriks hanya dengan bukti. Bedakan perilaku yang terlihat di kode dengan konfigurasi/permission produksi; jika salah satunya tidak tersedia, tandai **PERLU KONFIRMASI**.

## Kriteria

- **Setara:** semua perilaku lama yang terinventaris memiliki padanan baru yang teruji; struktur, data, akses, dan hasil cetak penting tidak hilang.
- **Lebih baik:** memenuhi kriteria setara dan menambahkan peningkatan teruji tanpa mengubah perilaku lama secara diam-diam.
- Bukti berupa nama file dan fungsi/komponen spesifik serta tes yang dijalankan. Menu atau keberadaan file saja bukan bukti alur bekerja.

## Format laporan temuan

- **Kritis:** kehilangan/akses tanpa izin atas data, hasil dokumen salah yang berisiko dipakai, atau kegagalan yang memblokir alur utama.
- **Penting:** paritas wajib tidak lengkap, sinkronisasi atau hasil cetak salah, atau jalur gagal utama tidak ditangani.
- **Saran:** peningkatan mutu non-blocking dengan risiko dan manfaat yang jelas.

Untuk tiap temuan sebutkan prioritas, fitur, file/fungsi, bukti atau langkah reproduksi, dampak, dan rekomendasi. Pisahkan temuan terkonfirmasi dari hal **PERLU KONFIRMASI**.

## Larangan

Jangan mengklaim lulus, setara, atau lebih baik tanpa benar-benar menjalankan tes yang relevan dan membaca hasilnya. Jangan mengubah `_legacy/`. Jangan mengarang hasil build, tes, atau perilaku yang tidak dapat dibuktikan.
