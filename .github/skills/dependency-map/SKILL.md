---
name: dependency-map
description: "Petakan dependensi modul dan paket eksternal dengan diagram Mermaid"
argument-hint: "Folder atau paket yang dipetakan, misalnya src"
user-invocable: true
---

# Peta dependensi

Petakan dependensi antar modul dan paket eksternal pada target berikut: `$ARGUMENTS`. Gunakan import, konfigurasi, dan manifest dependensi yang ada di workspace sebagai bukti.

Sajikan diagram Mermaid yang memperlihatkan arah dependensi serta ringkasan dependensi eksternal. Identifikasi dependensi melingkar, paket yang tampak tidak terpakai, dan paket yang tampak usang. Untuk setiap klaim, sertakan bukti atau jelaskan pemeriksaan yang mendasarinya; bedakan "tidak ditemukan penggunaan" dari bukti pasti bahwa paket tidak terpakai. Jangan menebak status usang tanpa metadata versi atau sumber yang dapat diverifikasi. Berikan urutan refactor yang paling aman.

Jika target tidak tersedia, tanyakan klarifikasi. Jika workspace tidak menyediakan bukti cukup untuk memastikan siklus, penggunaan, atau status paket, tandai sebagai "PERLU KONFIRMASI".
