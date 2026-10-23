# Laporan Kesiapan Rilis

**Tanggal pemeriksaan:** 23 Oktober 2026
**Keputusan:** **NO-GO untuk rilis publik penuh.** Pertahankan aplikasi pada cakupan login-only sampai semua gate P0 di bawah ditutup.

**Perubahan source 23 Oktober:** public signup/trial signup, halaman simulasi demo-trial dan akses aplikasi role `demo`, UI purchase/paket publik, implementasi Midtrans, registrasi Edge Function pembayaran, komponen iklan, dan aset `ads.txt` telah dihapus dari checkout. Role yang tidak dikenal ditolak dengan pemberitahuan provisioning umum; login dan provisioning administrator tetap ada. Migrasi maju untuk menghapus relasi billing/trial, field trial, role demo di allowlist, dan gating entitlement pada RLS telah ditambahkan, tetapi belum diuji pada backup restore disposable maupun dijalankan. Tidak ada perubahan hosted, deployment, secret/provider setting, akun, data sekolah, atau Git history.

## Ringkasan eksekutif

Validasi kode lokal berhasil. Snapshot Supabase Staging yang terakhir menunjukkan switch “Allow new users to sign up” tidak tercentang dan tombol “Save changes” nonaktif; signup Staging tampak nonaktif saat snapshot itu diambil, tetapi persistensi belum dapat dikonfirmasi. Signup Production belum diperiksa. Provider Google Staging nonaktif dan permintaan otorisasi menghasilkan HTTP 400 `provider is not enabled`. File `ads.txt` masih tersaji dari Production. GitHub Actions memiliki Web CI sukses pada 22 Oktober 2026 di branch ini, tetapi commit tersebut bukan kandidat cleanup lokal. Vercel dashboard tidak menyediakan sesi terautentikasi; konfigurasi Preview/Production dan deployment belum diverifikasi.

Mode zero-billing tetap menjadi batas operasional: jangan mengaktifkan layanan berbayar atau memicu workflow backup sebelum pemilik memeriksa kuota, tagihan, dan persyaratan akun. Tidak ada jaminan bahwa free tier akan selalu bebas biaya atau mencukupi.

## Pembaruan eksekusi 23 Oktober 2026

- `npm test` lulus (exit code 0); tes tambahan backup (8), economy mode (3), dan Turnstile (2) lulus. Build production, build Staging, dan build CI sesuai workflow berhasil. Pemeriksaan bundle hasil build tidak menemukan penanda fitur Midtrans, iklan, trial, atau billing yang telah dihapus. Build mengeluarkan peringatan React Router bahwa direktif `"use client"` diabaikan.
- File service-account yang diabaikan Git tetap ada di workspace dan tidak tercatat dalam riwayat Git lokal yang diperiksa. Google Cloud Console masih menampilkan key yang cocok sebagai aktif. Identitas Google Cloud CLI tidak memiliki izin `iam.serviceAccountKeys.list`, dan halaman IAM menolak penghapusan karena izin `iam.serviceAccountKeys.delete` tidak tersedia. Belum ada key atau konfigurasi cloud yang diubah. Administrator proyek harus mencabut key langsung; setelah itu verifikasi ulang dan tangani salinan lokal melalui prosedur pengelolaan secret yang disetujui.
- Pengguna mengizinkan push branch untuk CI dan Preview login-only, tanpa promosi Production. Push bukan bukti Preview aman untuk data nyata; pemisahan environment dan konfigurasi Preview harus diverifikasi setelah pipeline selesai. Tidak ada migrasi, perubahan Auth/provider, atau workflow backup yang dijalankan.
- Checkout masih di branch `chore/link-ale-web-submodule`, tiga commit di depan remote, dengan tiga file konfigurasi untracked yang tidak disentuh. Jangan deploy checkout ini apa adanya; tinjau dan siapkan kandidat bersih terlebih dahulu.

## Hasil pemeriksaan dan gate

