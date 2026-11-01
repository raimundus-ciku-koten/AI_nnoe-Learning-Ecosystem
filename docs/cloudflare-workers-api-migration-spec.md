# Spesifikasi port API dan tugas terjadwal ke Cloudflare Workers

**Status:** desain lokal; belum diimplementasikan atau diuji pada akun/provider. Implementasi ditahan oleh keputusan arsitektur pengguna: Supabase harus keluar dari jalur kritis, sehingga port yang masih memakai Supabase belum disetujui.
**Gerbang biaya Tahap 1:** [pemeriksaan harga/kuota publik dan status akun yang belum diverifikasi](./cloudflare-cost-plan-verification-stage1.md). Benchmark fixture sintetis pada Workerd lokal mengukur waktu dinding, bukan CPU Cloudflare, dan tidak menegakkan batas 10 ms; scheduled audit tetap belum lulus untuk Workers Free.
**Cakupan yang dipilih:** memindahkan seluruh handler `api/` dan tugas audit terjadwal dari pola Vercel ke Cloudflare Workers, tanpa deploy.
**Batas:** dokumen ini tidak mengizinkan perubahan hosted, billing, OAuth provider, DNS/domain, database, maupun data pengguna.
**Gerbang keamanan Tahap 2:** lihat [threat model STRIDE dan kriteria penerimaan](./cloudflare-workers-stage2-threat-model.md). Dokumen tersebut tidak menyatakan risiko sebagai exploit yang terbukti dan mengharuskan keputusan jalur Supabase sebelum coding.

## Latar belakang

Aplikasi web dibangun dengan Vite dan menghasilkan aset statis ke `web/dist`. Namun, aplikasi bukan hanya aset statis:

- Sebanyak 16 handler di `api/` melayani autentikasi BFF, OAuth Google, koneksi/sinkronisasi, konflik, audit jurnal, dan endpoint AI yang sengaja mengembalikan `410`.
- Keenam helper bersama di `api/_lib/` menggunakan kontrak Node/Vercel (`module.exports`, `req`/`res`, `process.env`, `node:crypto`).
- Konfigurasi root `vercel.json` mengatur output `web/dist` dan cron `GET /api/cron/lesson-journal-audit` setiap hari pukul 03:17 UTC.
- Klien web memanggil path same-origin `/api/...`; cookie sesi dan OAuth bergantung pada origin yang sama.
- Handler integrasi menggunakan Supabase Auth dan PostgREST dengan service-role key. Refresh token Google terenkripsi dan status sinkronisasi disimpan di Supabase.

Karena itu, mengganti hosting aset saja dengan Cloudflare Pages tidak memindahkan API atau cron dan akan memutus alur aplikasi. Rancangan ini menyatukan aset dan rute API pada satu entrypoint Worker serta mengganti HTTP cron publik dengan event terjadwal Worker.

## Tujuan dan non-tujuan

### Tujuan

1. Mempertahankan kontrak path, metode HTTP, bentuk respons, status, cookie, dan perilaku error untuk semua rute yang dipakai klien.
2. Memindahkan seluruh handler HTTP dan pekerjaan audit terjadwal ke runtime Workers.
3. Mempertahankan autentikasi, pengikatan OAuth/PKCE, enkripsi token, isolasi per pengguna, retry, dan retensi yang ada.
4. Menyajikan aplikasi Vite dan API dari origin yang sama.
5. Menggunakan fixture dan layanan tiruan untuk validasi lokal; tidak menghubungi provider hosted selama pengembangan dan pengujian.

### Non-tujuan

- Tidak mengubah Supabase Auth, Postgres, RPC, RLS, data, atau secret dalam dokumen ini. Karena rancangan ini tetap bergantung pada layanan tersebut, ia belum memenuhi target arsitektur dan tidak boleh diimplementasikan sebelum desain pengganti Supabase disusun dan disetujui.
- Tidak mengubah OAuth consent screen, redirect URI, domain, DNS, billing, paket provider, atau konfigurasi produksi.
- Tidak mengaktifkan AI cloud, signup publik, chat, maupun fitur yang saat ini dinonaktifkan.
- Tidak menambah penyimpanan stateful Cloudflare (D1, KV, R2, Durable Objects) pada rancangan dasar.
- Tidak mengubah skema `20261103000100_integrations_sync.sql` atau menerapkannya ke lingkungan hosted.
- Tidak mengklaim bahwa port API ini mengeluarkan Supabase dari jalur kritis. Aplikasi dan handler tetap bergantung pada Supabase.

