# Tahap 2 — Threat model dan gerbang keamanan Cloudflare Workers

**Status:** tinjauan desain berdasarkan source lokal; bukan audit penetrasi atau pengesahan rilis.
**Target:** rencana port aset web, seluruh handler `api/`, dan cron audit ke Cloudflare Workers.
**Tanggal penilaian:** 2026-11-01.
**Keputusan pengguna yang tercatat:** cakupan port semua API dan cron dipilih, tanpa deploy.
**Keputusan arsitektur pengguna (2026-11-01):** pertahankan sasaran Supabase keluar dari jalur kritis; tahan implementasi port Worker yang mempertahankan Supabase sampai desain penggantinya selesai.
**Gerbang biaya Tahap 1:** [pemeriksaan paket, kuota, dan status billing](./cloudflare-cost-plan-verification-stage1.md) belum lulus untuk akun aktual; pemeriksaan dokumentasi publik tidak menggantikan pemeriksaan dashboard dan benchmark.
**Batas:** tidak ada deployment, perubahan secret/provider, database hosted, OAuth, billing, DNS, domain, atau data pengguna.

## 1. Ringkasan eksekutif

Port adalah perubahan batas kepercayaan dan runtime, bukan pemindahan aset statis semata. Klien menggunakan rute same-origin `/api/...`; handler saat ini berjalan dengan kontrak Node/Vercel dan bergantung pada Supabase Auth/PostgREST, Google OAuth/API, refresh-token ciphertext, cookie, serta cron Vercel.

**Belum ada bukti eksploitasi aktif dalam tinjauan ini.** Risiko terpenting adalah regresi saat menulis ulang autentikasi/otorisasi Node ke Web API, paparan secret melalui logging atau binding, dan pekerjaan terjadwal yang tidak sesuai batas kapasitas provider. RLS pada tabel integrasi tidak membatasi akses service-role; isolasi pengguna tetap bergantung pada filter owner di server.

### Kesimpulan tahap

- **Status keamanan: belum siap untuk deploy.**
- **Status implementasi: belum dimulai untuk port Cloudflare.**
- Lanjut hanya ke spesifikasi dan tes lokal dengan data/mocks sintetis; deployment menunggu verifikasi biaya Tahap 1, keputusan arsitektur di bawah, dan staging approval terpisah.
- Port Worker sebagaimana dirancang di Tahap 3 **tidak** mengeluarkan Supabase dari jalur kritis. Pengguna telah memilih untuk mempertahankan sasaran arsitektur awal; karena itu implementasi port yang masih memakai Supabase ditahan sampai desain pengganti Supabase dibuat dan disetujui. Detail pengganti identitas, database, migrasi, pemulihan, authorization, dan operasi tetap **PERLU KONFIRMASI** dalam spesifikasi lanjutan.

## 2. Cakupan dan batas penilaian

Dalam cakupan:

- Rute auth BFF, OAuth Supabase/Google, koneksi, sync, konflik, audit jurnal, dan endpoint AI yang saat ini sengaja disabled.
- `scheduled()` pengganti cron pengiriman/retensi audit.
- Worker runtime, static asset binding, secret bindings, logs, egress ke Supabase dan Google, dan cutover satu origin.

Di luar cakupan:

- Audit konfigurasi/akun Cloudflare atau Supabase yang hosted.
- Verifikasi kebijakan Google Cloud/OAuth, domain, secret, billing, kuota, backup atau retention aktual.
- Uji penetrasi, tinjauan legal, pengujian data nyata, dan validasi semua kebijakan RLS hosted.
- Fitur baru, pengaktifan signup/chat/AI cloud, dan migrasi identitas/data ke Drive.

Semua penilaian kemungkinan dan dampak merupakan estimasi desain. Kontrol provider yang tidak terlihat di repository ditandai **PERLU KONFIRMASI**.

## 3. Aset dan tujuan keamanan

