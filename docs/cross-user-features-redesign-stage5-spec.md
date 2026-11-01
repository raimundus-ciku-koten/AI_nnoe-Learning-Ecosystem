# Spesifikasi teknis Tahap 5 — desain ulang fitur lintas pengguna

**Status:** draf desain untuk keputusan produk dan kelayakan; belum siap implementasi produksi
**Tanggal audit kode:** 1 November 2026
**Keputusan pengguna:** desain ulang fitur lintas pengguna; seluruh kategori data boleh dipertimbangkan hanya setelah tinjauan privasi/hukum dan persetujuan terkait selesai.
**Cakupan target:** seluruh kapabilitas yang dipilih pengguna, termasuk data personal/sekolah, asesmen bersama, chat, panggilan, notifikasi, administrasi platform, konten, dan entitlement/pembayaran; tidak ada kapabilitas yang boleh dihapus diam-diam.
**Keputusan rilis:** **NO-GO publik** sampai setiap kapabilitas target memiliki rancangan tanpa biaya owner yang terverifikasi, implementasi lengkap, kontrol akses dan privasi yang disetujui, serta pengujian dan prosedur pemulihan yang lulus. Bila satu kapabilitas tidak memenuhi syarat, rilis tetap ditahan dan cakupan/arsitektur harus diputuskan ulang.
**Batas arsitektur:** Supabase keluar dari jalur kritis; data aplikasi berada di perangkat atau akun penyimpanan pengguna; biaya owner harus tetap nol; tidak boleh menghubungkan billing, upgrade paket, atau deploy dalam pekerjaan desain.
**Gerbang terkait:** [verifikasi biaya Tahap 1](./cloudflare-cost-plan-verification-stage1.md), [threat model Tahap 2](./cloudflare-workers-stage2-threat-model.md), [spesifikasi port API Tahap 3](./cloudflare-workers-api-migration-spec.md), dan [spesifikasi migrasi Tahap 4](./identity-data-migration-spec.md).

## Latar belakang

Aplikasi memiliki fitur personal dan lintas pengguna yang dikembangkan dengan model identitas, database, serta kontrol server-side. Keputusan target saat ini mengeluarkan Supabase dari jalur kritis dan tidak memberikan anggaran untuk layanan owner berbayar. Memindahkan tampilan atau API ke Worker stateless saja tidak mengganti otorisasi, state, realtime, push, audit, dan koordinasi sekolah yang sekarang disediakan layanan terpusat.

Spesifikasi ini menginventarisasi perilaku lintas pengguna dan menentukan gerbang untuk mendesain ulangnya. Ini bukan persetujuan menghapus fitur, mengubah layanan hosted, memigrasikan data, atau mengklaim bahwa pengganti tanpa server dapat memberi paritas penuh.

### Fakta dari workspace

- Autentikasi dan profil menggunakan Supabase Auth serta `profiles`; tenant, role/allowlist, pengaturan sekolah, dan entitlement dibaca atau diubah melalui Supabase.
- Roster siswa, penugasan guru, jurnal, asesmen online, tautan akun siswa, hasil ujian, dan review jawaban menggunakan tabel/RPC Supabase. Beberapa operasi ujian bergantung pada validasi server/database.
- Chat, inbox, pesan, presence, read receipt, signaling panggilan, riwayat panggilan, dan pengiriman push memakai Supabase Realtime, tabel, atau Edge Functions. Lampiran chat menggunakan Google Drive.
- `CHAT_E2EE_READY` bernilai `false`; `CHAT_FEATURE_ENABLED` dan `CHAT_CALLS_ENABLED` karenanya nonaktif. Rute chat menampilkan status tidak tersedia dan tidak boleh dianggap siap dirilis.
- Paket perencanaan Drive yang ada dienkripsi pada klien, tetapi identitas paket terikat pada `ownerUid`/`tenantId`; direktori kunci publik dan fitur berbagi tertentu bergantung pada Supabase.
- `platform_control` mengelola maintenance/feature flags. Halaman operasi dan direktori pengguna lintas tenant memerlukan otorisasi superadmin server-side.
- Panduan rilis menyatakan beberapa schema hosted belum diverifikasi. Hasil uji lokal atau keberadaan migration file bukan bukti schema Production telah diterapkan.

### Asumsi desain

