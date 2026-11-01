# Tahap 1 — Verifikasi biaya, paket, dan batas layanan

**Tanggal pemeriksaan sumber publik:** 2026-11-01
**Status:** pemeriksaan dokumentasi publik selesai; sebagian status akun dikonfirmasi pengguna, bukan diaudit independen. **Gerbang biaya produksi masih tertahan.**
**Cakupan:** Cloudflare Workers/static assets, Google Cloud dan Google Drive API, Supabase, Vercel, GitHub Actions, serta AI lokal.
**Batas:** hanya membaca workspace dan dokumentasi publik. Tidak masuk dashboard, membaca nilai secret, mengubah billing/provider, menghubungkan kartu, membuat resource, atau melakukan deployment.
**Batas keras pengguna:** jangan menghubungkan billing, menambahkan kartu, mengaktifkan layanan berbayar, upgrade paket, atau deploy. Status ini bukan bukti bahwa semua akun/provider saat ini bebas biaya.

## Ringkasan keputusan

1. **Belum dapat menyatakan arsitektur ini “tanpa biaya”.** Dokumen lokal tidak membuktikan paket, billing account, metode pembayaran, pemakaian, batas peringatan, atau resource billable pada akun aktual.
2. Dokumentasi Cloudflare saat pemeriksaan menawarkan Workers Free tanpa biaya dalam kuota tertentu, tetapi membatasi Worker HTTP dan cron ke **10 ms CPU per invocation** dan 100.000 request per hari. Static assets gratis/tidak terbatas; route API memanggil Worker. Paket Workers Paid mulai **US$5/bulan per akun**, dengan penggunaan tambahan yang dapat ditagih.
3. Cron audit saat ini memproses daftar koneksi sampai 1.000 user secara serial dan dapat melakukan operasi Drive/outbox per user. Fixture sintetis di emulator Worker lokal mengukur waktu dinding sekitar 0–1 ms untuk 1 pengguna, 3–4 ms untuk 10, 8–9 ms untuk 25, 16–17 ms untuk 50, 32–33 ms untuk 100, dan 332–358 ms untuk 1.000 (tiga pengulangan per beban). Beban fixture per pengguna adalah 25 bentuk event antrean dan validasi/encoding 1.000 ID file kedaluwarsa. **Ini bukan pengukuran CPU Cloudflare yang sah**: timer yang tersedia adalah `performance.now()`, emulator tidak menggagalkan invocation yang melewati `cpu_ms: 10`, dan tidak ada trafik hosted. Hasil ini tidak meluluskan batas Free; **jangan deploy atau menjanjikan kelayakan cron gratis** sampai implementasi nyata diprofilkan dan pekerjaan dibagi ke unit yang aman beserta strategi backlog/retry.
4. Google Drive API menerapkan kuota dan dokumentasi saat ini menyebut ambang billing harian 400 juta quota units; halaman itu mengatakan detail billing penuh akan diumumkan kemudian pada 2026 dengan pemberitahuan minimal 90 hari. Karena tanggal pemeriksaan sudah di November 2026, angka dan kebijakan ini wajib diperiksa ulang sebelum rilis. Tidak ada pemeriksaan project Cloud Billing aktual.
5. Supabase Free yang tercatat pada panduan rilis bukan bukti status tagihan hari ini. Paket Free saat ini mempunyai batas penyimpanan/egress, dapat menjeda project setelah satu minggu tidak aktif, dan tidak menyertakan automatic backups. Supabase juga masih dipakai kode aktif; ini bertentangan dengan sasaran keluar dari jalur kritis dan tidak bisa diselesaikan hanya dengan mengganti hosting.
6. Vercel Production masih tercatat aktif. Jika project berada di Hobby, ketentuan Vercel membatasi pemakaian ke personal non-komersial; kelayakan layanan sekolah ini **PERLU KONFIRMASI**. Jangan menganggap status Hobby otomatis sesuai.
7. Repository utama GitHub yang ditinjau bersifat publik dan workflow web menggunakan standard GitHub-hosted Ubuntu runner. Dokumentasi GitHub menyatakan standard runners untuk repo publik gratis; storage artifact/cache tetap tunduk pada allowance. Tidak ada pemeriksaan aktual terhadap usage/billing settings.