| Aset | Kerahasiaan/integritas/ketersediaan | Bukti source dan catatan |
|---|---|---|
| Supabase service-role key dan konfigurasi Auth | Sangat tinggi; akses service role melewati RLS | `api/_lib/common.js` membaca key dari environment dan mengirimkannya pada permintaan PostgREST. Nilai secret tidak diperiksa. |
| Refresh token Google, access token, authorization code, PKCE verifier/state | Sangat tinggi; kerahasiaan, integritas sesi, pencabutan | `api/_lib/google.js`, `api/_lib/auth-session.js`, `api/connections/start.js`, `api/google/callback.js`; token koneksi disimpan sebagai ciphertext pada Supabase. |
| Cookie sesi dan OAuth browser | Sangat tinggi; integritas autentikasi dan CSRF | Cookie sesi ditandai HttpOnly, SameSite=Lax, Secure pada produksi dan path terbatas di `api/_lib/auth-session.js`; Google Workspace callback memiliki state cookie di `api/_lib/common.js`. |
| Data Google yang dinormalisasi, cursor dan conflict snapshot | Tinggi; privasi dan integritas | `api/_lib/sync.js`; tabel `integration_items` dan `integration_conflicts` pada migration integrasi. |
| Metadata audit jurnal dan outbox | Tinggi; privasi, retensi, ketersediaan | `api/_lib/journal-audit.js`; event hanya mengizinkan ID, aksi, daftar field, dan waktu; retry/outbox menyimpan status. |
| Identitas pengguna dan batas kepemilikan | Sangat tinggi; isolasi antarpengguna | `authenticateRequest()` mengambil identitas dari Supabase Auth; query Integrations lazimnya menyertakan `user_id` dari identitas tersebut. |
| Kebijakan dan fungsi database | Sangat tinggi; akses service-role dan operasi terjadwal | `supabase/migrations/20261103000100_integrations_sync.sql` mengaktifkan RLS, mencabut akses client langsung, dan memberi akses service-role. Migration dinyatakan belum hosted-validated pada panduan rilis. |
| Ketersediaan Worker/API/cron | Tinggi; login, koneksi, sinkronisasi, retensi | `vercel.json` menjadwalkan cron harian 03:17 UTC; handler saat ini meminta maksimum 1000 koneksi dan memproses user secara serial. |
| Integritas artefak browser | Tinggi; XSS bisa membaca token akses memori dan memakai sesi pengguna | Header deployment di `vercel.json` dan `web/vercel.json` tidak mencantumkan CSP. Ini adalah ketiadaan header di konfigurasi source tersebut, bukan bukti konfigurasi edge lain juga tidak memilikinya. |

## 4. Trust boundary dan alur data

### Batas kepercayaan

1. **Browser pengguna ↔ Worker/origin aplikasi:** permintaan API same-origin, access JWT pada header, cookie HttpOnly sesi/PKCE, input dan hasil yang dapat memuat metadata personal.
2. **Worker ↔ Supabase Auth:** login, refresh, logout, verifikasi token dan identitas pengguna.
3. **Worker ↔ Supabase PostgREST:** operasi service-role pada token koneksi, state, item, konflik dan audit outbox; jalur ini melewati kebijakan RLS pengguna.
4. **Worker ↔ Google OAuth/API:** code, refresh/access token, izin Drive/Tasks/Calendar, file serta metadata.
5. **Worker ↔ platform Cloudflare:** secret bindings, runtime limits, scheduled events, deployment/configuration, access logs, analytics dan retention. Detail akun **PERLU KONFIRMASI**.
6. **Build/CI/repository ↔ artefak deployment:** source, dependency, lockfile, build artefak dan hak deploy. Pengaturan lingkungan/cabang/deploy-protection hosted **PERLU KONFIRMASI**.

### Alur utama

```text
Browser
  ├─ aset SPA ───────────────────────────> Worker static assets
  ├─ cookie sesi + bearer access token ──> Worker /api/auth, /connections, /sync
  │                                         ├─> Supabase Auth
  │                                         ├─> Supabase PostgREST (service role)
  │                                         └─> Google OAuth / Drive / Tasks / Calendar
  └─ event audit metadata ───────────────> Worker -> Supabase outbox -> Google Drive

Cloudflare Scheduled Event -> Worker audit job -> Supabase outbox/connections -> Google Drive
```

