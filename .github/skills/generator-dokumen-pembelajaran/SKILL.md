---
name: generator-dokumen-pembelajaran
description: "Gunakan saat mengimplementasikan atau memperbaiki generator RPE, ATP, Prota, Prosem, KKTP, Modul Ajar, Modul Siswa, Bank Soal, atau Cover."
argument-hint: "<nama-dokumen>"
---

# Generator dokumen pembelajaran

Gunakan untuk satu jenis dokumen sesuai argumen, misalnya `/generator-dokumen-pembelajaran ATP`. Jangan memperluas cakupan ke dokumen lain pada iterasi yang sama.

## Langkah kerja

1. Baca file lama yang relevan di `D:\New folder (3)\` atau salinan `_legacy/` sebagai READ-ONLY, catat perilaku dan fungsi yang relevan, lalu cocokkan dengan baris di `docs/parity-matrix.md`. Jika sumber tidak tersedia, tulis **PERLU KONFIRMASI** dan minta sumber; jangan mereka-reka perilaku lama.
2. Ikuti alur sesuai jenis dokumen: form input → validasi → susun prompt dari template terpisah bila memakai AI → panggil AI dengan engine utama dan fallback nyata, atau mesin deterministik untuk RPE/Prota → validasi keluaran (tolak kosong/format rusak/tidak lengkap) → render format cetak → pratinjau → simpan riwayat → ekspor PDF.
3. Tangani kegagalan dengan pesan yang jelas bagi guru dan log teknis terpisah. Timeout dan gagalnya semua engine tidak boleh meninggalkan layar kosong atau menghilangkan masukan.
4. Ikuti pola kode: satu modul per dokumen, gunakan helper bersama tanpa duplikasi, dan jangan menanam data/konfigurasi yang semestinya berasal dari input atau sumber kanonis.
5. Untuk perubahan yang diminta pengguna, sampaikan ringkasan perilaku lama dan rencana implementasi 5–8 poin; bila diminta menunggu persetujuan, jangan mengubah kode sebelum persetujuan eksplisit.
6. Tambahkan tes jalur normal dan gagal; perbarui `docs/parity-matrix.md`; verifikasi pratinjau sama dengan hasil cetak/PDF.

## Definition of done

- Paritas lama dibuktikan atau gap/ketidakpastian dicatat secara eksplisit; keputusan penghapusan ada di matriks.
- Input, keluaran, timeout, fallback/determinisme, error, penyimpanan, dan ekspor diuji.
- Dokumen mengikuti [skill perencanaan-guru-standar](../perencanaan-guru-standar/SKILL.md), termasuk format cetak.
- Ringkasan akhir menyebut apa yang diubah, alasan, tes yang benar-benar dijalankan beserta hasilnya, dan batas verifikasi.