## Pemeriksaan per layanan

| Layanan/komponen | Fakta sumber publik dan bukti lokal | Paparan biaya/batas | Status akun dan tindakan |
|---|---|---|---|
| **Cloudflare Workers API** | Workers Free tersedia; tabel resmi menyebut 100.000 request/hari dan 10 ms CPU per HTTP invocation. Cron pada Free juga 10 ms CPU. Workers Paid mulai **US$5/bulan per akun**; pada model Standard, request di atas 10 juta/bulan dan CPU di atas 30 juta ms/bulan memiliki tarif tambahan. | Free melindungi dari biaya pemakaian Worker dalam kuotanya, bukan dari kegagalan kapasitas atau biaya produk lain pada akun. Pemakaian paid dapat menimbulkan biaya dasar dan usage. | Pengguna melaporkan plan Free dan tidak mengetahui layanan berbayar lain (2026-11-01); belum diverifikasi melalui dashboard. **PERLU KONFIRMASI:** usage/alert dan scheduled limits. |
| **Static assets Cloudflare** | Dokumen Workers static assets menyatakan request static gratis/tidak terbatas dan tidak ada biaya tambahan penyimpanan assets. Hanya request yang dirutekan ke Worker script yang memakai kuota Worker; konfigurasi routing seperti `run_worker_first` dapat mengubah request menjadi invocation. | Aset statis tidak menambah biaya berdasarkan tarif halaman tersebut; API dinamis tetap berada di bawah kuota/batas Worker. Cache Worker dapat mengubah metering. | Rancangan Tahap 3 mengusulkan satu Worker + asset binding; belum diimplementasikan. Verifikasi routing agar asset biasa tidak memanggil script. |
| **Cloudflare Pages (alternatif)** | Halaman limit resmi mencatat 500 build/bulan di Free, satu build concurrent, timeout 20 menit, dan Pages Functions menggunakan kuota Workers. | Fungsi dinamis bukan “gratis tak terbatas”; build cap dan Workers limits tetap berlaku. Pilihan hosting final belum diputuskan pada kode. | Tahap 3 memilih desain Worker + assets; Pages hanya opsi pembanding, bukan persetujuan untuk membuat project baru. |
| **Cloudflare Scheduled audit** | Cloudflare cron menggunakan `scheduled()` dan berjalan berdasarkan jadwal UTC. Free CPU cap untuk Cron Trigger tercatat 10 ms; Free mengizinkan hingga lima Cron Triggers per akun. Source saat ini mengatur Vercel cron setiap hari 03:17 UTC; handler mengambil sampai 1.000 koneksi dan memprosesnya serial. Fixture sintetis di Workerd lokal selesai dengan status `ok`, tetapi konfigurasi 10 ms tidak ditegakkan oleh emulator yang diuji. | Potensi utama pada Free adalah error 1102/job berhenti, backlog audit, atau retensi terlambat; bukan biaya Worker Free otomatis. Waktu dinding fixture bukan metrik CPU invocation. | **NO-GO untuk janji layanan cron gratis.** Hasil lokal tidak memvalidasi batas 10 ms, dan desain pembagian kerja/backlog belum ada. Jangan memakai paket Paid untuk menutup gap; hal itu dilarang tanpa persetujuan terpisah. |
| **Google Cloud project / Drive API** | Google meminta API diaktifkan di sebuah Cloud project. Kode memakai scope `drive.file` untuk integrasi Drive; data Drive disimpan di akun pengguna. Halaman quota Drive menyebut per-menit 1.000.000 units/project, 325.000 units/user/project, daily project egress 1 TB, dan daily billing threshold 400.000.000 quota units; pemakaian di bawah threshold saat ini dinyatakan tidak menimbulkan extra charge. Halaman yang sama mengatakan detail billing penuh akan diberitahukan kemudian pada 2026, minimal 90 hari sebelumnya. | Google API dapat menolak request karena kuota; kebijakan billing di atas masih perlu pemeriksaan ulang saat ini. Tidak ada bukti bahwa project tertentu tidak ditautkan ke Billing account. OAuth verification/brand-review requirements dapat berlaku untuk aplikasi external; biaya/keputusan verification tidak diperiksa. | Pengguna melaporkan Billing account tidak tertaut (2026-11-01); belum diverifikasi melalui Cloud Console. **PERLU KONFIRMASI:** project API yang benar, usage/quota, API yang enabled, consent audience/verification, serta alert. Jangan link billing account sebagai langkah “uji”. |
| **Google Drive storage pengguna** | Google menyatakan Personal Google Account mendapat hingga 15 GB yang dibagi dengan Gmail dan Photos; Workspace/akun berbayar memiliki ketentuan lain. Jika penuh, pengguna tidak dapat membuat/mengunggah file Drive. | Kuota merupakan milik akun pengguna, bukan kapasitas owner aplikasi. Pengguna dapat memilih membeli storage; hal tersebut menjadi biaya pengguna, bukan biaya aplikasi. | **PERLU KONFIRMASI** tipe akun pilot dan kapasitas aktual; jangan menjanjikan 15 GB untuk akun Workspace atau mengunggah data nyata sebelum tahap privasi/migrasi disetujui. |
| **Supabase** | Harga publik saat pemeriksaan mencatat Free US$0/bulan, 500 MB database, 5 GB egress, 1 GB file storage, maksimal dua project aktif, dan pause setelah satu minggu tidak aktif; automatic backups tidak termasuk di Free. Panduan rilis workspace menyebut organisasi masih Free dan Production/Staging berada di `ap-south-1`, tetapi itu catatan repository, bukan pemeriksaan dashboard baru. | Batas Free dapat menyebabkan pause/kegagalan layanan dan tidak menyediakan managed automatic backups. Upgrade Pro dari US$25/bulan plus kemungkinan biaya project/usage. | Pengguna melaporkan plan Free dan usage di bawah limit (2026-11-01); belum diverifikasi melalui dashboard. Backup otomatis tetap tidak tersedia di Free. Sasaran pengguna tetap mengeluarkan Supabase dari jalur kritis; port Worker yang masih memakai Supabase bukan solusi akhir. Jangan upgrade, pause, migrasi, atau menghapus project. |
| **Vercel saat ini** | Panduan rilis mencatat Production Ready dan project menggunakan Vercel; konfigurasi root berisi API dan cron. Harga Hobby publik menyatakan paket gratis, tetapi Fair Use membatasi Hobby ke penggunaan personal non-komersial; penggunaan komersial memerlukan Pro/Enterprise. Definisi Vercel mempertimbangkan tujuan finansial siapa pun yang terlibat dalam produksi. | Jika Hobby dan penggunaan termasuk komersial menurut definisi Vercel, ada risiko ketidakpatuhan paket dan kemungkinan biaya plan lain. Jika melewati limit Hobby, kebanyakan usage menunggu periode reset; jangan mengasumsikan dapat scale tanpa biaya. | Pengguna menetapkan Vercel tetap di Hobby dan menyatakan Fair Use telah ditinjau serta sesuai (2026-11-01). Menu akun menampilkan opsi “Upgrade to Pro”, konsisten dengan konfirmasi tersebut. Usage aktual belum ditinjau. Tidak ada perubahan plan. |
| **GitHub Actions / secret scanning** | GitHub API metadata menyatakan `raimundus-ciku-koten/AI_nnoe-Learning-Ecosystem` publik. Workflow web memakai `ubuntu-latest`; GitHub menyatakan standard GitHub-hosted runners di repo publik gratis. Secret scanning tersedia otomatis gratis untuk repo publik. | Artifact/cache storage memiliki allowance dan dapat menjadi biaya atau dibatasi menurut plan/usage; larger runners tidak gratis. Workflow backup Staging manual memakai retensi artifact satu hari; panduan mencatat artifact 352.895 byte pada run 2026-10-28, bukan penggunaan saat ini. | Pengguna menyatakan runner standard dan artifact/cache storage telah diperiksa serta masih dalam allowance (2026-11-01); belum diverifikasi independen. Jangan mengunggah artifact backup baru hanya untuk memeriksa biaya. |
| **AI** | Panduan rilis/source menyatakan `/api/ai` ditutup dengan `410 cloud_ai_disabled`; generation saat ini diarahkan ke Ollama lokal pengguna. BYOK cloud belum aktif. | Tidak ada provider API AI cloud yang ditagihkan ke owner pada jalur source tersebut; penggunaan Ollama memakai perangkat/listrik pengguna. Perubahan ke provider cloud akan menambah model biaya baru dan memerlukan approval baru. | Pertahankan cloud AI disabled. Jangan menambah key, paid API, atau fallback cloud sebagai bagian Tahap 1. |
| **Domain, monitoring, storage tambahan** | Tahap 3 belum menentukan domain final atau monitoring. Pilihan tanpa domain sendiri dapat memakai hostname platform, sedangkan pendaftaran/renewal domain, R2/object storage, log drain/retention, dan produk monitoring adalah komponen terpisah. | Dapat memiliki biaya langganan/usage; nilai aktual dan kebutuhan belum ditentukan. | **PERLU KONFIRMASI** sebelum memilih domain berbayar, R2, logging berbayar, paid monitoring, KV/Queues atau layanan tambahan. Tidak dibuat atau diaktifkan. |