- Tidak ada database terpusat, message broker, SFU, atau layanan stateful baru yang boleh dijadikan prasyarat sampai pengguna mengonfirmasi bahwa layanan itu memenuhi batas biaya dan privasi.
- Google Drive milik pengguna dapat dipertimbangkan sebagai media sinkronisasi/berbagi file, tetapi scope, ACL, quota, kepemilikan file, penggunaan Google Workspace, dan perilaku lintas akun masih **PERLU KONFIRMASI**.
- Fitur yang membutuhkan otoritas tepercaya tidak boleh diganti dengan pemeriksaan UI, file manifest yang dapat diedit klien, atau cache lokal seolah-olah setara dengan enforcement server-side.

## Tujuan dan non-tujuan

### Tujuan

1. Mempertahankan inventaris kemampuan yang sudah ada tanpa menghapusnya secara diam-diam.
2. Memisahkan pengalaman personal/offline dari fitur yang memerlukan kolaborasi atau otoritas lintas akun.
3. Menilai setiap fitur terhadap privasi, model otorisasi, sumber state, ketahanan offline, serta biaya owner.
4. Menetapkan perilaku aman sementara: fitur yang belum punya pengganti terverifikasi tetap dinonaktifkan atau berstatus belum tersedia.
5. Menggunakan fixture sintetis selama desain dan validasi lokal; data nyata hanya setelah gerbang privasi dan migrasi disetujui.

### Non-tujuan

- Mengimplementasikan ulang seluruh backend atau mengganti Supabase dalam satu perubahan.
- Mengaktifkan chat, panggilan, ujian online, signup, pembayaran, atau administrasi lintas sekolah.
- Memindahkan data siswa, jurnal, nilai, presensi, akun anak, atau token ke Drive sebelum review privasi, consent, retensi, serta akses selesai.
- Membuat layanan hosted, mengubah OAuth consent, DNS, paket provider, billing, atau konfigurasi produksi.
- Mengklaim Worker Free, Drive, browser storage, atau mekanisme peer-to-peer sebagai layanan berkapasitas/berdurabilitas terjamin.

## Desain tingkat tinggi

### Prinsip sasaran

1. **Personal-first:** pekerjaan perorangan dapat dibuat dan dibaca lokal tanpa jaringan. Sinkronisasi Drive adalah pilihan pengguna dengan status eksplisit; kegagalan sinkronisasi tidak menghilangkan salinan lokal.
2. **Privat secara bawaan:** dokumen pribadi tidak dibagikan otomatis berdasarkan domain email, nama sekolah, role cache, atau metadata klien.
3. **Otorisasi pada batas kepercayaan:** untuk tindakan lintas akun, hak akses harus dapat ditegakkan dan dicabut oleh provider/otoritas yang dipercaya. Route tersembunyi, feature flag klien, dan `ownerId` pada payload bukan kontrol otorisasi.
4. **Enkripsi bukan otorisasi:** ciphertext Drive melindungi isi saat tersimpan, tetapi tidak membuktikan siapa yang boleh membaca metadata, mengubah dokumen, menilai ujian, atau memberi role sekolah.
5. **Tidak ada sukses palsu:** status `tersimpan lokal`, `menunggu sinkronisasi`, `dibagikan`, dan `terverifikasi` harus berbeda. Gagal jaringan/Drive tidak boleh ditampilkan sebagai sukses kolaborasi.
6. **Kelayakan biaya fail-closed:** jika solusi membutuhkan database, egress, push, STUN/TURN, penyimpanan, atau Worker di luar bukti paket gratis yang telah diperiksa, fitur tetap tidak aktif sampai biaya dan kuota diverifikasi.
7. **Tidak ada pemindahan otomatis sumber:** import membuat salinan target yang dapat diverifikasi. Sumber lama tidak dihapus atau dinonaktifkan oleh proses migrasi.

### Opsi arsitektur yang perlu dievaluasi

