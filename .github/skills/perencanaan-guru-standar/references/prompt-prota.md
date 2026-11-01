# Prompt Prota

**Tidak memakai prompt AI:** `4_Optimasi_Generate/08c_GenerateProta.js` menghitung dan merender
Prota deterministik.

## Spesifikasi mesin lama

Ambil TP dari Peta Sebaran ATP; bila kosong, coba Bank TP lalu cache ATP. Prioritaskan Total JP
yang dimasukkan guru; jangan menimpa dengan cache. Hitung satu UH per modul dan distribusikan JP
TP sehingga **ΣJP TP + ΣUH = Total JP** tepat. Jika sumber TP, JP, atau kapasitas tidak valid,
kembalikan pesan gagal yang dapat ditindaklanjuti; jangan membuat konten AI sebagai cadangan.

Rakit tujuh bagian sesuai `struktur-prota.md`, lalu validasi seluruh jumlah sebelum simpan.
