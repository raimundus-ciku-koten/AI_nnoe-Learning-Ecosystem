---
name: threat-model
description: "Lakukan threat modeling STRIDE defensif untuk komponen atau fitur"
argument-hint: "Komponen atau fitur yang akan dianalisis"
user-invocable: true
---

# Pemodelan ancaman STRIDE

Lakukan threat modeling defensif dengan metode STRIDE untuk target berikut: `$ARGUMENTS`. Gunakan kode dan dokumentasi workspace sebagai bukti bila tersedia.

Identifikasi aset, batas kepercayaan (trust boundary), dan alur data. Sajikan ancaman per kategori STRIDE dalam tabel dengan kolom: kategori, ancaman, aset/alur terdampak, dampak, kemungkinan, tingkat risiko (dampak x kemungkinan), dan mitigasi konkret.

Jelaskan skala penilaian yang digunakan, urutkan ancaman dari risiko tertinggi, dan bedakan temuan berbukti dari asumsi. Jangan mengklaim kerentanan tanpa bukti. Jika konteks arsitektur atau kontrol belum diketahui, tulis "PERLU KONFIRMASI"; tanyakan klarifikasi bila kekurangan konteks menghalangi pemodelan yang bermakna.
