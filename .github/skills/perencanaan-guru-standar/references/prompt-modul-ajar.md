# Prompt Modul Ajar

**Sumber lama:** `4_Optimasi_Generate/08e_GenerateModul.js`. Konten AI dipecah menjadi kelompok
bagian dan pertemuan; format prompt rinci dibangun dari konteks unit, sintaks model, durasi, TP,
dan kebutuhan asesmen.

## Spesifikasi prompt

Konteks harus memuat CP/TP ATP, unit, alokasi Prota/Prosem, model pembelajaran, fase/kelas,
pertemuan, sarpras, dimensi profil, serta identitas resmi yang tersedia. Minta satu bagian yang
ditugaskan saja, dengan marker stabil untuk digabung; kegiatan harus konkret dan waktunya
konsisten dengan JP.

Bangun struktur bagian I–V dan lampiran sesuai `struktur-modul-ajar.md`. Validasi marker/kunci
bagian wajib, jumlah pertemuan, kode TP, tabel/soal, dan total durasi. Regenerasi bagian hilang;
jangan menyatakan lengkap bila placeholder “[Belum terisi otomatis.]” masih muncul.