**Keputusan pengguna (2026-11-01):** Supabase tetap harus keluar dari jalur kritis. Karena rancangan port Worker di dokumen ini masih memakai Supabase Auth/PostgREST/service-role, implementasi Tahap 3 ditahan sampai desain pengganti identitas, database, migrasi, otorisasi, pemulihan, serta operasi selesai dan disetujui. Keputusan ini membatalkan asumsi bahwa Supabase dapat dipertahankan sementara pada port; keputusan tidak mengizinkan pengubahan atau penghapusan layanan/data hosted.

## Desain tingkat tinggi

### Arsitektur yang direkomendasikan

Gunakan satu entrypoint Cloudflare Worker dengan:

1. **Static asset binding** ke hasil build `web/dist`.
2. **Router HTTP** untuk path `/api/*`, yang menghasilkan objek `Response` Web API.
3. **Scheduled handler** untuk pekerjaan retensi/pengiriman audit yang saat ini dipanggil Vercel Cron.
4. **Bindings rahasia server-only** untuk konfigurasi Supabase, Google OAuth, dan enkripsi token.
5. **Tidak ada database atau cache baru di Cloudflare**; data aplikasi tetap di Supabase pada fase port ini.

Model satu Worker menghindari dua origin untuk aplikasi dan API serta menyediakan jalur terjadwal di entrypoint yang sama. Mekanisme konfigurasi aset, batas runtime, kompatibilitas modul Node, dan pengaturan cron harus diverifikasi terhadap dokumentasi serta akun Cloudflare yang akan dipakai (**PERLU KONFIRMASI**). Tidak ada konfigurasi `wrangler` atau pipeline Cloudflare di repository saat ini.

### Batas kompatibilitas

Handler Vercel tidak dapat dipasang langsung sebagai handler Worker. Migrasi memerlukan adapter baru:

- `Request`/`URL`/`Headers` menggantikan `req` dan `res`.
- Body JSON dibaca eksplisit dan divalidasi; query/path berasal dari `URL`.
- Respons menjadi `Response`; header `Set-Cookie` harus ditambahkan terpisah untuk setiap cookie.
- `process.env` diganti dengan parameter `env` bindings. Secret hanya dibaca di Worker.
- `node:crypto`, `Buffer`, `createCipheriv`, `timingSafeEqual`, dan `randomBytes` perlu diganti atau divalidasi terhadap API Web Crypto Worker.
- Format ciphertext token yang tersimpan sekarang harus kompatibel dua arah selama cutover. Perubahan format memerlukan versi eksplisit dan tes terhadap fixture lama.
- Timeout upstream, pembatalan, dan ukuran body perlu dibatasi serta dipetakan ke error API yang stabil.

Tidak boleh menganggap dukungan kompatibilitas Node cukup sebelum setiap import/runtime path diuji pada target Worker. Perilaku kriptografi dan serialisasi lama harus diuji lintas-runtime; bila ciphertext lama tidak kompatibel, jangan memigrasikan key maupun token dalam rilis ini.

### Matriks rute yang harus dipertahankan