| Opsi | Perilaku | Kelebihan | Batas/risiko |
|---|---|---|---|
| A. Personal lokal + Drive pengguna | Dokumen milik satu pengguna, IndexedDB sebagai workspace lokal, Drive untuk salinan terenkripsi pilihan pengguna | Paling dekat dengan keputusan tanpa database owner dan biaya owner nol | Tidak menyediakan direktori sekolah, otorisasi admin global, pesan realtime, atau ujian terkoordinasi; recovery lintas perangkat belum ditetapkan |
| B. Berbagi file eksplisit lewat Drive | Pengguna memilih penerima/file dan mengelola izin melalui provider; aplikasi mengenkripsi isi dan memberi envelope kunci penerima | Mungkin memungkinkan kolaborasi berbasis file tanpa database aplikasi | `drive.file`, ACL, folder bersama, identitas penerima, pencabutan, rotasi kunci, dan akun Workspace belum dibuktikan; file sharing tidak sama dengan model tenant sekolah |
| C. Layanan koordinasi milik aplikasi | Backend tepercaya menyediakan direktori, membership, otorisasi, state dan realtime | Dapat mempertahankan lebih banyak perilaku lintas pengguna | Bertentangan dengan sasaran keluar dari jalur kritis Supabase dan belum ada bukti layanan pengganti yang tanpa biaya/risiko tagihan; tidak boleh dipilih secara implisit |

**Rekomendasi desain:** jadikan Opsi A baseline, evaluasi Opsi B per jenis file dengan eksperimen lokal/akun uji yang disetujui, dan jangan menganggap Opsi C tersedia. Ini bukan keputusan final untuk menonaktifkan fitur; setiap kapabilitas harus mendapat status `dipertahankan`, `diubah`, `ditunda`, atau `dihentikan dengan alasan` pada matriks paritas setelah pemilik menyetujui UX dan operasinya.

## Model data

Model berikut adalah kontrak konseptual, bukan skema database:

| Entitas | Kandidat sumber kebenaran | Aturan |
|---|---|---|
| `LocalAccount` | IndexedDB perangkat | ID acak aplikasi; email bukan primary key; terikat ke identitas Google hanya melalui flow yang disetujui |
| `PrivateDocument` | IndexedDB; salinan ciphertext opsional di Drive | ID acak, versi skema/revisi, ciphertext, checksum, waktu perubahan, envelope kunci; tidak memuat data siswa secara default |
| `ShareGrant` | ACL provider + manifest aplikasi minimum | Penerima dan hak file diverifikasi dari provider; manifest klien bukan bukti otorisasi |
| `KeyEnvelope` | Ciphertext pada berkas yang dibagikan | Satu envelope per penerima yang terverifikasi; revoke ACL dan rotasi key adalah operasi terpisah |
| `SchoolMembership` | Belum dipilih | Tidak boleh disimpulkan dari email, `tenantId` buatan klien, atau folder yang dapat ditulis siapa saja |
| `AssessmentAttempt` | Belum dipilih | Ujian dengan deadline, attempt, penilaian, atau anti-manipulasi memerlukan sumber waktu/state tepercaya; local file saja tidak menjamin integritas |
| `ChatEvent`/`CallSignal` | Belum dipilih | Realtime, urutan, anti-replay, kehadiran, dan notifikasi memerlukan kontrak sinkronisasi/otorisasi yang belum tersedia |
| `SubscriptionEntitlement`/`Payment` | Belum dipilih | Status entitlement atau pembayaran tidak boleh berasal dari nilai lokal yang dapat diedit pengguna |

Nama, email, roster, hasil ujian, token, recovery code, dan isi dokumen tidak boleh diletakkan pada nama file, metadata Drive, URL, atau log tanpa kebutuhan dan review privasi.

## Matriks kapabilitas dan alur sasaran

