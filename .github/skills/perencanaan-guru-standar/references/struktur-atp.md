# Struktur ATP

**Sumber lama:** `4_Optimasi_Generate/08b_GenerateAtp.js` (v12.2, baca-saja).
Keluaran lama adalah satu naskah HTML monolitik dengan enam bagian.

## Urutan dan tabel wajib

1. **Informasi Umum & Capaian Pembelajaran:** identitas dua kolom (mapel, fase, kelas, sekolah,
   tahun pelajaran, JP/pekan, total JP tahun); narasi CP fase; tabel **No | Domain/Elemen |
   Deskripsi CP**.
2. **Penurunan Capaian Menjadi Tujuan Pembelajaran:** tabel terpisah per elemen,
   **Unit Pembelajaran | Kode TP | Rumusan TP terukur | Nomor Modul**. Nomor modul adalah nomor
   urut unit; semua kode mengikuti kontrak TP.
3. **Rasionalisasi dan Rancangan Unit Pembelajaran:** rasionalisasi 1–2 paragraf; tiap unit punya
   tabel **Komponen Unit | Deskripsi Unit Pembelajaran** (tujuan, domain/elemen, alokasi waktu,
   kata kunci, isi/proses, dimensi profil lulusan, glosarium), lalu tabel distribusi
   **Kode | TP | Materi Pokok | JP | Modul**. Mode lama dapat menambahkan satu baris UH per unit.
4. **Matriks ATP Ringkas:** **No | Kode TP | Elemen | Tujuan Pembelajaran | Materi Esensial |
   Dimensi Profil Lulusan | Alokasi JP | Nomor Modul | Strategi Asesmen**.
5. **Pembagian Alur per Semester:** **Semester | Unit/Modul | Kode TP terkait | JP pembelajaran |
   Cadangan UH (JP) | Subtotal JP**.
6. **Rekap Alokasi Waktu Tahunan:** rekap JP TP per semester, UH Ganjil/Genap/total, subtotal
   kedua semester, total tahunan, lalu blok tanda tangan.

Kontrak TP, CP, JP/pekan, total JP, mode UH, dan RPE adalah data sumber; jangan membiarkan AI
menciptakan ulang kode atau mengubah CP kanonis. Pemeriksaan proyek Apps Script yang ditautkan
mengonfirmasi mode bawaan `perUnit`: satu UH tiap unit sebesar JP/pekan. Rekonsiliasi memakai
sisa total JP RPE untuk TP; bila tidak ada baris UH, ia beralih ke kontrak UH tahunan. Mode
kontrak membuang UH per unit dan membagi cadangan tahunan antara semester. Mesin baru memakai
aturan `perUnit` ATP melalui `hitungAnggaranAtp`. Rumus Prota lama berbeda: JP UH per modul
diturunkan dari JP/pekan dibagi jumlah hari belajar dan dibatasi agar alokasi masih muat; mesin
baru mempertahankan rumus itu secara terpisah di Prota. Algoritme fallback kontrak dan pembagian
sisa JP yang tidak habis dibagi JP/pekan masih perlu dibandingkan.

Sumber Apps Script memuat katalog CP statis per mata pelajaran/fase pada `09a–09s_Help*.gs`;
`09z_RegistryMapelCP.gs` membaca `CP_STATIS` dan cache `CacheCP`. Hubungan antara katalog
per-mapel dan objek registry `CP_STATIS` tidak tampak pada model yang diperiksa:
**PERLU KONFIRMASI**. Kode baru saat ini mengimpor CP dari PDF yang dipilih guru, belum dari
katalog statis tersebut. Renderer baru menampilkan enam bagian dan kolom matriks. Narasi CP
fase agregat tidak disalin karena isinya tidak tersedia di sumber yang diperiksa:
**PERLU KONFIRMASI**. Lihat gap JP/UH dan validasi hasil cetak di `docs/parity-matrix.md`.
