# Prompt ATP

**Sumber lama:** `4_Optimasi_Generate/08b_GenerateAtp.js`. Prompt lama meminta satu keluaran
HTML monolitik yang menggabungkan tiga kelompok instruksi secara berurutan.

## Spesifikasi prompt lama

**Konteks tervalidasi:** identitas/mapel/kelas/tahun, CP dan elemen resmi, JP per pekan/total,
kontrak kode TP, mode alokasi UH, serta konteks RPE bila tersedia.

**Instruksi keluaran:** HTML murni tanpa percakapan; salin CP persis; jangan mengarang identitas;
gunakan kode TP kontrak persis; alokasi integer dan konsisten; setiap unit memakai nomor modul
yang sama dengan nomor urut unit. Susun keenam bagian sesuai `struktur-atp.md` dan tutup dengan
blok tanda tangan.

**Validasi pascagenerasi:** marker ATP/HTML, kode TP wajib, struktur bagian, JP, semester, ukuran
keluaran, serta identitas/tanda tangan. Sumber lama memanggil mesin multi-provider tetapi memasang
`fallback: null`; implementasi baru harus menyediakan fallback nyata (misalnya editor/draf manual
atau renderer deterministik), bukan meniru kekurangan ini.

Prompt baru `promptAtp` menghasilkan JSON, bukan kontrak HTML lama; pemetaan JSON→enam bagian
harus lengkap sebelum paritas dinyatakan.