Wajib dipertahankan: rute HTTP same-origin, validasi user sebelum akses data, pembatasan tiap query per user, status pending saat upstream gagal, idempotensi mutation/audit, dan tidak ada penghapusan data sumber saat gagal. Kontrak rinci tercantum di [spesifikasi port tahap 3](./cloudflare-workers-api-migration-spec.md).

## 5. Skala risiko

- **Dampak:** 1 rendah, 2 terbatas, 3 sedang, 4 besar, 5 sangat besar (kebocoran token/akses lintas pengguna/gangguan inti).
- **Kemungkinan:** 1 jarang, 2 tidak mungkin, 3 mungkin, 4 mungkin besar, 5 hampir pasti. Nilai memperhitungkan kompleksitas port dan bukti yang tersedia, bukan frekuensi insiden.
- **Risiko = dampak × kemungkinan:** 20–25 kritis; 15–19 tinggi; 8–14 sedang; 1–7 rendah.
- Angka **TIDAK** menyatakan exploit sudah ditemukan. Risiko adalah skenario yang perlu dicegah/divalidasi sebelum implementasi dan release.

## 6. Threat model STRIDE

Urutan risiko tertinggi ke terendah. “Bukti” mengacu pada source konfigurasi/kontrol; skenario ancaman tetap ditandai sebagai skenario, bukan insiden.

