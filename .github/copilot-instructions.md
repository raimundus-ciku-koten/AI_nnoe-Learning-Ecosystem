# Instruksi Copilot untuk AI_nnoe Learning Ecosystem

## Konteks proyek
Aplikasi web perencanaan pembelajaran untuk guru (Kurikulum Merdeka) yang menghasilkan
RPE, ATP, Prota, Prosem, KKTP, Modul Ajar, Modul Siswa, Bank Soal, dan Cover dengan bantuan AI.
Kode lama yang diberikan untuk audit berada di `D:\New folder (3)\` (READ-ONLY, hanya referensi);
repositori ini belum memiliki salinan `_legacy/`. Jika salinan `_legacy/` tersedia, perlakukan
seluruhnya sebagai READ-ONLY. Kode baru ada di `web/`.

## Aturan wajib
- Jangan mengubah atau menghapus apa pun di `_legacy/`.
- Setiap fitur kode lama harus punya padanan di kode baru, atau alasan penghapusannya dicatat di `docs/parity-matrix.md`.
- Dokumen hasil generate harus resmi dan siap cetak: Times New Roman 12 (judul 14), tabel 11, header-meta 9,
  spasi 1, catatan kaki hanya di kanan bawah halaman. Kop sekolah opsional: bila belum diunggah, biarkan kosong.
- Seluruh teks antarmuka dan dokumen berbahasa Indonesia baku.
- Setiap pemanggilan AI wajib punya: validasi input, timeout, pesan error yang jelas bagi pengguna,
  dan engine cadangan (fallback). Kunci API tidak boleh ada di kode klien.
- Setiap perubahan diakhiri ringkasan: apa yang diubah, mengapa, dan cara mengujinya.
- Jika informasi tidak ada di kode atau dokumen, tulis "PERLU KONFIRMASI". Jangan menebak.
