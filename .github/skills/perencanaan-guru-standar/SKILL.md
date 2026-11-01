---
name: perencanaan-guru-standar
description: "Gunakan saat membuat, mengubah, atau meninjau menu perencanaan guru atau dokumen RPE, ATP, Prota, Prosem, KKTP, Modul Ajar, Modul Siswa, Bank Soal, Cover."
---

# Standar perencanaan guru

Gunakan skill ini sebagai acuan tunggal untuk struktur, konten, dan format dokumen perencanaan. Kode lama bersifat READ-ONLY. Cocokkan setiap perubahan dengan `docs/parity-matrix.md`.

## Rantai dokumen dan pewarisan data

Sumber lama yang diaudit berada di `D:\New folder (3)\` dan bersifat READ-ONLY. Urutan kerja yang
terbukti dari generator adalah **RPE → ATP → Prota → Prosem**; cabang ATP → KKTP dan
ATP/Prota/Prosem → Modul Ajar. Modul Siswa memakai metadata JP, asesmen/profil Prosem, dan
metadata ATP. Cover memakai identitas dokumen; Bank Soal menerima topik/TP sebagai konteks.

- RPE menghitung kalender, hari belajar, pekan efektif, JP semester/tahunan, lalu menyimpan cache JP.
- ATP memakai CP, kontrak kode TP, dan konteks RPE; menyimpan Peta Sebaran/Bank TP/cache yang
  dipakai generator turunan.
- Prota memilih TP dari Peta Sebaran ATP, lalu Bank TP, lalu cache ATP. Total JP dari input guru
  adalah sumber kebenaran; ΣJP TP + ΣJP UH harus sama tepat dengan Total JP.
- Prosem memakai TP/unit dan alokasi Prota serta kalender/RPE. KKTP memakai daftar kode/rumusan TP ATP.
- Modul Ajar memakai ATP/Prota/Prosem; Modul Siswa memakai metadata ATP/Prosem untuk konteks belajar.
- Kode baru menyimpan revisi/prasyarat di `web/src/domain/perencanaan/constants.js`; jangan
  menganggap setiap hubungan rev ini identik dengan cache legacy. Perubahan sumber harus
  menginvalidasi dokumen turunan dan sinkronisasi ulang dilakukan sebelum pratinjau/simpan/ekspor.
- Batas runtime, permission tenant, retensi aktual, atau perilaku yang tidak tertulis tetap
  **PERLU KONFIRMASI**. Temuan sementara ada di `docs/parity-matrix.md`.

## Struktur dan prompt per dokumen

Baca referensi sebelum menyusun atau mengubah generator:

| Dokumen | Struktur baku | Prompt AI |
|---|---|---|
| RPE | [struktur-rpe.md](./references/struktur-rpe.md) | [prompt-rpe.md](./references/prompt-rpe.md) |
| ATP | [struktur-atp.md](./references/struktur-atp.md) | [prompt-atp.md](./references/prompt-atp.md) |
| Prota | [struktur-prota.md](./references/struktur-prota.md) | [prompt-prota.md](./references/prompt-prota.md) |
| Prosem | [struktur-prosem.md](./references/struktur-prosem.md) | [prompt-prosem.md](./references/prompt-prosem.md) |
| KKTP | [struktur-kktp.md](./references/struktur-kktp.md) | [prompt-kktp.md](./references/prompt-kktp.md) |
| Modul Ajar | [struktur-modul-ajar.md](./references/struktur-modul-ajar.md) | [prompt-modul-ajar.md](./references/prompt-modul-ajar.md) |
| Modul Siswa | [struktur-modul-siswa.md](./references/struktur-modul-siswa.md) | [prompt-modul-siswa.md](./references/prompt-modul-siswa.md) |
| Bank Soal | [struktur-bank-soal.md](./references/struktur-bank-soal.md) | [prompt-bank-soal.md](./references/prompt-bank-soal.md) |
| Cover | [struktur-cover.md](./references/struktur-cover.md) | [prompt-cover.md](./references/prompt-cover.md) |

Referensi merangkum struktur dan instruksi yang terbukti dari berkas sumber lama. Itu bukan
salinan prompt verbatim. Bila bentuk keluaran bervariasi menurut versi/konfigurasi, atau perilaku
runtime belum diperiksa, pertahankan label **PERLU KONFIRMASI** dan minta keputusan pemilik.

## Aturan format cetak

- Standar proyek (otoritatif): Times New Roman 12 pt; judul 14 pt; isi tabel 11 pt; header-meta 9 pt; spasi 1.
- Catatan kaki hanya di kanan bawah halaman. Kop sekolah opsional: jika belum diunggah, sisakan kosong.
- CSS lama memiliki override yang menyimpang (lihat `docs/parity-matrix.md`); jangan menyalin
  penyimpangan itu ke kode baru. Pratinjau harus sama dengan hasil cetak/PDF; jangan mengklaim
  kesetaraan sebelum meninjau hasil cetak.

## Aturan konten

- Gunakan Bahasa Indonesia baku, istilah yang konsisten, dan kalimat yang dapat dipahami guru.
- Jangan mengarang nama sekolah, nama/NIP guru atau kepala sekolah, tanggal, nomor peraturan, CP, atau data lain. Tampilkan kosong atau minta konfirmasi.
- Pertahankan teks sumber CP/TP yang kanonis; jangan mengubahnya saat menurunkan dokumen.
- Jumlah jam pelajaran, pekan efektif, semester, TP, asesmen, dan jadwal harus konsisten pada seluruh dokumen terkait.
- Setiap pemanggilan AI memerlukan validasi input, timeout, pesan error yang jelas bagi pengguna, dan engine cadangan. Jangan letakkan kunci API di kode klien.

## Checklist mutu

- [ ] Struktur dan urutan cocok dengan sumber lama atau ditandai **PERLU KONFIRMASI**.
- [ ] Sumber data dan prasyarat dokumen benar; perubahan sumber menginvalidasi dokumen turunan terkait.
- [ ] Tidak ada data identitas/tanggal/nomor resmi yang dikarang.
- [ ] Input serta keluaran AI tervalidasi; jalur timeout, kosong, rusak, dan semua-provider-gagal ditangani dengan fallback nyata. Jangan menganggap `fallback: null` sebagai fallback.
- [ ] Bahasa, tipografi, tabel, kop opsional, pemenggalan halaman, dan footer sesuai aturan.
- [ ] Pratinjau dibandingkan dengan hasil cetak/PDF dan riwayat tersimpan.
- [ ] Perilaku lama, peningkatan, tes, dan status pada `docs/parity-matrix.md` dilaporkan.