| Rute | Metode | Perilaku dan dependensi saat ini | Catatan port |
|---|---|---|---|
| `/api/auth/login` | `POST` | Password login melalui Supabase Auth; refresh token dalam cookie HttpOnly | Pertahankan pemeriksaan Origin, validasi input, CAPTCHA bila dikirim, `no-store`, dan bentuk sesi publik tanpa refresh token. |
| `/api/auth/signup` | `POST` | Signup Supabase Auth memakai CAPTCHA dan PKCE | Signup tetap mengikuti status provider; jangan mengaktifkan signup publik. |
| `/api/auth/session` | `GET`, `DELETE` | Refresh cookie melalui Supabase Auth atau logout global | Uji rotasi cookie, token kedaluwarsa, penghapusan cookie, dan logout lintas sesi. |
| `/api/auth/google/start` | `POST` | Membuat state/verifier PKCE, cookie HttpOnly, dan URL Supabase Auth | Jangan mencatat URL/query yang mengandung state atau parameter autentikasi. |
| `/api/auth/google/callback` | `GET` | Memvalidasi state/cookie, menukar PKCE code melalui Supabase Auth, lalu redirect | Redirect harus tetap same-origin, `no-store`, dan membersihkan cookie pada sukses maupun gagal. |
| `/api/auth/recovery/verifier` | `POST` | Menyimpan verifier pemulihan pada cookie HttpOnly | Cookie/path/expiry dan pembatasan verifier wajib dipertahankan. |
| `/api/auth/recovery/callback` | `GET` | Menukar PKCE recovery/signup code, membuat sesi, lalu redirect | Jangan membocorkan code atau verifier pada log/diagnostik. |
| `/api/connections` | `GET` | Membaca koneksi, status sinkronisasi, konflik milik pengguna dari PostgREST | Setiap query tetap menyertakan scope user hasil autentikasi server. |
| `/api/connections/start` | `POST` | Membuat state OAuth Google dan verifier terenkripsi, lalu menyimpan `oauth_pending` di Supabase | Batas waktu state dan scope per layanan tidak boleh melemah. |
| `/api/connections/:service` | `DELETE` | Menghapus koneksi milik pengguna dan mencabut token Google | Uji kegagalan revoke terpisah dari penghapusan lokal; jangan mengembalikan token. |
| `/api/google/callback` | `GET` | Menukar OAuth code Google dan menyimpan refresh token terenkripsi ke `oauth_connections` | Tetap dibedakan dari callback Supabase di `/api/auth/google/callback`. |
| `/api/sync/:service` | `GET`, `POST` | Sinkronisasi/mutasi Drive, Tasks, Calendar dan status/cursor di Supabase | Pertahankan batas halaman, idempotensi mutation, konflik, retry, dan scope per pengguna. |
| `/api/conflicts/:id` | `POST` | Menyelesaikan konflik lokal/remote milik pengguna | Validasi UUID, kepemilikan, status unresolved, dan mutation remote sebelum menutup konflik. |
| `/api/audit/lesson-journal` | `POST` | Validasi metadata audit, outbox Supabase, upload metadata-only ke Drive | Jangan mengirim isi jurnal; pertahankan retensi, idempotensi, dan status pending yang terlihat. |
| `/api/cron/lesson-journal-audit` | `GET` saat ini | Vercel Cron memproses antrean dan menghapus audit Drive kedaluwarsa | Ganti dengan event `scheduled()` internal. Jangan mempertahankan endpoint publik tanpa kebutuhan dan autentikasi yang disetujui. |
| `/api/ai` | `POST` | Selalu mengembalikan `410 cloud_ai_disabled` sebelum membaca/meneruskan prompt | Pertahankan penolakan eksplisit; jangan menambah provider, kuota, atau penerusan prompt. |

Unknown `/api/*` harus menghasilkan error JSON yang terkontrol, bukan fallback `index.html`. Permintaan aset non-API diteruskan ke static asset handler.

### Binding dan konfigurasi runtime kandidat

Nama berikut dicatat sebagai kategori binding yang dibutuhkan berdasarkan source dan panduan deploy; nilai tidak boleh disimpan di repository atau prefiks `VITE_`.

| Binding | Penggunaan | Risiko/ketentuan |
|---|---|---|
| `SUPABASE_URL` | Auth/PostgREST upstream | URL HTTPS yang disetujui; endpoint tidak boleh diambil dari input pengguna. |
| `SUPABASE_PUBLISHABLE_KEY` | Panggilan server Auth | Bukan pengganti autentikasi pengguna. |
| `SUPABASE_SERVICE_ROLE_KEY` | Operasi server pada tabel integrasi | Sangat sensitif; membypass RLS. Hanya binding server, rotasi dan kontrol akses dashboard wajib. |
| `APP_ORIGIN` | Validasi Origin, redirect, URI callback | Harus berupa origin produksi/preview yang eksplisit; jangan membangun redirect dari `Host` tak tepercaya. |
| `GOOGLE_OAUTH_CLIENT_ID`, `GOOGLE_OAUTH_CLIENT_SECRET` | OAuth server | Client secret server-only; redirect URI provider harus cocok dengan origin final. |
| `INTEGRATION_TOKEN_ENCRYPTION_KEY`, versi dan key versi lama | Enkripsi/dekripsi token tersimpan | Key lama dipertahankan selama ciphertext terkait masih ada; jangan rotasi saat port tanpa rehearsal. |
| `CRON_SECRET` | Otorisasi endpoint cron saat ini | Tidak dibutuhkan oleh pemanggilan `scheduled()` internal. Binding hanya dipertahankan jika ada trigger manual privat yang disetujui. |

