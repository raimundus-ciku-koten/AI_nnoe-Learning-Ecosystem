# Prompt Cover

**Sumber lama:** `Script T/08i_GenerateCover.txt`. Mode teks meminta HTML dua halaman; mode gambar
hanya berjalan jika diminta eksplisit.

## Spesifikasi prompt mode teks

Berikan mapel dan kelas yang tervalidasi, serta tahun, guru, sekolah, dan tingkat satuan pendidikan
hanya bila tersedia. Minta dua section A4 `cover-front` dan `cover-back`, tanpa CSS dobel, tanpa
markdown, tanpa nomor halaman atau merek AI. Cover belakang memuat ringkasan dan tabel metadata.
Ilustrasi boleh SVG inline statis; jangan memakai gambar animasi.

Validasi tepat dua section seimbang, kelas CSS depan/belakang, panjang minimum, metadata yang
bersumber dari input, dan hasil A4. Coba ulang keluaran terpotong satu kali; jika AI gagal, tampilkan
template lokal deterministik (peningkatan wajib—sumber lama tidak membangunnya pada jalur fallback).