## Kelayakan skenario “biaya owner = nol”

Biaya owner nol **belum terverifikasi**. Itu hanya dapat dipertimbangkan setelah semua kondisi berikut benar:

- Cloudflare account memang di Workers Free, tidak ada produk/plan berbayar lain yang relevan, dan deployment tidak mengaktifkan produk usage-based.
- Request API, CPU request, cron CPU, jumlah trigger dan assets memenuhi limit Free dengan margin yang diukur; tidak ada auto-upgrade/paid usage tanpa persetujuan.
- Google Cloud project tidak terhubung ke Billing account sesuai keputusan pengguna, penggunaan API dan kebijakan Drive billing terbaru telah ditinjau, dan tidak ada produk berbayar lain pada project.
- Supabase plan dan usage aktual telah diverifikasi; selama Supabase masih menjadi dependency, risiko pause/egress/storage/backup tetap diterima secara eksplisit.
- Vercel Hobby compliance disetujui untuk penggunaan aplikasi saat ini, atau deployment tetap dijaga sesuai persetujuan plan yang berlaku.
- GitHub Actions berjalan pada standard public runners; artifact, cache, storage dan CI usage tetap di allowance.
- Tidak ada domain renewal, R2, paid logging/monitoring, Workers Paid, paid AI, billing upgrade, atau layanan eksternal tambahan yang belum disetujui.