| Kategori | Ancaman dan bukti/asumsi | Aset/alur terdampak | Dampak | Kemungkinan | Risiko | Mitigasi konkret dan kriteria penerimaan |
|---|---|---|---:|---:|---:|---|
| Information Disclosure | **Skenario port:** token/secret atau authorization code masuk access log, exception, binding klien, atau response. Source membentuk callback URL dengan `code`/`state`; konfigurasi provider logging target belum diketahui (**PERLU KONFIRMASI**). Tidak ada kebocoran teramati. | Service-role key, OAuth client secret, session/refresh token, PKCE, metadata pribadi. | 5 | 3 | **15 tinggi** | Secret hanya pada server-side Worker bindings; scan artefak browser; log redaction terverifikasi untuk `Authorization`, `Cookie`, query `code/state/error`, body dan token; `Cache-Control: no-store`; tes respons dan log sintetis tidak mengandung canary rahasia. |
| Elevation of Privilege | **Regresi akses lintas akun:** service-role memintas RLS; handler harus menambah owner filter sendiri. Migration secara eksplisit mencabut client role dan memberi `service_role`; source API memakai `adminRequest`. Query yang diperiksa umumnya memfilter `user_id`, jadi tidak ada query tanpa filter yang terbukti pada pemeriksaan ini. Port belum ada. | Token Google, data sinkronisasi, conflict snapshot, audit outbox seluruh pengguna. | 5 | 3 | **15 tinggi** | Derive owner hanya dari hasil verifikasi token; helper DB menerima identitas owner wajib; larang `user_id` dari body/path sebagai otorisasi; tes silang dua user untuk setiap read/write/retry/delete dan scheduled path; audit query URL dan mutation payload; release gagal jika ada akses owner tak teruji. |
| Tampering | **State, callback atau ciphertext berubah/terputus:** implementasi baru dapat salah memvalidasi `Origin`, state/PKCE, cookie atau mengubah format token AES-GCM. Source memvalidasi state/callback dan mengenkripsi token; API Node crypto belum dipindah ke Worker runtime. Ketidakcocokan actual format belum diuji. | Auth/OAuth, refresh token tersimpan, request mutation, konflik, cookie. | 4 | 3 | **12 sedang** | Pertahankan format ciphertext berversi dan fixture lama; interoperabilitas encrypt/decrypt Node ↔ Worker; uji IV/tag/key invalid, state replay/mismatch/expiry, PKCE verifier salah, duplicate callback, payload malformed; validasi schema dan batas body sebelum side effect. |
| Denial of Service | **Scheduled job terlalu besar/serial:** source mengambil sampai 1000 koneksi dan memproses setiap user serial, dengan retry/Drive cleanup sampai batch limit 1000 file/user. Ukuran populasi dan batas runtime target tidak diketahui (**PERLU KONFIRMASI**); kegagalan kapasitas belum teramati. | Worker CPU/duration/quota, Supabase/Google, outbox audit dan retensi. | 4 | 3 | **12 sedang** | Simulasikan jumlah koneksi/batch tinggi; batas kerja per scheduled invocation, pagination dan concurrency terukur; timeout upstream, checkpoint aman, idempotent retry/backoff; alarm untuk backlog dan invocation gagal; verifikasi kuota/biaya Tahap 1 sebelum menjadwalkan produksi. |
| Spoofing | **Pemalsuan identitas/callback:** implementasi target dapat menerima token/identitas atau callback Google/Supabase tanpa mengikat state dan PKCE. Source saat ini memiliki bearer verification, strict app-origin untuk auth, state cookie/PKCE dan validasi akun Google pada callback integrasi. Tidak ada bypass yang teramati. | Login, session refresh/logout, pemulihan akun, Google connection. | 5 | 2 | **10 sedang** | Uji semua route dengan token hilang/kedaluwarsa/salah, Origin hilang/palsu, state mismatch/replay, verifier salah, provider error, akun/email mismatch dan code reuse; redirect allowlist fixed dari `APP_ORIGIN`, bukan header Host. |
| Tampering | **Permintaan mutasi atau route terpilih salah:** parser/router Worker dapat mengubah metode, path parameter, body, atau fallback `/api/*` menjadi HTML SPA. Source API memvalidasi daftar layanan dan operasi; routing Worker belum dibuat. Tidak ada route flaw Worker yang teramati. | Drive/Tasks/Calendar mutations, conflict resolution, API error contract. | 4 | 2 | **8 sedang** | Tabel route-method eksplisit; unknown `/api/*` selalu JSON 404/405; allowlist service/resource/fields; uji encoded path, duplicate query/body, oversized JSON, redirect dan content-type. |
| Repudiation | **Operasi audit/retensi tidak dapat ditelusuri:** outbox memiliki event ID/status/retry dan metadata yang dibatasi, tetapi log cloud, akses/retensinya dan bukti scheduled completion belum diketahui (**PERLU KONFIRMASI**). Log aplikasi saat ini tidak merupakan audit immutable. | Perubahan jurnal metadata, hasil upload Drive, retry/retensi, operasi admin. | 3 | 3 | **9 sedang** | Pertahankan event ID idempoten, status delivered/pending/expired, counter agregat dan request ID; rekonsiliasi antrean; log tanpa payload/token/user ID; tentukan akses/retensi provider; jangan klaim audit tamper-proof atau compliance-grade. |
| Information Disclosure | **XSS mengambil alih sesi aktif:** konfigurasi header Vercel yang diperiksa tidak mengatur CSP. Ini tidak membuktikan konfigurasi edge lengkap atau adanya XSS; CSP yang hilang dari file konfigurasi source mengurangi lapisan pembatas bila XSS terjadi. | Access token memori, data tampilan, aksi pengguna, OAuth start. | 4 | 2 | **8 sedang** | Inventaris script/inline/eval/resource origins; rancang CSP `Report-Only` dahulu pada staging dan ukur pelanggaran; nonce/hash sesuai framework sebelum enforcement; tes jangan merusak login, Worker API, font/asset, local AI/Turnstile bila aktif. Tetap lakukan output encoding dan dependency review; CSP bukan pengganti mitigasi XSS. |
| Denial of Service | **Ketergantungan upstream/kuota:** seluruh auth/integrasi tetap memerlukan Supabase; sinkronisasi memanggil Google. Cloudflare tidak menghilangkan kegagalan provider. Paket dan quota target **PERLU KONFIRMASI**. | Login, session refresh, integrasi, API, cron. | 4 | 2 | **8 sedang** | Batas timeout dan retry per upstream; gunakan status error yang jelas; jangan retry login atau OAuth mutation secara otomatis; tahan antrean lokal; uji upstream timeout/429/5xx dan pastikan tidak ada success-shaped response. |

## 7. Kontrol wajib sebelum kode port