| Kapabilitas aktif/tercatat | Ketergantungan saat ini | Arah desain kandidat | Status sementara |
|---|---|---|---|
| Perencanaan pribadi dan paket terenkripsi | IndexedDB/Drive, `ownerUid`, `tenantId`; sharing memakai direktori kunci | Pertahankan jalur personal lokal; uji pengikatan identitas tanpa tenant pusat; sinkronisasi Drive opt-in | Dapat diprototipekan dengan data sintetis |
| Profil, role, penugasan guru, dan keanggotaan tenant | Supabase Auth, `profiles`, `tenants`, allowlist, RPC/Edge Functions | Pisahkan profil lokal dari klaim role tepercaya; tetapkan apakah admin sekolah mengelola file/provider secara eksplisit atau fitur ditunda | **PERLU KONFIRMASI** model otoritas sekolah |
| Roster, jurnal, presensi, dan data anak | Supabase tables/RPC, owner/tenant policies; sebagian memiliki kandungan sensitif | Inventaris export dan klasifikasi; desain migrasi per-domain setelah review privasi, consent, retensi, dan akses | **Dilarang migrasi sampai review dan persetujuan selesai** |
| Bank soal dan ujian bersama | `question_bank` serta RPC untuk membuat/menjalankan/menilai ujian, link akun siswa, hasil/review | Pisahkan authoring pribadi dari distribusi dan attempt bersama; tentukan server authority atau ubah menjadi alur offline yang tidak mengklaim anti-manipulasi | **PERLU KONFIRMASI** model ujian dan integritas |
| Chat, inbox, presence, push | Supabase tables, Realtime, `chat-push` Edge Function, subscriptions; lampiran Drive | Tetap nonaktif. Evaluasi file-based async sharing terpisah dari kebutuhan realtime; jangan mengklaim setara chat | Nonaktif di source; E2EE belum siap |
| Panggilan audio/video | Supabase private signaling, TURN credentials, history; WebRTC | Tetap nonaktif. Perlu signaling tepercaya, evaluasi topology/capacity, dan verifikasi biaya TURN; P2P tidak menghilangkan kebutuhan signaling | **PERLU KONFIRMASI** topology dan biaya |
| Admin platform, tenant, feature flags, audit operasi | `platform_control`, `profiles`, `tenants`, allowlist, privileged RPC/API | Tidak ada superadmin global tanpa otoritas tepercaya. Pertimbangkan admin lokal yang hanya mengatur berkas sekolah miliknya dan tidak memberi hak lintas akun | **PERLU KONFIRMASI** apakah admin global diperlukan |
| Langganan, entitlement, pembayaran | `tenant_entitlements`, `personal_entitlements`, katalog/rute pembayaran | Jangan menganggap entitlement local aman; payment processing memerlukan provider dan model biaya/legal yang terpisah | Tidak termasuk pilot tanpa persetujuan |
| Notifikasi lintas akun | Push subscription dan backend dispatch | Pertahankan notifikasi lokal; push lintas akun ditunda sampai channel tepercaya, consent, retensi endpoint, dan batas biaya jelas | Belum dirancang untuk arsitektur baru |

## Alur utama

### Pengalaman personal

1. Pengguna masuk dengan mekanisme identitas yang telah disetujui; aplikasi tidak menganggap login Google otomatis memberi hak sekolah.
2. Aplikasi membuka akun lokal dan menampilkan jenis penyimpanan yang tersedia: lokal saja atau sinkronisasi Drive pilihan pengguna.
3. Perubahan disimpan ke IndexedDB terlebih dahulu. UI mengonfirmasi `tersimpan lokal`, bukan `dicadangkan`, sampai upload ciphertext selesai dan diverifikasi.
4. Ketika offline, data lokal tetap dapat dibuka dan perubahan antre; konflik tidak menggabungkan plaintext diam-diam.
5. Ekspor/pemulihan menghasilkan salinan yang dapat diverifikasi. Penghapusan salinan Drive tidak menghapus data lokal atau sumber lama tanpa tindakan terpisah.

### Berbagi dokumen kandidat

1. Pemilik memilih satu dokumen dan penerima tertentu; tidak ada auto-share berdasarkan tenant/email.
2. Aplikasi memverifikasi identitas penerima serta kemampuan provider untuk berbagi file dengan scope minimum.
3. Kunci penerima dan envelope dokumen dibuat/diuji sebelum ACL diubah; kegagalan meninggalkan file privat.
4. ACL provider dan hasil pembukaan ciphertext oleh penerima diverifikasi secara terpisah.
5. Pencabutan akses memblokir provider file; jika penerima pernah mengunduh plaintext/key, pencabutan tidak dapat menarik salinan tersebut. UI wajib menjelaskan batas ini.
6. Konflik dua revisi menghasilkan dua cabang sampai pengguna memilih; tidak ada last-write-wins yang menghapus revisi.

### Administrasi sekolah dan kapabilitas sinkronisasi

- Admin lokal hanya boleh mengelola berkas yang secara eksplisit dimiliki/dibagikan kepadanya; role tidak boleh diberikan melalui payload browser.
- Jika admin global, directory, atau lintas tenant wajib dipertahankan, desain harus mengidentifikasi otoritas tepercaya yang memvalidasi membership dan pencabutan. Drive ACL saja belum dibuktikan memenuhi kebutuhan tersebut.
- Fitur chat, panggilan, ujian online, dan push lintas akun tidak diaktifkan hanya karena dokumen dapat disinkronkan ke Drive.

