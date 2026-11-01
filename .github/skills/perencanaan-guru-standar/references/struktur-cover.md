# Struktur Cover

**Sumber lama:** `Script T/08i_GenerateCover.txt`.

## Cover lama

- Dua halaman A4 (210 × 297 mm): depan dan belakang, masing-masing section dengan pemisah halaman.
- Depan: label perangkat pembelajaran, judul, mapel/kelas, tahun, ilustrasi tematik, tingkat
  satuan pendidikan, sekolah, penyusun, dan Kurikulum Merdeka.
- Belakang: judul/mapel/kelas, paragraf ringkas, tabel metadata **Mapel | Kelas/Fase | Tahun |
  Penyusun | Sekolah**, serta aksen dekoratif.
- HTML/SVG tersedia sebagai pola teks; mode gambar AI hanya dipanggil jika diminta eksplisit.
  Mode teks memvalidasi dua section dan mencoba ulang sekali jika terpotong.

Mapel dan kelas wajib; identitas sekolah/tahun/guru bersumber dari input. Kode lama mengembalikan
gagal bila AI tidak tersedia dan tidak membangun cover lokal otomatis. Kop sekolah tetap opsional
sesuai standar proyek; bila tidak ada, jangan mengarangnya. Padanan mandiri baru belum ditemukan.
