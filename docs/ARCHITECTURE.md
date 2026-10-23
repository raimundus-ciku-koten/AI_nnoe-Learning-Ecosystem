# AI_nnoe Learning Ecosystem — arsitektur aplikasi

## Arsitektur saat ini

```text
Browser
  └─ Vite + React SPA (web/)
       ├─ Halaman publik dan aplikasi berbasis peran
       ├─ Supabase Auth + anon/publishable key
       └─ Supabase API / Realtime
            ├─ PostgreSQL + Row Level Security
            └─ Edge Functions untuk operasi tepercaya (bila diperlukan)

GitHub Actions ── build dan test
Vercel          ── hosting web (Preview/Production harus dipisah)
```

- Aplikasi web aktif berada di `web/`; Android adalah Trusted Web Activity
  yang membungkus aplikasi hosted, bukan aplikasi native terpisah.
- Browser menggunakan konfigurasi publik `VITE_SUPABASE_URL` dan anon/
  publishable key saja. Secret dan operasi berprivilege berada di Edge
  Functions atau secret manager, bukan bundle frontend.
- Semua otorisasi harus divalidasi di server dan kebijakan RLS. Menyembunyikan
  tombol atau memeriksa role di UI bukan kontrol keamanan.
- Modul yang memerlukan tabel, policy, OAuth, atau provider yang belum
  diverifikasi tidak boleh dipresentasikan sebagai siap digunakan.

## Stack dan pilihan tanpa biaya awal

| Lapisan | Pilihan saat ini | Catatan biaya |
| --- | --- | --- |
| Frontend | React, Vite, React Router | Open source; build lokal tidak memerlukan lisensi berbayar. |
| Backend | Supabase Auth, PostgreSQL, Realtime, Edge Functions | Free tier dapat digunakan untuk prototipe/pilot; kuota dan ketentuan berubah. |
| Hosting | Vercel untuk web | Paket gratis memiliki batas penggunaan dan ketentuan penggunaan komersial tersendiri. |
| Kode dan CI | GitHub + GitHub Actions | Kuota runner/penyimpanan dapat terbatas dan berbeda menurut akun/plan. |
| Domain | Subdomain penyedia | Domain kustom biasanya berbayar; jangan menjanjikan domain gratis permanen. |
| AI/integrasi eksternal | Nonaktif sampai dikonfigurasi dan ditinjau | Provider dapat menagih pemakaian. Jangan menaruh kunci provider di `VITE_*`. |

Ini adalah strategi memulai dengan biaya awal serendah mungkin, bukan jaminan
bahwa operasional akan selalu gratis. Periksa harga, kuota, wilayah data,
syarat penggunaan, dan kebutuhan backup sebelum menerima pengguna nyata.
Pantau pemakaian dan tetapkan ambang penghentian sebelum mengaktifkan layanan
yang dapat menagih biaya.

## Batas kepercayaan dan alur data

1. Browser memulihkan sesi melalui Supabase Auth.
2. UI menyesuaikan navigasi dengan peran aktif untuk pengalaman pengguna.
3. Setiap permintaan data tetap dibatasi oleh policy RLS pada database.
4. Perubahan istimewa dilakukan lewat jalur server tepercaya, dengan
   validasi otorisasi, audit, dan kegagalan tertutup.
5. Provider eksternal hanya dihubungi setelah izin, konfigurasi, dan dampak
   biaya serta privasi ditinjau.
6. Log, backup, retensi, dan pemulihan harus dibuktikan lewat pengujian
   lingkungan non-produksi; statusnya tidak disimpulkan dari keberadaan kode.

## Lingkungan

- **Local:** pengembangan dengan data sintetis dan konfigurasi lokal.
- **Preview/Staging:** validasi skema, RLS, autentikasi, integrasi, migrasi,
  backup, dan pemulihan.
- **Production:** hanya perubahan yang telah ditinjau, tervalidasi, dan
  disetujui pemilik; jangan memakai Production sebagai lingkungan uji.

Jangan mencampur konfigurasi, secret, database, atau klaim kesiapan di antara
lingkungan. Hosted migration memerlukan rekonsiliasi provenance/schema,
backup yang berhasil dipulihkan ke database disposable, dan persetujuan owner.

## Rencana implementasi dan gerbang rilis

1. Inventarisasi modul/rute dan tandai statusnya: siap, perlu backend, belum
   dibangun, atau dinonaktifkan.
2. Pilih satu alur pilot; uji sebagai masing-masing peran dengan data
   sintetis dan verifikasi RLS sebagai kontrol utama.
3. Lengkapi identitas legal, kontak, kebijakan privasi, retensi, proses
   permintaan data, dukungan, dan respons insiden sebelum penggunaan publik.
4. Verifikasi staging, backup/pemulihan, batas kuota/biaya, build, dan
   aksesibilitas sebelum deploy.
5. Rilis bertahap dan pantau kesalahan, biaya, serta laporan pengguna.

Status faktual dan blocker yang lebih rinci dipelihara di
[`README.md`](../README.md) dan [`RELEASE_READINESS.md`](../RELEASE_READINESS.md).
