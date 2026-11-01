---
name: tech-spec
description: "Susun spesifikasi teknis fitur berdasarkan kode workspace dan tandai asumsi"
argument-hint: "Fitur yang akan dispesifikasikan"
user-invocable: true
---

# Spesifikasi teknis

Susun technical specification untuk fitur berikut: `$ARGUMENTS`. Gunakan kode dan dokumentasi workspace sebagai acuan; telusuri pola yang relevan sebelum membuat rekomendasi. Bedakan fakta yang ditemukan dari asumsi, dan jangan menyatakan asumsi sebagai fakta.

Susun dokumen dalam bahasa Indonesia baku dengan bagian:
- Latar belakang
- Tujuan dan non-tujuan
- Desain tingkat tinggi
- Model data
- Alur utama
- Penanganan error
- Keamanan
- Observability
- Rencana pengujian
- Rencana rollout
- Risiko

Tandai asumsi dengan jelas dan tulis "PERLU KONFIRMASI" bila informasi tidak tersedia. Ajukan pertanyaan terlebih dahulu bila konteks yang hilang menghalangi rancangan yang bermakna. Jangan mengubah kode.