| Gate | Status | Bukti / kondisi | Syarat untuk menutup gate |
|---|---|---|---|
| OAuth Google Staging | **BLOCKED — P0** | Permintaan otorisasi Staging menghasilkan HTTP 400: `provider is not enabled`. Panduan deployment mencatat provider Supabase Staging nonaktif dan client OAuth terdampak harus dianggap kompromi. | Administrator Google Cloud mencabut/menghapus client terdampak, membuat client Staging baru, lalu mengonfigurasi ID dan secret langsung di Supabase Staging. Uji redirect dan sign-in berhasil. Jangan mengubah client Production. |
| Provenance dan kesesuaian skema | **BLOCKED — P0** | Inventaris metadata bertanggal 21 Oktober mencatat 8 tabel publik; 2 dari 36 relasi aplikasi yang diaudit tersedia, 34 belum ada, dan `supabase_migrations.schema_migrations` tidak ditemukan. Tabel permintaan sekolah yang lama memiliki kontrak berbeda dari aplikasi. | Rekonsiliasi setiap migrasi dan relasi dengan skema hosted; pertahankan tabel/RPC legacy; dokumentasikan baseline dan hasil audit baru sebelum perubahan. |
| Backup dan pemulihan | **BLOCKED — P0** | Tes enkripsi lokal lulus, tetapi tidak membuktikan backup hosted maupun restore. Panduan deployment mencatat eksekusi backup terdahulu gagal karena kredensial database ditolak. | Pemilik memeriksa kuota/biaya Actions, memperbarui secret langsung di GitHub bila perlu, membuat backup Staging terenkripsi, lalu memulihkan dan memverifikasinya pada PostgreSQL disposable. Jangan mengirim secret melalui chat. |
| Migrasi Staging | **BLOCKED — P0** | Tidak ada migrasi hosted yang dijalankan; gate backup/restore dan provenance belum terpenuhi. | Setelah dua gate di atas selesai, tinjau SQL dan dampaknya, dapatkan persetujuan pemilik, terapkan ke Staging saja, lalu audit ulang skema dan uji regresi. |
| RLS, tenant, role, MFA/AAL2 | **BELUM DIVERIFIKASI DI HOSTED — P0** | Tes lokal memvalidasi sebagian logika role, MFA, dan migration policy. Tes lokal tidak membuktikan policy aktif pada database Staging. | Uji dengan akun uji per role dan tenant: akses lintas-tenant ditolak, akses role sesuai kebijakan, AAL2 wajib untuk akses istimewa, dan audit tidak membocorkan data. |
| Signup dan demo trial | **SOURCE REMOVED; HOSTED STATE UNVERIFIED** | Source/config lokal menonaktifkan pendaftaran publik; signup publik/trial, halaman simulasi demo-trial, dan route/menu aktif dihapus. Role yang tidak dikenal ditolak secara umum. Migrasi maju menghapus role demo dari allowlist dan membersihkan role pada profil, tetapi belum dieksekusi atau diuji pada disposable restore. Hosted Auth settings dan data belum diubah. | Muat ulang Auth settings Staging dan Production, pastikan “Allow new users to sign up” mati pada keduanya. Uji deployment kandidat untuk login/provisioning admin dan penolakan akun tak terprovisi. Jangan menerapkan migrasi sebelum gate backup/restore, provenance, review SQL, dan persetujuan Staging ditutup. |
| CAPTCHA, privasi/legal | **PARTIAL / ENVIRONMENT-DEPENDENT** | Login masih dapat memakai Turnstile jika dikonfigurasi; penghapusan signup tidak mengubah CAPTCHA/Auth settings. Proses privasi/legal tetap relevan untuk data akun yang sudah ada. | Uji CAPTCHA pada login/password recovery bila diaktifkan; lengkapi pengelolaan privasi dan penghapusan data untuk pengguna yang ada. |
| CI, tes, dan build lokal | **PASS LOKAL; CANDIDATE CI PENDING PUSH** | Eksekusi 23 Oktober: `npm test`, build production, build Staging, build CI, dan tes backup/economy/security lulus. GitHub Actions sukses pada commit lama branch ini, bukan pada kandidat saat ini. SQL migration cleanup belum dijalankan atau diuji terhadap database. | Push kandidat yang disetujui, pastikan CI sukses pada SHA baru, lalu arsipkan hasilnya. Ini bukan bukti acceptance test hosted. |
| Android/PWA dan aksesibilitas | **PARTIAL — belum release-verified** | Proyek Android dan workflow Android CI ada. Tidak ada hasil uji perangkat nyata, uji signed release key, atau audit aksesibilitas lintas halaman dalam pemeriksaan ini. | Jalankan Android CI pada kandidat rilis; uji TWA di perangkat Android representatif, login/redirect, tautan eksternal, jaringan buruk, ukuran layar, dan alur pemulihan. Lakukan keyboard, screen reader, zoom/reflow, dan contrast review. |
| Smoke test deployment dan promosi | **BLOCKED — P0** | Tidak ada deployment/promosi yang dilakukan. Smoke test hosted lengkap belum berhasil; alur Google Staging saat ini gagal. | Gunakan Preview yang dilindungi SSO atau akses uji yang disetujui; jalankan smoke test autentikasi dan fitur yang telah dimigrasikan. Promosi memerlukan persetujuan eksplisit dan rencana rollback teruji. |
| Billing/trial schema | **MIGRATION DRAFTED; NOT VALIDATED OR APPLIED** | Forward migration menjatuhkan tabel payment, pricing, personal/tenant entitlement, trial; kolom `profiles.trial_expires_at`; dan mengganti RLS gates yang bergantung pada entitlement. Migrasi juga menghapus row allowlist role demo serta menurunkan profil demo ke `unprovisioned`. Auth identities dan tenant/data sekolah tidak dihapus. Migration provenance Staging, backup, dan restore belum terbukti; SQL ini berpotensi destruktif. | Rekonsiliasi skema/provenance; buat backup Staging dan buktikan restore di database disposable; tinjau efek pada data, constraint, Auth trigger, dan seluruh policy; minta persetujuan eksplisit untuk Staging; baru kemudian terapkan dan uji regresi. Jangan jalankan di Production. |
| Midtrans dan iklan | **SOURCE REMOVED; HOSTED DECOMMISSION INCOMPLETE** | Source/config Midtrans, UI, komponen iklan, dan `ads.txt` sudah tidak ada di checkout. URL Production masih diketahui menyajikan `ads.txt` pada pemeriksaan sebelumnya; status Edge Function dan provider Midtrans hosted belum diverifikasi ulang. | Hapus `ads.txt` dari deployment aktif melalui build yang ditinjau, lalu pastikan URL mengembalikan 404/410 dan tidak ada referensi iklan pada halaman/asset yang ter-deploy. Verifikasi Edge Function Midtrans tidak ter-deploy dan nonaktifkan/revoke integrasi provider hanya setelah memastikan cakupan/resource yang tepat. |

