# Struktur Bank Soal

**Sumber lama:** `Script T/08g_GenerateBankSoal.txt`.

## Input dan struktur

- Metadata: kategori (ulangan, latihan, tugas, PTS, ujian/PAS/PAT, persiapan TKA), judul, topik,
  mapel, kelas, jenis soal, level LOT–MOT–HOT, jumlah PG (1–50; default lama 15), dan uraian
  (0–20; default lama 5).
- Bagian **SOAL**: tepat jumlah yang diminta; pilihan ganda memakai opsi A–D dan pengecoh
  plausibel; butir uraian bernomor terpisah.
- Bagian **PEMBAHASAN**: kunci dan langkah pembahasan untuk setiap nomor; “Cara Cepat” opsional.
- Tanda tangan di akhir; hasil disimpan dan diekspor ke PDF.

Kode lama mengirim soal dan pembahasan sebagai dua bagian AI. Jumlah dan pasangan kunci harus
divalidasi sebelum dokumen disimpan; prompt saja bukan validasi. Rute baru yang menghasilkan satu
soal belum setara dengan Bank Soal penuh.
