---
name: design-api
description: "Rancang kontrak REST API dalam OpenAPI 3.1 tanpa mengimplementasikan kode"
argument-hint: "Kebutuhan fitur API"
user-invocable: true
---

# Perancangan kontrak API

Rancang kontrak API untuk kebutuhan berikut: `$ARGUMENTS`.

Keluarkan spesifikasi OpenAPI 3.1 yang valid dalam YAML. Sertakan endpoint dan metode HTTP, skema request/response, kode status, format error konsisten menggunakan RFC 9457 Problem Details, pagination untuk operasi daftar, dan strategi versioning. Tambahkan catatan autentikasi dan rate limiting.

Gunakan bahasa Indonesia untuk deskripsi. Nyatakan asumsi secara eksplisit; jangan mengarang aturan bisnis atau kebutuhan keamanan. Jika informasi penting belum tersedia, ajukan pertanyaan klarifikasi terlebih dahulu. Jangan mengimplementasikan kode.