## Validasi yang dijalankan

Pemeriksaan lokal pada 23 Oktober 2026:

- `npm test` — lulus (exit code 0; jumlah tes tidak dicatat oleh output agregat).
- `npm run build` — berhasil.
- `npm --prefix web run build:staging` — berhasil.
- `npm run build -- --mode ci` dari `web/`, sesuai workflow — berhasil.
- `npm --prefix web run test:backup` — 8 lulus.
- `npm --prefix web run test:economy` — 3 lulus.
- `npm --prefix web run test:security` — 2 lulus.
- `git diff --check` — berhasil sebelum pembaruan laporan ini.
- Penanda Midtrans, `ads.txt`, trial, payment, dan billing yang dihapus tidak ditemukan dalam bundle JavaScript hasil build.

Build mengeluarkan peringatan bundler bahwa direktif `"use client"` pada dependensi React Router diabaikan. Peringatan tidak menghentikan build, tetapi perlu ditinjau saat pembaruan dependensi berikutnya.

## Rencana eksekusi aman

### A. Tindakan administrator/pemilik

1. Jika Google sign-in Staging tetap diperlukan, cabut client OAuth Staging yang terdampak dan siapkan client baru khusus Staging. Jangan memakai ulang client atau secret terdampak.
2. Simpan client baru langsung di pengaturan Supabase Staging dengan callback yang tepat; jangan mengirim secret lewat chat atau memasukkannya ke frontend.
3. Aktifkan Google provider Staging hanya setelah credential pengganti siap, lalu uji sign-in dan redirect dengan akun uji yang disetujui. Jika belum siap, biarkan provider nonaktif.
4. Verifikasi kuota dan kemungkinan biaya GitHub Actions sebelum menjalankan workflow backup manual. Pastikan secret database hanya menunjuk Staging.
5. Buat backup terenkripsi, unduh sesuai masa retensi, pulihkan ke database disposable, dan catat hasil verifikasi. Jangan menguji restore pada Production.

