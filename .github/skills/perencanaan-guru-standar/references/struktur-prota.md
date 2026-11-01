# Struktur Prota

**Sumber lama:** `4_Optimasi_Generate/08c_GenerateProta.js` (deterministik, baca-saja).

## Urutan lama

1. Informasi umum/komponen program dan analisis pekan efektif.
2. Distribusi alokasi waktu tahunan per modul.
3. Program Semester Ganjil.
4. Program Semester Genap.
5. Matriks Program Tahunan.
6. Rekapitulasi alokasi waktu tahunan.
7. Catatan pelaksanaan dan saran praktis, lalu tanda tangan.

## Tabel dan aturan hitung

- Analisis pekan efektif: **No | Komponen | Semester Ganjil | Semester Genap | Jumlah**.
- Distribusi tahunan: **No | Modul/Unit Pembelajaran | JP Ganjil | JP Genap | UH Ganjil | UH Genap | Subtotal JP**.
- Tiap Program Semester: **No | Kode TP | Tujuan Pembelajaran | Materi Esensial | Alokasi JP |
  Pekan Ke- | Modul | Strategi Asesmen**; satu baris UH menutup tiap modul.
- Matriks Prota: **No | Semester | Elemen/CP | Bab/Materi Pokok | Alokasi Waktu (JP) |
  Catatan/Keterangan Pembelajaran**.
- Rekap: **Kategori Alokasi Waktu | Jumlah JP**.

TP dipilih berurutan dari Peta Sebaran ATP, lalu Bank TP, lalu cache ATP. Total JP yang diinput
guru adalah sumber kebenaran: **ΣJP TP + ΣJP UH = Total JP tahunan**, dengan satu pertemuan UH per
modul. Prota tidak menggunakan AI untuk menyusun naskah.