Ketersediaan, retensi, batas akses, backup, dan biaya secret bindings/log provider perlu diverifikasi pada akun target (**PERLU KONFIRMASI**).

## Model data

Tidak ada perubahan skema pada rancangan ini.

Skema source `20261103000100_integrations_sync.sql` mendefinisikan tabel `oauth_connections`, `oauth_pending`, `integration_sync_state`, `integration_items`, `integration_conflicts`, `integration_mutations`, `integration_ai_usage`, serta fungsi cleanup/kuota. Tabel mengaktifkan RLS, mencabut akses `anon`/`authenticated`, dan memberi akses `service_role`. API menggunakan service role, sehingga query server wajib menerapkan `user_id` dari identitas yang telah diverifikasi—RLS tidak boleh dianggap melindungi kesalahan query service-role.

Panduan deploy menyatakan migrasi integrasi belum diterapkan dan parity schema hosted belum terverifikasi. Maka ketersediaan tabel/fungsi di Staging/Production **PERLU KONFIRMASI**. Jangan menjalankan handler baru pada hosted project sebelum review schema, backup/restore, RLS, dan approval migrasi yang terpisah.

Data yang melewati Worker:

- Cookie sesi refresh Supabase, cookie PKCE/state, authorization code, dan access token berumur pendek.
- Refresh token Google dan PKCE verifier koneksi; keduanya disimpan sebagai ciphertext pada Supabase oleh alur saat ini.
- Metadata Google yang dinormalisasi, cursor sinkronisasi, snapshot konflik, dan event audit tanpa isi jurnal.
- Secret server pada bindings; tidak boleh berada di body, URL log, respons, telemetry, atau browser bundle.

## Alur utama

1. **Permintaan statis/API:** Worker merutekan `/api/*` lebih dulu; rute lain dilayani aset statis. Klien tetap memakai path same-origin.
2. **Autentikasi:** Worker memvalidasi metode dan Origin, memproses cookie HttpOnly, meneruskan operasi Auth ke Supabase, dan mengembalikan hanya sesi publik yang disepakati.
3. **OAuth:** Worker membuat state/verifier acak, mengikatnya ke cookie/record pending, memvalidasi callback, menukar code ke provider, lalu menyimpan token terenkripsi. State satu kali dan kedaluwarsa.
4. **Integrasi Google:** Worker memverifikasi access token pengguna melalui Supabase Auth, mengambil record koneksi dengan batas `user_id`, membuka token memakai key version yang sesuai, memanggil API Google dengan timeout, lalu menyimpan status/cursor/result.
5. **Audit:** endpoint pengguna memvalidasi metadata dan mengantrekan event idempoten. Scheduled event memproses antrean berbatas, menerapkan retensi, dan menyimpan status retry.
6. **Kegagalan:** mempertahankan format Problem Details/field klien yang ada; respons tidak menyatakan berhasil tersinkron jika upstream atau verifikasi gagal.

## Penanganan error

| Kondisi | Perilaku target |
|---|---|
| Rute/metode tidak dikenal | `404` atau `405` terstruktur; tidak mengembalikan HTML SPA untuk `/api/*`. |
| Body tidak valid/terlalu besar | `400`/`413` sebelum memanggil Supabase/Google; batas ukuran konkret **PERLU KONFIRMASI** dari payload aktual. |
| Origin/cookie/state/PKCE tidak cocok | `403`/`400`; hapus cookie sementara dengan aman; jangan retry atau meneruskan callback. |
| Supabase/Google timeout/5xx/429 | Petakan ke status dan kode stabil; hormati `Retry-After`, pertahankan antrean/cursor, dan gunakan timeout per upstream. |
| Supabase schema/function tidak tersedia | Error layanan eksplisit; jangan fallback ke storage lain atau menganggap operasi sukses. |
| Kunci enkripsi tidak tersedia/invalid | Gagal tertutup; jangan menimpa ciphertext; tampilkan pesan pengguna generik dan log kode teredaksi. |
| Quota/CPU/waktu Worker tercapai | Pertahankan kerja yang idempoten; pencatatan parsial dan retry terkontrol. Angka dan behavior provider **PERLU KONFIRMASI** sebelum rollout. |
| Scheduled invocation gagal | Metrik status/durasi/count tanpa ID pengguna; retry hanya bila operasi aman/idempoten; sediakan prosedur replay manual yang terotorisasi. |

