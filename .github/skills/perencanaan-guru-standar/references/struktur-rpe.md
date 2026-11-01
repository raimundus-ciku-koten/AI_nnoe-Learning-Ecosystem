# Struktur RPE

**Sumber lama:** `4_Optimasi_Generate/08f_GenerateRpe.js` (baca-saja). Generator membangun
naskah deterministik; AI polish opsional dan nonaktif secara bawaan.

## Urutan dan komponen

1. Identitas: satuan pendidikan, mata pelajaran, kelas/fase, tahun pelajaran, guru, JP per pekan,
   hari pembelajaran, total JP tahun; catatan kelas akhir jika berlaku.
2. Landasan penyusunan.
3. Landasan hitung dan rumus jumlah JP tahunan.
4. Pekan efektif Semester Ganjil, diikuti daftar pekan tidak efektif Ganjil.
5. Pekan efektif Semester Genap, diikuti daftar pekan tidak efektif Genap.
6. Distribusi jam per semester dan rekapitulasi tahunan.
7. Penutup dan pengesahan/tanda tangan.

## Kolom tabel lama

- Pekan efektif per semester: **No | Bulan | Pekan | Tanggal | Status | JP | Keterangan**.
- Pekan tidak efektif: **No | Pekan | Tanggal pekan | Hari pembelajaran yang libur | Alasan tidak efektif**.
- Distribusi: **Semester | Pekan efektif | Pekan tidak efektif | JP/pekan | Total JP**.
- Rekap tahunan: dua kolom **Kategori | Jumlah**; total JP adalah jumlah JP kedua semester.

Keterangan kalender hanya menandai pekan tidak efektif bila seluruh hari pembelajaran yang diinput
berimpit dengan hari tidak efektif. Standar format cetak proyek tetap berlaku; CSS legacy RPE
memiliki penyimpangan tipografi yang dicatat di `docs/parity-matrix.md`.
