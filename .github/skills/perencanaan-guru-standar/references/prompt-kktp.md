# Prompt KKTP

**Sumber lama:** `4_Optimasi_Generate/08f_GenerateKktp.js`.

## Spesifikasi prompt

Berikan identitas resmi dan kontrak kode TP/rumusan ATP. Minta satu keluaran HTML lengkap dengan
identitas, landasan/prinsip, satu baris per TP, rubrik umum, konversi capaian, dan tanda tangan.
Gunakan kode TP persis; indikator harus teramati dan spesifik mapel/fase. Pada tabel per TP,
kolom lama adalah **No | Kode TP | Tujuan | Indikator | Bentuk Asesmen | Belum Berkembang |
Berkembang | Mahir | Tindak Lanjut**.

Validasi seluruh kode terhadap ATP. Bila kode asing, lakukan satu perbaikan terarah. Bila AI gagal,
gunakan fallback deterministik lama yang mempertahankan semua TP dan tandai konten generik sebagai
fallback agar guru meninjau. Schema baru menggunakan rubrik empat tingkat dan belum cocok penuh
dengan kontrak lama tiga kategori pada tabel TP.