### B. Tindakan engineering setelah A

1. Audit baseline migrasi dan skema Staging tanpa menyalin data Production. Cocokkan tabel, fungsi, trigger, policy, dan RPC dengan kontrak aplikasi.
2. Siapkan rencana migrasi per versi berikut dampak, validasi, dan rollback. Tidak boleh ada perubahan hosted tanpa persetujuan pemilik.
3. Terapkan migrasi yang disetujui ke Staging setelah backup/restore terverifikasi. Jalankan ulang audit skema serta tes integrasi RLS, tenant, role, MFA/AAL2, Auth redirect, dan fitur yang berubah.
4. Matikan signup publik di project Supabase Staging dan Production; verifikasi login/password recovery dan provisioning admin tetap utuh. Source cleanup sendiri belum mengubah hosted state.
5. Hapus ads.txt dari deployment Production dan verifikasi URL, halaman, serta asset build. Pastikan fungsi Midtrans tidak ter-deploy dan lakukan dekomisioning provider yang sesuai tanpa memengaruhi data/akun.
6. Perubahan Production/deployment perlu persetujuan eksplisit, rencana rollback, dan akses dashboard interaktif. OAuth Google untuk sign-in tetap terpisah dari signup; jangan aktifkan provider Staging dengan credential terdampak.
7. Jalankan CI pada commit kandidat, acceptance test browser, accessibility review, dan uji perangkat Android. Catat commit, hasil tes, lingkungan, serta bukti tanpa rahasia atau data pribadi.
8. Lakukan smoke test Preview yang telah diotorisasi. Promosikan hanya setelah persetujuan eksplisit, verifikasi konfigurasi Production, dan rollback plan tersedia.

## Batas pemeriksaan ini

Pemeriksaan ini tidak menjalankan query tulis, workflow backup, atau migrasi. Tidak ada Auth/provider setting atau resource Production yang diubah. Google Cloud Console masih menunjukkan key aktif; pencabutan tidak dapat dilakukan karena izin IAM tidak mencukupi. Browser Vercel tidak menyediakan dashboard terautentikasi, sehingga konfigurasi Preview/Production belum diverifikasi. Pengguna mengizinkan push untuk CI dan Preview saja; hasil CI dan Preview pada commit kandidat masih diperlukan. Checkout memiliki tiga file konfigurasi untracked yang tidak disentuh dan tidak akan dimasukkan ke kandidat. Data hosted yang dirangkum dari audit schema dan backup mengacu pada catatan terdokumentasi dalam [DEPLOYMENT_GUIDE.md](./DEPLOYMENT_GUIDE.md), bukan inventaris database baru. Hasil build dan tes lokal tidak membuktikan kesiapan backend hosted atau Production.

**Keputusan akhir:** pertahankan login-only release. Jangan promosi ke rilis umum atau jalankan hosted migration sebelum gate P0 lain ditutup. Jangan aktifkan kembali signup, Midtrans, atau iklan. Deployment source cleanup dan dekomisioning provider hosted belum dilakukan.
