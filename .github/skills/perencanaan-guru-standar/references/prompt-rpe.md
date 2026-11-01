# Prompt RPE

**Tidak ada prompt AI utama pada sumber lama:** `4_Optimasi_Generate/08f_GenerateRpe.js`
membangun naskah RPE deterministik. AI polish opsional nonaktif secara bawaan.

## Template implementasi yang setara

Jangan meminta AI menghitung RPE. Bangun hasil dari input tervalidasi: rentang semester, hari
pembelajaran, kalender libur/kegiatan, JP per pekan, identitas, dan tahun ajaran. Jika AI polish
diaktifkan kemudian, berikan naskah kanonik sebagai input dan larang perubahan tanggal, status
pekan, JP, tabel, identitas, atau tanda tangan; bila hasil gagal validasi, gunakan naskah kanonik.

Konfigurasi hari libur dan tahun ajaran harus berasal dari input/sumber resmi, bukan tebakan.
