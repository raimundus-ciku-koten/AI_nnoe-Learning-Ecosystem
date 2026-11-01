---
description: "Rancang skema basis data relasional lengkap dengan ERD Mermaid dan DDL"
name: "Perancangan skema basis data"
argument-hint: "Domain bisnis dan aturan yang diketahui"
agent: "ask"
---
Rancang skema basis data relasional untuk domain berikut: `${input:domain:domain bisnis}`.

Sajikan:
1. ERD menggunakan sintaks Mermaid.
2. DDL SQL, termasuk tabel, tipe data, kunci utama dan asing, constraint, serta indeks yang diperlukan.
3. Penjelasan normalisasi atau denormalisasi yang disengaja beserta alasannya.
4. Asumsi dan pertanyaan terbuka.

Gunakan bahasa Indonesia baku. Tentukan dialek SQL berdasarkan bukti di workspace atau konfirmasi kepada pengguna; jika belum diketahui, nyatakan asumsi dialek secara eksplisit. Jangan mengarang aturan domain. Tanyakan klarifikasi jika informasi yang hilang mengubah relasi atau integritas data secara material; selain itu, tandai sebagai "PERLU KONFIRMASI".