## Penanganan error

| Kondisi | Perilaku wajib |
|---|---|
| Identitas tidak tersedia/kedaluwarsa | Pertahankan data lokal; hentikan aksi lintas akun; minta autentikasi ulang dengan pesan Indonesia yang jelas |
| Drive offline, 403, revoke, 429, atau kuota | Tandai `local-only`/`pending`/`failed`; hormati `Retry-After`; jangan menyatakan tersinkron atau mengulang tanpa batas |
| ACL atau identitas penerima tidak dapat diverifikasi | Tolak berbagi secara fail-closed; jangan membuat file publik sebagai fallback |
| Envelope/dekripsi/checksum/versi skema gagal | Jangan menimpa record valid; pertahankan ciphertext sumber dan tampilkan langkah pemulihan |
| Konflik revisi | Pertahankan kedua cabang, tampilkan metadata minimal, dan minta keputusan pengguna |
| Kehilangan kunci/perangkat | Tampilkan keterbatasan pemulihan dan opsi restore yang disetujui; jangan mengirim token/kunci ke layanan support |
| Serverless/Worker melampaui kuota atau gagal | Jangan mengasumsikan cron/realtime tetap berjalan; antrekan lokal tetap terlihat dan dapat diekspor |

## Keamanan

- Otorisasi harus ditegakkan pada sumber akses yang tepercaya; UI, feature flag, claim user-editable, `ownerId`, dan manifest lokal bukan kontrol keamanan.
- Minta hanya scope Google yang diperlukan untuk kapabilitas yang benar-benar aktif. Jangan meminta “semua izin” saat login awal hanya demi mengurangi prompt; scope dan alur consent harus disetujui per fitur.
- Jangan menyimpan refresh token plaintext di `localStorage`, IndexedDB, log, URL, telemetry, atau bundle. Persistensi token browser dan pemulihan masih **PERLU KONFIRMASI**.
- Enkripsi dokumen memakai format berversi, AEAD, nonce unik, AAD yang mengikat konteks, serta envelope penerima. Review interoperabilitas format lama sebelum migrasi.
- E2EE chat belum siap pada source; pertukaran kunci tepercaya, multi-device, recovery, dan metadata chat perlu didesain sebelum feature flag diaktifkan.
- Data anak, roster, jurnal, nilai, dan presensi masuk kategori tertunda sampai review privasi/legal, tujuan, consent, retensi, akses dan proses penghapusan disetujui.
- XSS pada origin aplikasi tetap dapat membaca plaintext yang sedang dibuka dan menggunakan sesi/key aktif; CSP, supply-chain, dependency, dan origin isolation perlu masuk threat review.
- Tidak ada informasi token, isi pesan/dokumen, nama/email, kunci, recovery code, atau ID siswa dalam log/diagnostik.
- Rilis harus memiliki mekanisme revoke dan prosedur insiden; file atau salinan yang sudah diunduh penerima tidak dapat dijamin terhapus dari perangkatnya.

## Observability

- Status lokal per dokumen: `local-only`, `pending`, `syncing`, `synced`, `conflict`, `revoked`, atau `failed`, termasuk waktu sinkronisasi terakhir.
- Diagnostik opt-in hanya memuat versi skema/aplikasi, kode error terstandar, durasi, dan jumlah operasi; tanpa identifier pengguna/dokumen atau payload.
- Tidak ada analytics pemakaian individual, audit pusat, atau monitoring global dalam baseline tanpa server.
- Audit operasi yang dapat dihapus pemilik perangkat bukan audit anti-tamper, kepatuhan, atau bukti transaksi.
- Log provider, lokasi, retention, pemrosesan metadata dan biaya harus diverifikasi sebelum mengaktifkan layanan mana pun.

## Rencana pengujian

### Unit dan integrasi lokal