**Biaya nol bukan target yang boleh dipaksakan dengan mengorbankan availability, backup, retensi, keamanan, atau kebijakan provider.** Jika desain tidak berjalan pada kuota gratis, hentikan rollout dan mintakan keputusan biaya atau desain ulang; jangan otomatis meng-upgrade.

## Pemeriksaan akun yang masih diperlukan

Laporan ini sengaja tidak meminta screenshot yang menampilkan nomor kartu, invoice lengkap, alamat pribadi, email admin, project/account ID, key, token, ataupun secret. Pemilik dapat membaca Dashboard masing-masing dan hanya mengonfirmasi status berikut:

### Konfirmasi pengguna

Pada 2026-11-01, pengguna menyampaikan: Cloudflare Workers Free tanpa layanan berbayar lain yang diketahui; Google Cloud Billing account tidak tertaut; Supabase Free dan usage di bawah limit; Vercel dipertahankan pada Hobby dan Fair Use telah ditinjau serta sesuai; runner standard GitHub dan artifact/cache masih dalam allowance; tidak ada layanan tambahan yang diketahui. Ini adalah **konfirmasi pengguna, bukan audit independen atas billing/usage**. Dashboard Vercel berhasil dibuka setelah pengguna login; menu akun menampilkan opsi “Upgrade to Pro”, konsisten dengan status Hobby yang dikonfirmasi. Tidak ada perubahan plan atau kredensial yang dimasukkan/diminta oleh asisten.