### Identitas dan otorisasi

- Kontrak `authenticateRequest()` baru wajib memverifikasi access JWT terhadap Supabase Auth setiap permintaan sensitif atau memakai mekanisme verifikasi kriptografi yang resmi dan diuji. Jangan percaya user ID/email di body, header khusus browser, JWT `user_metadata`, atau data cookie tanpa verifikasi.
- Jalur PostgREST memakai service role; setiap query harus mengikat user dari autentikasi, termasuk retry, conflict, revoke, audit, cleanup dan mutasi. **RLS saja bukan kontrol untuk service-role.**
- Cron tidak memakai identitas user browser; jadwal internal Worker harus dibedakan tegas dari route publik. Jika pemicu HTTP manual dipertahankan, gunakan auth machine-to-machine, rotasi, pembatasan akses, replay protection, dan rate/abuse controls yang disetujui.
- Permintaan mutasi cookie-based tetap memvalidasi origin/CSRF. Permintaan API bearer juga harus memverifikasi bearer, bukan menyimpulkan aman hanya karena Origin.

### Cookie, OAuth dan secret

- Sesi: `HttpOnly; Secure` di HTTPS; `SameSite` dan `Path` sesuai alur; expiry/clear identik pada semua cabang sukses/gagal; tanpa `Domain` lintas-subdomain kecuali ada keputusan eksplisit.
- PKCE/state: CSPRNG, singkat masa berlaku, satu kali, terikat ke browser/session dan provider/service; callback tidak membuka redirect dinamis. Uji code/state tidak masuk observability.
- Simpan ciphertext lama tanpa migrasi saat cutover. Uji kompatibilitas AES-GCM dan versi key; key lama dipertahankan selama record terenkripsi membutuhkan.
- Secret di-bind ke environment yang benar (local/preview/staging/prod terpisah); jangan menyalin `.env.local` atau `.env.production` ke konfigurasi Worker, membuka nilainya, atau memasukkannya ke artifact.
- Siapkan rotasi dan emergency revoke untuk Supabase service-role key, Google client secret, encryption key, cron/manual trigger credentials. Tidak ada rotasi sekarang.

### Runtime, deployment dan observability

- Pin lockfile; review dependency, provenance CI, permissions minimum dan siapa yang dapat deploy. Pengaturan protected environments/branch approvals Cloudflare **PERLU KONFIRMASI**.
- Pisahkan preview/staging/prod; preview tidak boleh otomatis menerima secret production, database production, callback production, atau data pengguna.
- Gunakan allowlist egress/upstream tetap, timeout, batas body, kontrol concurrency, dan error envelope tanpa detail exception.
- Audit headers: pertahankan `nosniff`, `DENY`, `Referrer-Policy`, `Permissions-Policy`, cache immutable untuk hashed assets; definisikan CSP hanya setelah resource inventory dan pengujian staging.
- Logging minimum: route template, method, status, durasi, upstream label, request ID acak. Jangan merekam URL penuh callback, request headers/body, bearer, cookie, email, user ID, token, ciphertext atau payload audit.
- Sediakan alert untuk error-rate, auth failure, upstream timeout, backlog audit, scheduled failure, CPU/usage limit dan schema mismatch; retensi/log access provider belum disetujui.

## 8. Kriteria penerimaan keamanan

Tahap implementasi berikutnya tidak boleh dianggap siap staging hingga:

1. Semua route dalam matriks tahap 3 punya tes kontrak metode/status/header/cookie dan unknown path.
2. Tes ownership dua pengguna meliputi semua operasi API serta scheduled work.
3. Tidak ada secret/token/cookie/OAuth code pada browser bundle, response, log canary, atau telemetry fixture.
4. Semua callback menolak state/PKCE mismatch, reuse, expiry, provider error dan redirect origin yang tidak disetujui.
5. Ciphertext token lama dibuka dan ditulis kembali secara interoperabel pada fixture; tidak ada perubahan key/schema/data selama cutover.
6. Tes failure dan beban scheduled membuktikan timeout, batch limit, resumability, idempotency, backoff dan status antrean.
7. Browser tests memverifikasi cookie/redirect, CSP Report-Only (setelah inventory), login, session expiry, logout dan koneksi integrasi pada staging yang disetujui.
8. Skema/RLS/backup target Staging diaudit terlebih dahulu; **tidak** menggunakan data Production untuk tes.
9. Billing/quota/log retention provider dikonfirmasi pemilik sesuai Tahap 1; release/cutover memerlukan persetujuan eksplisit terpisah.

