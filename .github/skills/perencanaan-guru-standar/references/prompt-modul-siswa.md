# Prompt Modul Siswa

**Sumber lama:** `Script T/08h_GenerateModulSiswa.txt`; sembilan prompt khusus dibangun oleh
`susunPromptModulSiswa_`.

## Spesifikasi prompt

Berikan mapel, kelas, topik, TP, JP/durasi, level, tahun/penulis/sekolah, asesmen/profil Prosem,
dan metadata ATP. Minta hanya bagian yang ditugaskan; gunakan Bahasa Indonesia yang ramah siswa,
sapa “kalian”, jangan mengarang fakta atau kunci pada bagian latihan siswa.

Urutan sembilan bagian mengikuti `struktur-modul-siswa.md`; batas panjang dan pemisah halaman
harus diperhatikan. Setelah penggabungan, validasi tag HTML seimbang, cover depan/belakang,
daftar pustaka, dan kunci jawaban. Sumber lama mencoba melanjutkan maksimal dua kali tetapi tidak
menolak hasil yang tetap terpotong; implementasi baru wajib menolak dan mempertahankan draf.