1. Cloudflare: plan Workers aktif; apakah ada langganan/produk berbayar atau usage charges; request/day dan CPU usage; alert/spending controls; jumlah Cron Triggers.
2. Google Cloud: apakah billing account tertaut ke project Drive/OAuth; pemakaian quota Drive dan pemberitahuan billing terbaru; tipe project/audience consent. **Jangan menghubungkan billing account.**
3. Supabase: organisasi masih Free atau tidak; project aktif dan usage/limit saat ini; kondisi backup. Jangan mengubah/menghapus/upgrade project.
4. Vercel: pemilik memilih mempertahankan Hobby dan menyatakan Fair Use sesuai; tinjau usage/alert sebelum rilis.
5. GitHub: pemilik menyatakan standard runner dan artifact/cache dalam allowance; verifikasi ulang bila visibilitas, workflow, atau retention berubah.
6. Produk tambahan/domain/monitoring/storage: apakah ada biaya atau renewal aktif yang terkait; cukup status ya/tidak/tidak diketahui.

Jika pengguna ingin melaporkan hasil melalui chat, kirim hanya kategori dan status `ya/tidak/tidak diketahui` atau nama plan. Jangan kirim nominal tagihan personal, nomor pembayaran, identifier akun, screenshot sensitif, atau nilai secret.

## Gerbang Stage 1

| Gerbang | Status |
|---|---|
| Dokumentasi harga/limit publik diperiksa ulang pada 2026-11-01 | **Selesai untuk bukti publik**, tetapi wajib diulang sebelum rilis karena syarat/limit dapat berubah. |
| Status plan Cloudflare, Google Cloud Billing, Supabase, dan Vercel; GitHub Actions allowance | **Dikonfirmasi pengguna; belum diaudit independen. Vercel dipertahankan pada Hobby; GitHub runner/artifact allowance dilaporkan sesuai.** |
| Kesesuaian penggunaan Vercel Hobby dengan Fair Use | **Pengguna menyatakan telah ditinjau dan sesuai; bukan penilaian hukum independen.** |
| Kelayakan cron Cloudflare Free 10 ms CPU | **Belum dibuktikan. Benchmark lokal hanya mengukur waktu dinding dan tidak menegakkan batas paket; NO-GO produksi.** |
| Google Cloud no-billing guard dan quota Drive terbaru | **Belum diverifikasi; detail billing Drive ditandai berubah kemudian pada 2026.** |
| Supabase keluar dari jalur kritis | **Keputusan pengguna dipertahankan, tetapi desain pengganti belum selesai.** |
| Persetujuan upgrade, billing, produk tambahan, atau deploy | **Tidak diberikan dalam pekerjaan ini.** |

**Kesimpulan:** Tahap 1 sudah menyelesaikan pemeriksaan dokumentasi publik dan mencatat batas biaya. Tahap 1 **belum lulus sebagai verifikasi akun maupun gerbang produksi**. Tahan implementasi/deploy tahap berikutnya sampai konfirmasi akun, profil CPU yang valid, desain kerja cron berbatas, keputusan pengganti Supabase, dan approval rilis selesai.

## Metode dan sumber

Dokumentasi Supabase changelog juga dipindai untuk `Breaking Change`; tidak ditemukan perubahan harga paket yang relevan pada entri yang diperiksa. Changelog mencatat perubahan TLS/Auth/Data API pada Oktober dan perubahan Postgres September; itu bukan bukti harga/billing akun dan perlu ditinjau bila runtime/data Supabase nanti berubah.

Sumber primer, diakses 2026-11-01:

- [Cloudflare Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/) (diperbarui 2026-10-02)
- [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/) (diperbarui 2026-10-29)
- [Cloudflare Workers local development](https://developers.cloudflare.com/workers/local-development/)
- [Cloudflare scheduled handler](https://developers.cloudflare.com/workers/runtime-apis/handlers/scheduled/)
- [Cloudflare Workers Static Assets billing](https://developers.cloudflare.com/workers/static-assets/billing-and-limitations/) (diperbarui 2026-04-23)
- [Cloudflare Pages limits](https://developers.cloudflare.com/pages/platform/limits/) (diperbarui 2026-09-05)
- [Cloudflare Cron Triggers](https://developers.cloudflare.com/workers/configuration/cron-triggers/) (diperbarui 2026-10-17)
- [Supabase pricing](https://supabase.com/pricing)
- [Supabase changelog](https://supabase.com/changelog.md)
- [Google Drive API usage limits dan daily billing threshold](https://developers.google.com/workspace/drive/api/guides/limits)
- [Google Drive API setup](https://developers.google.com/workspace/drive/api/guides/enable-sdk)
- [Google Drive storage untuk akun personal](https://support.google.com/drive/answer/6374270)
- [Google OAuth verification untuk brand](https://developers.google.com/identity/protocols/oauth2/production-readiness/brand-verification) dan [daftar scope](https://developers.google.com/identity/protocols/oauth2/scopes)
- [Google Cloud billing account/project](https://cloud.google.com/billing/docs/how-to/modify-project)
- [GitHub Actions billing](https://docs.github.com/en/billing/concepts/product-billing/github-actions)
- [GitHub secret scanning](https://docs.github.com/en/code-security/concepts/secret-security/secret-scanning)
- [Vercel Hobby plan](https://vercel.com/docs/plans/hobby) dan [fair use/commercial usage](https://vercel.com/docs/limits/fair-use-guidelines)
- Metadata publik repository melalui [GitHub API](https://api.github.com/repos/raimundus-ciku-koten/AI_nnoe-Learning-Ecosystem); nilai `private: false` saat diperiksa.

Sumber lokal:

- [Panduan deployment](../DEPLOYMENT_GUIDE.md) — status provider/plan yang tercatat, tanpa pembacaan secret.
- [Spesifikasi port API/cron Tahap 3](./cloudflare-workers-api-migration-spec.md) dan [threat model Tahap 2](./cloudflare-workers-stage2-threat-model.md).
- [Konfigurasi Vercel root](../vercel.json), [workflow Web CI](../.github/workflows/web-ci.yml), [cron audit](../api/cron/lesson-journal-audit.js), dan [helper audit](../api/_lib/journal-audit.js).

## Benchmark sintetis lokal — bukan gerbang lulus

Benchmark dijalankan dengan Wrangler 4.156.0 dan Workerd lokal. Fixture hanya membentuk payload JSON/query, memvalidasi ID sintetis, dan meng-encode path; tidak menghubungi Supabase, Google, Cloudflare account, atau endpoint hosted, serta tidak memakai secret/binding. Beban setiap pengguna disetel pada batas kode saat ini: hingga 25 event antrean dan hingga 1.000 ID file retensi. Endpoint `scheduled()` juga dipicu lokal dan menghasilkan `outcome: ok`; invocation tersebut mencatat sekitar 324 ms waktu dinding untuk 1.000 pengguna.

| Pengguna sintetis | Event antrean | ID file | Waktu dinding (3 pengulangan) |
|---:|---:|---:|---:|
| 1 | 25 | 1.000 | 0–1 ms |
| 10 | 250 | 10.000 | 3–4 ms |
| 25 | 625 | 25.000 | 8–9 ms |
| 50 | 1.250 | 50.000 | 16–17 ms |
| 100 | 2.500 | 100.000 | 32–33 ms |
| 1.000 | 25.000 | 1.000.000 | 332–358 ms |

Waktu tersebut adalah `performance.now()` pada runtime lokal, bukan CPU time dari layanan Workers. Walaupun `limits.cpu_ms` disetel ke 10, panggilan HTTP 50–1.000 pengguna dan cron 1.000 pengguna tetap selesai; jadi emulator ini tidak menegakkan batas paket Free yang diperlukan untuk menyatakan lulus. Benchmark juga sengaja tidak meniru biaya parsing respons provider, round-trip jaringan, retry, maupun variasi produksi. Hasilnya menunjukkan beban sintetis penuh tidak punya bukti margin 10 ms, tetapi **tidak dapat dipakai untuk memprediksi CPU Cloudflare secara kuantitatif**.

**Keputusan:** tahap verifikasi biaya tetap **NO-GO untuk produksi**. Tindakan yang sesuai batas pengguna adalah mempertahankan paket gratis, tidak menautkan billing, tidak upgrade, dan tidak deploy; merancang pembagian backlog terlebih dahulu. Bila akurasi 10 ms diperlukan, gunakan profiling Worker aktual hanya setelah ada lingkungan uji yang tetap gratis dan disetujui. Jika itu tidak tersedia, catat batas verifikasi sebagai belum terselesaikan—jangan memakai paket berbayar sebagai jalan pintas.

Validasi yang dijalankan adalah benchmark fixture lokal di atas. Tidak ada build aplikasi, tes terhadap akun/provider, invoice, credential, atau penggunaan live.