## 9. Risiko residual dan keputusan yang dibutuhkan

| Keputusan | Status sekarang | Rekomendasi aman | Dampak bila belum diputuskan |
|---|---|---|---|
| Apakah Supabase boleh tetap di jalur kritis setelah port Worker? | **Diputuskan pengguna (2026-11-01): tidak; implementasi port ditahan sampai desain pengganti Supabase selesai.** | Jangan memulai port Worker yang mempertahankan Supabase. Buat dan tinjau desain pengganti Auth/data/migrasi/pemulihan terlebih dahulu. | Tanpa desain pengganti, memindahkan runtime saja gagal memenuhi sasaran dan berisiko memutus alur aplikasi. |
| Siapa yang mengoperasikan/deploy Worker, dan siapa yang dapat melihat secret/log? | **PERLU KONFIRMASI** | Tetapkan pemilik, akses minimum, environment separation, break-glass dan rotasi. | Rahasia dapat diakses pihak yang tidak memerlukan; pemulihan insiden tak jelas. |
| Paket, billing, Worker/scheduled quotas, log retention aktual | **PERLU KONFIRMASI** melalui pemeriksaan akun Tahap 1 | Verifikasi dashboard/terms terkini sebelum implementasi yang memerlukan resource hosted atau deploy. | Kapasitas/biaya tidak dapat dijamin; cron/API bisa gagal atau incur charges. |
| Schema integrasi dan policies benar-benar ada pada Staging | Belum terverifikasi dalam panduan rilis yang ditinjau | Audit metadata schema, policies/advisors dan backup/restore dalam disposable/Staging dengan approval. | API server dapat gagal atau akses tidak sesuai asumsi source. |
| Volume pengguna dan waktu/biaya maksimum scheduled job | **PERLU KONFIRMASI** | Ukur beban sintetis; pilih batch/concurrency berdasarkan batas plan yang diverifikasi. | Risiko backlog, timeout, atau biaya provider meningkat. |
| Origin/domain/callback preview dan production | **PERLU KONFIRMASI** | Daftar origin eksplisit per environment dan review redirect allowlist sebelum OAuth. | Login/callback gagal atau salah environment. |
| CSP/resource policy saat ini | Source deployment header tidak menyertakan CSP; kontrol edge lain **PERLU KONFIRMASI** | Inventaris resource, staging Report-Only, lalu keputusan enforcement. | Mitigasi defense-in-depth terhadap XSS tidak terdefinisi. |

## 10. Sumber workspace yang ditinjau

- [Spesifikasi port API/cron tahap 3](./cloudflare-workers-api-migration-spec.md)
- [Panduan deployment](../DEPLOYMENT_GUIDE.md), khususnya status schema hosted, integrasi dan larangan deployment tanpa approval
- [Konfigurasi Vercel root](../vercel.json) dan [konfigurasi web](../web/vercel.json)
- [Handler Auth BFF](../api/_lib/auth-session.js), [helper API umum](../api/_lib/common.js), [OAuth/Google](../api/_lib/google.js)
- [Koneksi OAuth](../api/connections/start.js), [callback Google](../api/google/callback.js), [sync](../api/_lib/sync.js), [audit jurnal](../api/_lib/journal-audit.js), [cron audit](../api/cron/lesson-journal-audit.js)
- [Migration integrasi](../supabase/migrations/20261103000100_integrations_sync.sql) dan [tes kontrak API](../web/tests/integration-backend.test.mjs)

**Tidak diperiksa:** konfigurasi akun/provider hosted, nilai secret, log provider, perilaku production, kebijakan IAM Cloudflare/Supabase/Google, maupun trafik/data pengguna.
