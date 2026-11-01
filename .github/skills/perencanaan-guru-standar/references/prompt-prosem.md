# Prompt Prosem

**Sumber lama:** `4_Optimasi_Generate/08d_GenerateProsem.js`. Prosem menggunakan AI untuk
identitas/CP, matriks tiga bagian bulanan, serta catatan/penutup; jadwal dan target berasal dari
data ATP/Prota/RPE.

## Spesifikasi prompt

Berikan hanya TP yang dijadwalkan pada irisan bulan tersebut, kode/unit persis dari ATP, target JP
bagian dari total semester, kalender, hari efektif, dan tugas asesmen yang relevan (UH, STS, SAS,
cadangan). Minta HTML satu tabel lengkap dengan kolom
**No | Semester | Unit | Alur TP | JP | Bulan | Minggu | Keterangan**, tanpa rowspan; satu baris
per pekan/kegiatan, minggu reset tiap bulan, tidak menciptakan kode TP baru.

Gabungkan tiga matriks dengan distribusi TP berurutan. Diagnosis kolom, kode, JP, bulan, dan
kelengkapan; coba ulang bagian yang gagal sekali. Jika tetap tidak lengkap, tampilkan peringatan,
jangan simpan dan jangan jadikan acuan Modul Ajar.