## Keamanan

### Skala STRIDE

Impact dan kemungkinan memakai skala 1–5 (1 = rendah, 5 = sangat tinggi). Skor risiko = impact × kemungkinan; 20–25 kritis, 15–19 tinggi, 8–14 sedang, 1–7 rendah. Skor adalah penilaian desain awal, bukan bukti eksploitasi.

| Kategori | Ancaman dan bukti/asumsi | Aset/alur terdampak | Dampak | Kemungkinan | Risiko | Mitigasi konkret |
|---|---|---|---:|---:|---:|---|
| Information Disclosure | Secret Worker, service-role key, refresh token, atau OAuth code dapat bocor melalui bundle, error, URL log, atau konfigurasi yang salah. Source saat ini memproses nilai tersebut pada [common.js](../api/_lib/common.js), [auth-session.js](../api/_lib/auth-session.js), dan [google.js](../api/_lib/google.js). Kebocoran pada target belum teramati. | Bindings, cookie, callback OAuth, Supabase, browser. | 5 | 3 | 15 tinggi | Pakai secret bindings server-only; pemindaian bundle; redact query/header/body; `no-store`; cookie HttpOnly/SameSite/Secure; uji log dan error; least-access role dan prosedur rotasi. |
| Elevation of Privilege | Service-role key membypass RLS; satu query PostgREST yang lupa filter `user_id` berpotensi lintas akun. Ini adalah konsekuensi privilege source schema dan pemakaian `adminRequest`, bukan bukti bahwa bypass saat ini ditemukan. | Koneksi/token Google, item, konflik, outbox, endpoint semua user. | 5 | 3 | 15 tinggi | Adapter hanya menerima `userId` dari autentikasi server; query mengikat owner pada setiap operasi; helper query scoped; tes dua user untuk setiap route; audit semua PostgREST filter dan mutation. |
| Spoofing | Request/callback dapat memakai identitas atau state yang tidak sah jika adapter menghilangkan verifikasi bearer, Origin, cookie HttpOnly, state atau PKCE yang ada. Handler sekarang memvalidasi sebagian kontrol tersebut. | Login, session, recovery, OAuth callback, koneksi Google. | 5 | 2 | 10 sedang | Pertahankan verifikasi token melalui Supabase Auth; strict Origin allowlist; state/verifier acak, satu kali dan expiry; constant-time comparison yang ditinjau; callback hanya pada origin terkonfigurasi. |
| Tampering | Salah parsing route/body, duplikasi `Set-Cookie`, atau perubahan format ciphertext dapat mengubah operasi atau membuat token lama tidak dapat dibuka. Target adapter/runtime belum ada. | Mutasi Drive/Tasks/Calendar, conflict resolution, token ciphertext, cookie. | 4 | 3 | 12 sedang | Validasi schema per endpoint dan metode; cocokkan body-size batas; adapter route test; format ciphertext berversi dan fixture kompatibilitas lama; jangan mengubah skema/data dalam cutover. |
| Denial of Service | Sinkronisasi memanggil Google/PostgREST per halaman; cron mengiterasi koneksi dan bisa menghapus hingga 1.000 file per pengguna. Migrasi tanpa batas concurrency/timeout/backpressure dapat menghabiskan batas runtime/provider. | Worker quota, Google API, Supabase, antrean audit. | 4 | 3 | 12 sedang | Batas concurrency dan pekerjaan per invocation; timeout/cancel; idempotensi dan backoff; metrik antrean; uji batas jumlah pengguna/halaman; cek batas dan paket provider sebelum jadwal produksi. |
| Repudiation | Audit lokal/outbox dan log Worker tidak otomatis menjadi bukti tak dapat diubah; event dapat pending/expired atau log provider ber-retensi terbatas. Source menunjukkan outbox/retry di [journal-audit.js](../api/_lib/journal-audit.js). | Audit jurnal, status pengiriman, operasi admin. | 3 | 3 | 9 sedang | Pertahankan idempotency/event ID/status pending; jangan klaim audit tamper-proof; log agregat teredaksi dan retensi terdokumentasi; pantau pending/expired serta sediakan rekonsiliasi. |