1. Identitas dua pengguna sintetis tidak dapat membaca atau mengubah dokumen privat satu sama lain.
2. Manipulasi ID, owner, tenant, penerima, versi skema, ACL manifest, ciphertext, checksum, nonce, envelope, atau revision ditolak tanpa mengganti data valid.
3. Kegagalan IndexedDB, reload, offline, storage penuh, konflik, dan restore menjaga data lokal dan status yang benar.
4. Share/revoke diuji terpisah pada level ACL provider dan kemampuan decrypt penerima; fixture tidak menggunakan akun pengguna nyata.
5. Jurnal/roster/nilai/data anak ditolak dari fixture Drive produksi sebelum policy gate terbuka.
6. Ujian tidak mengklaim deadline/attempt tepercaya bila waktu dan state sepenuhnya dikendalikan klien.
7. Chat/call flags tetap mati; permission denial, stale session, multi-tab, channel unauthorized, reconnect dan cleanup diuji sebelum desain signaling baru disetujui.
8. Tidak ada uji yang menulis ke Supabase hosted, Drive pengguna, provider OAuth, billing, atau deployment.

### Kriteria penerimaan sebelum implementasi per-domain

- Parity matrix memetakan rute/menu, data, RPC, RLS, Edge Function, cron, role, dan hasil export untuk domain yang dipilih.
- Sumber kebenaran, identitas, pemberian/pencabutan akses, recovery, konflik, dan penghapusan ditetapkan.
- Threat model dan tinjauan privasi/legal diperbarui untuk kategori data serta penerima yang nyata.
- Seluruh perilaku kegagalan dan status penyimpanan memiliki tes regresi.
- Tidak ada biaya owner/upgrade/billing; kuota aktual atau ketentuan public pricing telah diverifikasi dengan aman.
- Pemilik menyetujui secara terpisah setiap perubahan hosted, data nyata, OAuth scope, domain, atau rilis.

## Rencana rollout

1. **Inventaris dan paritas:** petakan setiap fitur lintas pengguna terhadap route, service, tabel/RPC, RLS, Edge Function, trigger, dan status Production. Jangan mengubah/menonaktifkan kode atau data dalam tahap ini.
2. **Gerbang cakupan rilis:** seluruh kapabilitas target tetap wajib; tidak ada penggantian UX, penghapusan, atau pengurangan cakupan secara diam-diam. Karena belum semua kapabilitas memiliki rancangan yang terbukti aman dan tanpa biaya, rilis publik tetap ditahan. Jika suatu kapabilitas tidak dapat memenuhi syarat tersebut, minta keputusan pemilik sebelum mengubah cakupan atau batas arsitektur.
3. **Spike provider lokal:** fixture sintetis untuk Drive scope/ACL, envelope kunci, revocation, conflict, dan recovery. Tidak ada credential atau akun produksi.
4. **Review privacy/security:** klasifikasi data, consent, retensi, data anak, threat model, dan prosedur penghapusan ditinjau sebelum ada data non-sintetis.
5. **Implementasi per-domain:** personal documents lebih dahulu; setiap domain memiliki adapter, feature gate fail-closed, tes dua identitas/tenant, dan export/restore.
6. **Staging terisolasi:** hanya setelah persetujuan terpisah dan bukti layanan tetap dalam batas gratis. Gunakan akun uji dan file sintetis saja.
7. **Canary/release:** perlu approval eksplisit, review kebijakan akun hosting, kuota/billing aktual, monitoring, rollback, dan persetujuan perubahan OAuth/domain. Jangan auto-promote commit ke Production.
8. **Penghentian layanan lama:** hanya setelah parity, ekspor/restore, observasi, serta persetujuan penghapusan terpisah; tidak ada drop/pause project otomatis.

## Risiko dan keputusan yang masih terbuka

