# Struktur Prosem

**Sumber lama:** `4_Optimasi_Generate/08d_GenerateProsem.js`. Struktur bernomor dapat berbeda
menurut mode tampilan lama; gunakan judul/urutan konten dan bukan nomor bagian sebagai kontrak.

## Bagian dan matriks

- Identitas program, CP fase, serta tabel CP elemen: **Elemen | Capaian Pembelajaran**.
- Matriks semester dibagi menjadi tiga kelompok bulan (Ganjil: Juli–Desember; Genap:
  Januari–Juni), lalu digabung oleh sistem.
- Kolom matriks: **No | Semester | Unit Pembelajaran | Alur Tujuan Pembelajaran | Alokasi JP |
  Bulan | Minggu ke- | Keterangan**.
- Satu baris mewakili satu pekan atau kegiatan penilaian. Keterangan mencakup KBM efektif, UH di
  akhir unit, STS, SAS, cadangan remedial/pengayaan, atau presentasi proyek. Minggu diulang dari
  1 pada awal bulan; pekan tanpa TP ditulis “-”.
- Catatan pelaksanaan/penutup dan blok tanda tangan dipasang di akhir; versi tampilan tertentu
  menghilangkan catatan pelaksanaan.

Sumber jadwal ialah TP/unit dan alokasi Prota serta kalender/RPE; kode TP harus tetap sesuai ATP.
AI diminta memenuhi target JP per bagian. Sistem mencoba ulang matriks yang tidak lengkap dan
tidak menyimpan hasil yang masih gagal validasi; perilaku ini wajib dipertahankan.