### Kontrol lintas-komponen

- Semua API mutasi harus menolak Origin yang tidak cocok; route GET sensitif tetap membutuhkan autentikasi.
- Parameter path/query tidak boleh dipakai untuk memilih host upstream. Allowlist hanya service `drive`, `tasks`, `calendar`.
- `SUPABASE_SERVICE_ROLE_KEY` hanya di Worker; tidak pernah di `VITE_*`, Static Assets, respons, atau log.
- OAuth callback memakai `Cache-Control: no-store`; redaksi access log untuk `code`, `state`, `error_description`, authorization header, cookie dan token.
- Pertahankan scope Google paling sempit, binding akun, state, PKCE, verifikasi token, dan pencabutan.
- Do not log isi event audit, payload Google, snapshot konflik, email, ID pengguna, token, ataupun ciphertext key material.
- Simpan Supabase sebagai dependency eksplisit pada dokumen dan status kesehatan. Port tidak mengurangi kebutuhan schema/RLS atau backup.

## Observability

Log terstruktur minimum: route template, metode, status, kode error terstandar, durasi, upstream label, dan request ID acak. Scheduled run mencatat jumlah diproses/terkirim/tertunda/dihapus dan durasi agregat, tanpa user ID.

Dashboard/alert minimum: error rate per route, timeout per upstream, auth/OAuth failures, konflik/retry, umur antrean audit, jumlah scheduled run gagal, Worker CPU/quota, dan status deployment. Retensi log, data residency, akses tim, alerting provider, serta biaya observability **PERLU KONFIRMASI**.

Jangan menjadikan Worker analytics/log default sebagai audit pusat sebelum kebijakan akses/retensinya disetujui. Tidak ada telemetry baru pada fase desain.

## Rencana pengujian

1. **Inventaris kontrak:** jalankan `npm test` dan simpan hasil baseline; gunakan [integration-backend.test.mjs](../web/tests/integration-backend.test.mjs) sebagai daftar regresi kontrak.
2. **Unit adapter:** route/method/query/body, respons RFC 9457, `Set-Cookie` multi-header, cache, redirect, body limit, header forwarding dan `/api/*` unknown path.
3. **Kompatibilitas kriptografi:** fixture token ciphertext lama; encrypt/decrypt lintas-runtime, invalid tag/key/version, rotasi, random IV, constant-time state compare.
4. **Auth/OAuth:** password login/signup/CAPTCHA, refresh/logout, Google login, recovery, state/PKCE mismatch/expiry/replay, callback cancel, cookie expiry/path/domain/origin, dan account mismatch. Gunakan mocks/akun sandbox yang disetujui saja.
5. **Isolasi/otorisasi:** user A tidak dapat membaca/mengubah koneksi, item, konflik, atau outbox user B; request tanpa token/Origin valid gagal sebelum query tulis; service-role query selalu owner-scoped.
6. **Integrasi Google:** pagination, resume cursor, reset cursor 410, retry 429/5xx, revoke partial failure, mutation idempotency, konflik, dan Drive audit tanpa konten jurnal.
7. **Scheduled:** trigger lokal sintetis, concurrency/duplicate run, batas batch, expired cleanup, idempotent replay, error parsial dan monitoring. Jangan memanggil cron Production.
8. **Worker runtime:** build web, uji router Worker/static assets, semua route pada runtime emulator yang sama dengan deployment, dan uji redirect/cookie pada browser preview terisolasi.
9. **Staging gate:** schema integration harus lebih dulu direview dan diterapkan hanya ke Staging/disposable dengan persetujuan eksplisit; tes RLS, backup/restore, dan dua akun sintetis. Jangan gunakan data Production.

Sebelum implementasi, dokumentasikan fixture sanitized dan jangan memakai `.env.local`/`.env.production` atau membaca nilainya. Test host/emulator dan versi toolchain Cloudflare yang akan dipilih **PERLU KONFIRMASI**.

## Rencana rollout