| Pertanyaan | Status | Dampak |
|---|---|---|
| Apakah kapabilitas target mencakup admin sekolah, superadmin, chat, panggilan, ujian online, notifikasi, pembayaran, dan kategori terkait? | Cakupan target dipilih untuk seluruh kapabilitas; desain aman dan tanpa biaya masih harus dibuktikan per fitur | Satu fitur yang belum memenuhi syarat menahan rilis publik; jangan menurunkan cakupan tanpa keputusan baru |
| Apakah berbagi file Drive memenuhi model akses sekolah, role, dan pencabutan yang dibutuhkan? | **PERLU KONFIRMASI** lewat spike scope/ACL dan threat review | Kesalahan dapat membuka data lintas akun atau menyebabkan pengguna kehilangan akses |
| OAuth/token browser yang sesuai tujuan “login sekali” tanpa menyimpan refresh token tidak aman | **PERLU KONFIRMASI** | Tidak dapat menjanjikan sesi lintas reload/perangkat |
| Jenis akun Drive/Workspace pilot, quota, pemilik shared folder, dan retention | **PERLU KONFIRMASI** | Biaya, kegagalan upload, atau kepemilikan data salah |
| Legal basis, consent, klasifikasi dan retensi data anak/jurnal/akademik | **PERLU KONFIRMASI** sebelum data nyata | Potensi pengumpulan/penyimpanan/pembagian yang tidak sesuai |
| Pemulihan dan transfer kunci lintas perangkat | **PERLU KONFIRMASI** | Kehilangan kunci dapat membuat data terenkripsi tidak dapat dipulihkan |
| Entitlement/pembayaran tanpa backend tepercaya dan tanpa biaya owner | **Belum ada desain yang layak** | Nilai di browser dapat dimanipulasi; payment provider dapat memiliki biaya/aturan sendiri |
| Chat realtime, signaling panggilan, notifikasi saat offline tanpa layanan terkoordinasi | **Belum ada desain yang layak** | Worker stateless atau file Drive tidak otomatis memberi realtime, delivery, atau kapasitas panggilan |
| Profil CPU Worker Free dan desain backlog terjadwal | **NO-GO** pada hasil yang tersedia | Benchmark lokal tidak membuktikan batas 10 ms; jangan deploy/menambah layanan untuk menutup gap |
| Hak penggunaan Vercel Hobby dan pilihan repository/domain rilis | **PERLU KONFIRMASI** sebelum publikasi | Dapat melanggar syarat provider atau memublikasikan branch/fitur yang keliru |

**Keputusan teknis saat ini:** lanjutkan inventaris/parity matrix dan prototipe sintetis personal-first. Belum ada bukti bahwa seluruh kapabilitas target dapat dipenuhi secara aman tanpa biaya owner; karena itu rilis publik tetap **NO-GO**. Jangan mulai port API/cron Tahap 3, migrasi data nyata Tahap 4, atau implementasi/aktivasi fitur lintas pengguna sebelum desain per-domain, tinjauan privasi/keamanan, dan gerbang biaya lulus. Dokumen ini tidak mengizinkan push, deploy, billing, upgrade, perubahan provider, maupun migrasi hosted.

## Sumber implementasi

- [RouteWrapper.jsx](../web/src/app/RouteWrapper.jsx) dan [featureFlags.js](../web/src/services/featureFlags.js) — rute/gate chat dan panggilan.
- [chat.js](../web/src/services/chat.js), [chatSync.js](../web/src/services/chatSync.js), [chatCalls.js](../web/src/services/chatCalls.js), dan [callHistory.js](../web/src/services/callHistory.js) — pesan, Realtime, signaling, serta riwayat panggilan.
- [students.js](../web/src/services/students.js), [teacherAssignments.js](../web/src/services/teacherAssignments.js), [lessonJournal.js](../web/src/services/lessonJournal.js), dan [onlineAssessments.js](../web/src/services/onlineAssessments.js) — data kelas, jurnal, penugasan, serta ujian.
- [SupabasePlatformUsersPage.jsx](../web/src/pages/SupabasePlatformUsersPage.jsx), [PlatformOperationsPage.jsx](../web/src/pages/PlatformOperationsPage.jsx), [tenantSettings.js](../web/src/services/tenantSettings.js), [platformControlAdapter.js](../web/src/services/platformControlAdapter.js), dan [subscriptions.js](../web/src/services/subscriptions.js) — role lintas tenant, pengaturan, kontrol, dan entitlement.
- [planningDriveRepository.js](../web/src/services/planningDriveRepository.js), [driveEncryption.js](../web/src/services/driveEncryption.js), dan [encryptionKeyDirectory.js](../web/src/services/encryptionKeyDirectory.js) — paket perencanaan terenkripsi dan dependensi direktori kunci.
- [Panduan deployment](../DEPLOYMENT_GUIDE.md), [migration asesmen online](../supabase/migrations/20261018001100_online_assessments.sql), [migration signaling panggilan](../supabase/migrations/20261031000100_chat_call_signaling.sql), dan [migration riwayat panggilan](../supabase/migrations/20261102000100_chat_call_history.sql) — status gerbang rilis dan kontrak schema lokal; file migration bukan bukti schema hosted aktif.