1. **Gate 1 — biaya/provider:** pemilik memeriksa paket Cloudflare, konfigurasi billing, kuota, batas Worker/scheduled, log retention, dan biaya akun aktual. Fakta biaya yang pernah dicatat perlu diverifikasi ulang; belum dibuktikan dari dashboard.
2. **Gate 2 — keamanan/arsitektur:** tinjau STRIDE, setujui apakah Supabase tetap dependency, tetapkan origin/domain/callback, secrets custody/rotation, logging, rollback dan pemilik operasional.
3. **Gate 3 — implementasi lokal:** port router/adapter dan handler satu kelompok pada satu waktu; tidak deploy. Jalankan kontrak/compatibility/regression tests.
4. **Gate 4 — Staging terisolasi:** hanya setelah approval terpisah, siapkan redirect URI dan secrets staging; validasi schema dengan backup dan uji alur end-to-end menggunakan akun/data sintetis.
5. **Gate 5 — canary/cutover:** approval rilis eksplisit; deploy preview/canary, observasi metrik, lalu alihkan origin. Pastikan Vercel tetap tersedia sebagai rollback tanpa menghapus fungsi/secret/data terlebih dahulu.
6. **Gate 6 — cleanup:** hanya setelah masa observasi dan pemeriksaan seluruh klien/cron; hapus deployment lama atau secret hanya melalui persetujuan pemilik yang terpisah.

## Risiko dan keputusan terbuka

| Risiko/pertanyaan | Status | Dampak |
|---|---|---|
| Supabase keluar dari jalur kritis atau tetap menjadi Auth/DB untuk Tahap 3 | **PERLU KONFIRMASI** | Port Worker saja tidak memenuhi arsitektur tanpa Supabase. |
| Paket, billing, CPU/request/scheduled quotas, log retention akun Cloudflare aktual | **PERLU KONFIRMASI** oleh pemilik sebelum implementasi/release | Potensi biaya, throttling atau kegagalan pekerjaan terjadwal. |
| Schema integrasi tersedia di Staging/Production | Belum terverifikasi menurut panduan deploy | Rute koneksi/sinkronisasi/audit gagal; jangan deploy sebelum Staging parity. |
| Kompatibilitas format token AES-GCM lama pada Web Crypto Worker | Belum diuji | Pengguna dapat kehilangan koneksi Google atau memerlukan reconnect massal. |
| Batas CPU/waktu, fan-out dan concurrency scheduled audit | Belum diuji pada volume nyata | Antrean tertunda atau penghapusan retensi parsial. |
| Callback/origin production/preview dan kebijakan Google/Supabase redirect | **PERLU KONFIRMASI** | OAuth login atau consent gagal/terbuka ke origin yang keliru. |
| Mekanisme host static assets dan Worker routing untuk monorepo | Tidak ada konfigurasi Cloudflare di repo | SPA/API dapat menerima fallback atau deployment salah direktori. |
| Penggantian RLS/service-role pola | Query saat ini memakai service role dan owner filters | Kesalahan port berisiko akses lintas pengguna. |
| Runbook rollback dan penjaga rilis | Belum ditetapkan | Gangguan autentikasi/sinkronisasi pada cutover sulit dipulihkan. |

## Fakta versus asumsi

**Fakta dari workspace:** Vite mengeluarkan `web/dist`; API menggunakan kontrak CommonJS/Node dan same-origin; root Vercel config memuat cron; klien memanggil `/api/...`; token koneksi disimpan terenkripsi di tabel Supabase; source migration mengaktifkan RLS dan mencabut akses client; panduan deploy menyebut schema hosted belum terverifikasi; belum ditemukan konfigurasi Cloudflare/Wrangler atau pipeline deploy Cloudflare.

**Asumsi rancangan:** satu Worker menyajikan aset dan menangani API/cron; binding secret tersedia pada paket akun target; pemilik ingin mempertahankan kontrak HTTP; Supabase tetap dipakai selama fase port. Asumsi terakhir bertentangan dengan sasaran keluar dari jalur kritis dan wajib dikonfirmasi sebelum kode diimplementasikan.

**Status Tahap 3:** spesifikasi ini menyelesaikan desain port lokal. Tahap implementasi belum dimulai. Tidak ada perubahan kode, schema, provider, atau deployment yang dibuat oleh dokumen ini.
