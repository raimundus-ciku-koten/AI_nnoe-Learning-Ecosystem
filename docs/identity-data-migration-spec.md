# Spesifikasi desain migrasi identitas dan data pengguna

**Status:** Draf desain dan prototipe sintetis lokal tersedia; belum disetujui untuk produksi
**Cakupan:** Tahap 4 dari roadmap arsitektur; rancangan dan fixture sintetis saja
**Tanggal audit kode:** 1 November 2026
**Keputusan dasar:** Supabase keluar dari jalur kritis pada arsitektur target. Google Drive menjadi penyimpanan dokumen pengguna. Worker boleh bertukar token, tetapi tidak menyimpan sesi atau data pengguna.
**Batas:** Dokumen ini tidak mengubah layanan, skema hosted, akun vendor, konfigurasi deployment, atau data pengguna. Semua contoh di bawah sintetis.

## Latar belakang

Kode saat ini masih mengandalkan layanan terpusat:

- [supabase.ts](../web/src/lib/supabase.ts) membentuk klien Supabase untuk autentikasi dan data, serta menggunakan endpoint BFF untuk mengelola refresh sesi.
- [auth-session.js](../api/_lib/auth-session.js) menyimpan refresh token sesi pada cookie `HttpOnly` di server aplikasi dan menghubungi Supabase Auth untuk memperbarui sesi.
- [auth.js](../web/src/auth.js) membaca profil dari `profiles` dan mengisi cache profil lokal.
- [students.js](../web/src/services/students.js), [lessonJournal.js](../web/src/services/lessonJournal.js), dan [onlineAssessments.js](../web/src/services/onlineAssessments.js) membaca atau mengubah data melalui Supabase.
- [googleWorkspaceAuth.js](../web/src/services/googleWorkspaceAuth.js) menerima access token Google berumur terbatas dan menyimpannya dalam memori modul; sesi hilang ketika halaman dimuat ulang atau token kedaluwarsa.
- Jalur OAuth server di [callback.js](../api/google/callback.js) menyimpan refresh token Google terenkripsi pada `oauth_connections` di Supabase.
- [planningDriveRepository.js](../web/src/services/planningDriveRepository.js) sudah memakai paket perencanaan terenkripsi di Drive, tetapi konteks paket mengikat `ownerUid` dan `tenantId`. Berbagi dengan admin memerlukan direktori profil dan kunci publik Supabase dari [encryptionKeyDirectory.js](../web/src/services/encryptionKeyDirectory.js).
- [driveEncryption.js](../web/src/services/driveEncryption.js) sudah menyediakan enkripsi berkas di browser dan cadangan kunci yang dilindungi kode pemulihan. Cadangan dapat disimpan ke Drive melalui [googleWorkspace.js](../web/src/services/googleWorkspace.js).
- [offlineSync.js](../web/src/services/offlineSync.js) dan [lessonJournalAudit.js](../web/src/services/lessonJournalAudit.js) memakai IndexedDB untuk antrean lokal; antrean audit saat ini dikirim ke endpoint server, sehingga belum menjadi audit lokal mandiri.

Perpindahan Supabase bukan penggantian satu endpoint. Ia mengubah identitas, pemulihan, kepemilikan, penyimpanan, berbagi, konflik, dan penghapusan. Data nyata tidak boleh dimigrasikan sampai keputusan desain dan persetujuan terkait privasi ditetapkan.

## Tujuan dan non-tujuan

### Tujuan

1. Memungkinkan pengguna mengakses data pribadinya pada perangkat setelah masuk dengan identitas Google yang disetujui.
2. Menjadikan data privat secara bawaan; berbagi memerlukan tindakan eksplisit dan harus dapat dicabut.
3. Memungkinkan ekspor, pemulihan, dan perpindahan perangkat tanpa database aplikasi sebagai jalur kritis.
4. Menetapkan kontrak data berversi yang dapat divalidasi sebelum perubahan disimpan.
5. Menguji rancangan menggunakan fixture sintetis tanpa data siswa atau data produksi.
6. Menyediakan migrasi opt-in yang dapat diverifikasi dan tidak menghapus sumber sebelum pengguna mengonfirmasi hasilnya.

### Non-tujuan

- Menghapus Supabase, memigrasikan akun/data nyata, menerapkan migrasi database, atau mengubah konfigurasi vendor dalam tahap desain ini.
- Mempertahankan fitur yang secara inheren memerlukan koordinasi pusat—misalnya direktori sekolah, chat, ujian bersama, admin global, notifikasi lintas perangkat—tanpa desain baru dan persetujuan tersendiri.
- Menyimpan kata sandi Google, token refresh plaintext, atau kunci privat yang dapat dipulihkan dari berkas ciphertext tanpa faktor pemulihan pengguna.
- Menetapkan retensi hukum, kepatuhan perlindungan data, atau kelayakan menyimpan data anak di Drive tanpa tinjauan yang sesuai.
- Menganggap `drive.file` sebagai akses ke seluruh Drive pengguna.

## Desain tingkat tinggi

### Prinsip sasaran

1. **Identitas bukan otorisasi data bersama.** Identitas Google mengenali pemilik lokal; setiap dokumen tetap memuat owner yang diverifikasi dan aturan berbagi tersendiri.
2. **Penyimpanan lokal sebagai sumber kerja.** IndexedDB menyimpan cache dan perubahan lokal per akun aplikasi. Drive menyimpan salinan pengguna yang dienkripsi end-to-end jika pengguna mengaktifkan sinkronisasi.
3. **Tanpa dual-write tersembunyi.** Simpan lokal harus tetap berhasil tanpa jaringan. Sinkronisasi Drive adalah operasi eksplisit/terlihat dengan status antrean dan error yang dapat dipulihkan.
4. **Tidak ada fallback sukses palsu.** Kegagalan Drive, validasi, kuota, autentikasi, atau enkripsi harus menampilkan status yang jelas; jangan mengklaim bahwa data telah dicadangkan jika hanya tersimpan lokal.
5. **Tidak ada migrasi destruktif.** Impor menghasilkan salinan target yang dapat diverifikasi. Sumber lama tidak dihapus atau dinonaktifkan oleh migrasi otomatis.
6. **Minimalkan metadata.** Hindari email, nama, sekolah, UID lama, atau isi dokumen pada nama file, `appProperties`, dan log yang tidak perlu.

### Batas komponen target

```text
Browser
  ├─ Identitas pengguna dan status sesi sementara
  ├─ IndexedDB: data lokal, indeks, outbox sinkronisasi
  ├─ Web Crypto: enkripsi/dekripsi dokumen dan pembungkusan kunci
  ├─ Google Identity Services: autentikasi/persetujuan yang didukung
  ├─ Google Drive API: berkas milik pengguna, dengan scope minimum
  └─ Opsional Cloudflare Worker
       └─ pertukaran/relay OAuth yang stateless; tanpa penyimpanan pengguna
```

Komponen sesi/OAuth yang tepat belum dipilih. Google Identity Services token model saat ini menghasilkan access token berumur pendek yang harus diperbarui melalui tindakan pengguna; keputusan produk menghendaki pengalaman lebih tahan lama dengan refresh token yang hanya ada di perangkat. Kompatibilitas alur kode otorisasi, PKCE, kebijakan Google, dan penyimpanan token browser yang aman harus dibuktikan sebagai spike teknis sebelum spesifikasi dibekukan (**PERLU KONFIRMASI**). Jangan menyelesaikan kesenjangan ini dengan menyimpan refresh token plaintext di `localStorage` atau IndexedDB.

### Perubahan batas kepercayaan

- Browser menjalankan kode aplikasi dan memegang plaintext saat dokumen dibuka. Enkripsi sisi klien tidak melindungi data dari kode berbahaya yang berjalan pada origin aplikasi ketika kunci sedang terbuka.
- Google Drive menerima ciphertext serta metadata minimum; Google tetap mengendalikan akun dan layanan Drive pengguna.
- Worker, bila dipakai, menerima materi token selama permintaan yang diperlukan, tetapi tidak boleh mencatat, menyimpan, mengantrekan, atau memasukkannya ke telemetry.
- Perangkat pengguna menjadi tanggung jawab pemiliknya: kehilangan perangkat, malware, ekstensi berbahaya, sinkronisasi profil browser, dan backup browser berada di luar jaminan enkripsi Drive.
- Berbagi file Drive dan envelope kunci merupakan dua kontrol berbeda: akses file Drive tidak otomatis membuat penerima dapat mendekripsi; envelope kunci yang masih tersedia juga tidak boleh dianggap membatalkan izin Drive.

## Model data

### Model sasaran konseptual

| Entitas | Penyimpanan | Isi | Batas/aturan |
|---|---|---|---|
| `LocalAccount` | IndexedDB lokal | `accountId` acak aplikasi, metode login, waktu terakhir aktif, versi skema | Jangan memakai alamat email sebagai kunci utama. Pengikatan ke identitas Google dan pemulihan lintas perangkat perlu disetujui. |
| `LocalProfile` | IndexedDB lokal | Nama tampilan, preferensi, tahun ajaran aktif | Hanya metadata yang diperlukan aplikasi; hapus atau ekspor melalui kontrol pengguna. |
| `PrivateDocument` | IndexedDB dan, jika diaktifkan, Google Drive | ID acak, tipe, versi skema, revisi, waktu perubahan, ciphertext, checksum, envelope kunci | Enkripsi plaintext di browser sebelum upload; Drive tidak menerima isi plaintext. |
| `SyncState` | IndexedDB lokal | ID dokumen, revisi lokal/remote, checksum, status, percobaan ulang, konflik | Tidak menyimpan isi sensitif tambahan; antrean dapat dilihat dan dihapus pengguna. |
| `RecoveryBackup` | Berkas Drive atau ekspor pengguna | Kunci privat terenkripsi dengan derivasi kunci dari rahasia pemulihan pengguna | Drive tidak boleh dapat membuka cadangan tanpa rahasia pemulihan. Recovery code tidak disimpan bersama cadangan. |
| `ShareGrant` | Manifest terenkripsi dan izin Drive | ID penerima yang diperlukan, versi/fingerprint kunci publik, envelope kunci, status izin | Berbagi dinonaktifkan sampai direktori/pertukaran kunci tanpa tenant pusat dirancang. |
| `MigrationReceipt` | IndexedDB lokal dan ekspor pengguna | Versi migrasi, ID sumber opaque, jumlah record, checksum, waktu, hasil validasi | Tidak berisi plaintext atau token; receipt bukan bukti server menghapus sumber. |

### Kontrak manifest kandidat (bukan skema final)

```json
{
  "schemaVersion": 1,
  "recordId": "synthetic-record-0001",
  "kind": "planning-package",
  "ownerHandle": "synthetic-account-0001",
  "revision": 1,
  "createdAt": "2026-01-15T08:00:00.000Z",
  "updatedAt": "2026-01-15T08:00:00.000Z",
  "ciphertext": {
    "algorithm": "AES-GCM",
    "iv": "SYNTHETIC_NONCE",
    "sha256": "synthetic-checksum",
    "sizeBytes": 128
  },
  "keyEnvelopes": [
    {
      "recipientKeyFingerprint": "synthetic-fingerprint",
      "keyVersion": 1,
      "wrappedDataKey": "SYNTHETIC_ENVELOPE"
    }
  ]
}
```

Contoh ini hanya memperlihatkan bentuk data. Nilai bukan kredensial atau ciphertext valid dan **tidak dapat dipakai untuk upload**. Algoritme, AAD, batas ukuran, normalisasi timestamp, pengenal owner, metadata Drive, serta format checksum final harus selaras dengan implementasi kriptografi yang sudah ada dan ditinjau sebelum kode dibuat.

### Klasifikasi data sementara

| Data | Rekomendasi awal | Status |
|---|---|---|
| Dokumen perencanaan milik guru | Kandidat untuk Drive terenkripsi dan cache lokal | Lanjut setelah format ekspor/restore disepakati. |
| Preferensi tampilan lokal | Tetap lokal; tidak perlu sinkronisasi secara bawaan | Perlu konfirmasi kebutuhan lintas perangkat. |
| Jurnal guru | Jangan pindahkan otomatis; kandungan dapat memuat data siswa dan konteks kelas | **PERLU KONFIRMASI** legal, persetujuan, retensi, enkripsi, dan ruang lingkup. |
| Roster, identitas, nilai, presensi, akun anak | Jangan masukkan pada prototipe selain record sintetis; jangan unggah ke Drive sebelum review | **PERLU KONFIRMASI** perlindungan data anak, kontrol berbagi dan penghapusan. |
| Token OAuth, kata sandi, kode pemulihan, kunci privat | Tidak boleh ada dalam fixture, log, atau contoh operasional; token/kunci hanya diproses sesuai desain keamanan yang disetujui | Penyimpanan refresh token browser aman belum dibuktikan. |
| Audit event | Belum diputuskan apakah dibutuhkan setelah Supabase/Cron dikeluarkan | Jangan mengiklankan audit lokal sebagai tamper-proof atau compliance-grade. |

## Alur utama

### 1. Login dan pemulihan identitas

1. Pengguna memulai login Google melalui mekanisme resmi yang disetujui.
2. Aplikasi memvalidasi respons, issuer/audience bila menggunakan ID token, expiry, state, origin, dan account binding.
3. Aplikasi menemukan atau membuat `LocalAccount` tanpa menjadikan email sebagai primary key.
4. Pada perangkat baru, aplikasi memulihkan manifest dan dokumen dari Drive milik akun yang sama. Data dienkripsi tetap terkunci sampai kunci pemilik tersedia.
5. Jika identitas/kunci tidak dapat dipulihkan, aplikasi menjelaskan bahwa data terenkripsi tidak dapat dibuka dan tidak membuat kunci baru seolah-olah data lama sudah pulih.

**Gerbang:** metode login, identitas unik yang digunakan, relasi antara akun Google dan vault, serta flow refresh token masih **PERLU KONFIRMASI**.

### 2. Baca/tulis dokumen pribadi

1. Validasi input dengan schema versi yang sesuai.
2. Tulis perubahan lokal secara transaksional dan tandai `local-only`/`pending-sync`.
3. Jika sinkronisasi Drive diaktifkan, buat ciphertext dan envelope kunci di browser, hitung checksum, lalu upload file.
4. Verifikasi respons dan metadata remote; baru tandai revisi sebagai tersinkron.
5. Jika koneksi gagal, pertahankan data lokal dan tampilkan status antrean yang dapat ditindaklanjuti.

### 3. Sinkronisasi dan konflik

- Tiap dokumen memakai ID stabil acak, revisi monotonik, timestamp UTC, dan checksum ciphertext.
- Perubahan remote yang tidak sesuai revisi/checksum lokal menghasilkan konflik eksplisit; jangan melakukan last-write-wins diam-diam.
- Konflik menawarkan salinan kedua/peninjauan perbedaan setelah dekripsi lokal. Pilihan pengguna membuat revisi baru; sumber konflik tetap tersedia sampai pilihan tersimpan dan diverifikasi.
- Retry harus idempoten, dibatasi, dan menghormati status offline, revoked permission, batas kuota, serta `Retry-After`.
- Strategi merge granular per field belum ditentukan (**PERLU KONFIRMASI**). Versi awal sebaiknya mempertahankan dua salinan daripada menggabungkan plaintext secara otomatis.

### 4. Berbagi eksplisit

1. Pemilik memilih dokumen dan penerima melalui mekanisme identitas yang telah disetujui.
2. Aplikasi memverifikasi fingerprint/versi kunci publik penerima melalui kanal yang dapat diautentikasi.
3. Aplikasi membuat envelope kunci untuk penerima; plaintext tetap tidak dikirim ke server.
4. Izin file Drive diberikan hanya kepada akun penerima yang dipilih.
5. Pencabutan menghentikan akses Drive dan membuat versi kunci/envelope baru bila diperlukan. Pencabutan tidak dapat menghapus salinan plaintext yang sudah diunduh oleh penerima.

Katalog admin tenant dan kunci publik saat ini bergantung pada Supabase. Sampai mekanisme pengganti tersedia, **berbagi lintas pengguna harus nonaktif** dalam arsitektur target; `drive.file` sendiri tidak menyediakan direktori penerima.

### 5. Migrasi opt-in dari data lama

1. Pengguna melihat cakupan jenis data, jumlah record, tujuan, batas, dan konsekuensi sebelum memberi persetujuan.
2. Ekspor membaca sumber lama per pemilik dan per halaman dengan cursor; tidak memakai service role di browser.
3. Record dinormalisasi ke format berversi, divalidasi, lalu dienkripsi sebelum target disimpan.
4. Receipt lokal mencatat count/checksum dan status setiap jenis data. Receipt tidak mencatat isi.
5. Aplikasi menghitung kembali target dan membandingkan jumlah, checksum, serta hasil buka/dekripsi sampel sebelum menandai migrasi terverifikasi.
6. Sumber lama tetap tersedia; tidak ada penghapusan, penonaktifan akun, migrasi background global, atau dual-write otomatis.
7. Pengguna dapat menghentikan proses; data target parsial diberi label jelas dan dapat dihapus setelah konfirmasi terpisah.

Belum terbukti apakah semua data pada Supabase dapat diekspor dengan satu sesi pengguna, termasuk data yang hanya terlihat melalui RPC atau layanan admin. Rute export untuk setiap domain perlu dibuktikan (**PERLU KONFIRMASI**).

## Penanganan error

| Kondisi | Perilaku wajib |
|---|---|
| Google login/access token kedaluwarsa | Hentikan permintaan, pertahankan perubahan lokal, minta tindakan login/consent yang jelas; jangan retry token secara tersembunyi jika memerlukan popup. |
| Worker/OAuth provider tidak tersedia | Tidak membuat sesi semu; jangan menaruh code, token, verifier, atau secret pada URL/log. |
| Drive offline/429/5xx | Pertahankan perubahan lokal, tampilkan jumlah item tertunda dan retry terkontrol; jangan menyebut tersinkron. |
| Izin Drive dicabut/file hilang | Tampilkan dokumen inaccessible; jangan menghapus salinan lokal atau mengunggah ulang otomatis ke file berbeda. |
| Versi schema tidak dikenal/korup | Tolak import sebelum menimpa data; tawarkan ekspor bukti sintetis/diagnostik tanpa plaintext. |
| Checksum, envelope, atau dekripsi gagal | Karantina item lokal, jangan overwrite versi yang mungkin valid, tampilkan jalur pemulihan yang aman. |
| Kode pemulihan salah/tidak tersedia | Batasi percobaan bila relevan, jangan mengirim kode ke server, dan jelaskan risiko kehilangan akses permanen. |
| Quota penuh atau antrean melebihi batas | Batasi input baru secara jelas; jangan buang antrean/data lama secara diam-diam. |
| Konflik concurrent edit | Simpan kedua versi dan minta keputusan pengguna; jangan menganggap timestamp sebagai otoritas tunggal. |
| Penyimpanan browser penuh/evicted | Bedakan cache lokal dari salinan Drive yang sudah diverifikasi; minta pengguna menyinkronkan/mengekspor sebelum melanjutkan. |

## Keamanan

- Pakai HTTPS dan validasi origin/state/PKCE sesuai flow OAuth yang disetujui.
- Token refresh tidak boleh masuk source, `VITE_*`, `localStorage`, logs, analytics, crash report, atau URL. Penyimpanan persisten token di browser belum ditetapkan; **jangan implementasikan sampai threat model dan recovery strategy disetujui**.
- Access token hanya berada di memori selama diperlukan dan dihapus saat logout, ganti akun, revoke, atau kedaluwarsa. Jangan berasumsi penghapusan JavaScript dapat menjamin zeroization memori.
- Pertahankan enkripsi sisi klien yang sudah ada hanya setelah review format dan tes silang browser; gunakan random data key per dokumen, AEAD, nonce unik, AAD yang mengikat versi/konteks, dan envelope penerima.
- Jangan menaruh identitas langsung, nama sekolah, isi dokumen, token, atau recovery code pada metadata Drive.
- Data sensitif anak, roster, nilai, presensi, dan jurnal tidak boleh dimigrasikan ke Drive sebelum tinjauan hukum/privasi, persetujuan, retensi, dan model akses disetujui.
- XSS pada origin aplikasi dapat membaca plaintext dan memakai kunci yang sedang terbuka. Enkripsi at-rest di Drive tidak meniadakan risiko supply-chain, script injection, ekstensi, atau perangkat kompromi.
- `drive.file` adalah akses per file yang dibuat/dipilih/dibagikan dengan aplikasi; jangan memperluas ke `drive` penuh tanpa kebutuhan, verifikasi kebijakan, dan persetujuan baru.
- Tidak ada directory sharing lintas pengguna sampai autentikasi penerima dan pertukaran kunci publik tanpa Supabase dirancang.
- Hapus atau migrasikan sumber lama hanya setelah pengguna memverifikasi hasil dan memberi persetujuan penghapusan yang terpisah.

## Observability

- UI lokal menampilkan `local-only`, `pending`, `syncing`, `synced`, `conflict`, `revoked`, atau `failed`, termasuk waktu sinkronisasi terakhir.
- Diagnostik yang diekspor pengguna boleh memuat kode error terstandar, versi aplikasi/skema, durasi, dan jumlah record; tidak berisi token, nama/email, konten, checksum plaintext, atau kunci.
- Telemetry anonim hanya jika dipilih pengguna, dapat dimatikan, dan tidak mengidentifikasi account/document. Status persetujuan analitik **PERLU KONFIRMASI**.
- Tidak ada statistik pemakaian individual, audit pusat, atau monitoring global dalam desain dasar.
- Worker, bila ada, mencatat metrik agregat minimum dan kode status tanpa body, authorization header, query OAuth sensitif, atau payload pengguna. Retensi log penyedia **PERLU KONFIRMASI**.

## Rencana pengujian

### Fixture sintetis

Gunakan akun `synthetic-account-0001`, dokumen `synthetic-record-0001`, isi fiktif “Rencana pelajaran contoh”, dan fingerprint/token placeholder. Fixture tidak boleh memasukkan nama/email asli, data sekolah nyata, credential, token yang dapat dipakai, atau konten pengguna.

### Pengujian penerimaan desain/prototipe

1. Baca/tulis fixture offline; setelah reload, data lokal tetap dapat divalidasi.
2. Enkripsi fixture lalu pastikan nama/isi plaintext tidak muncul di berkas upload, metadata, atau log uji.
3. Fixture dengan nonce, schema version, checksum, owner handle, ukuran, atau envelope yang tidak valid ditolak tanpa mengganti record valid.
4. Perangkat kedua (profil browser terisolasi) tidak dapat membuka ciphertext tanpa kunci/recovery yang benar; recovery salah menghasilkan error eksplisit.
5. Token kedaluwarsa, popup ditutup, jaringan putus, 403/404/revoked, 429/5xx, dan kuota habis mempertahankan data lokal serta status antrean.
6. Dua revisi sintetis yang bercabang memunculkan konflik dan mempertahankan kedua versi.
7. Migrasi sintetis memverifikasi count/checksum, aman diulang (idempoten), dapat dibatalkan, dan tidak menghapus sumber.
8. Fixture dengan data yang diklasifikasikan “anak/sensitif” ditolak dari jalur Drive sampai policy gate secara eksplisit dibuka.
9. Pengujian akses silang menggunakan dua identitas sintetis; identitas kedua tidak menemukan atau mendekripsi dokumen privat pertama.
10. Uji batas konten/metadata, CSP/XSS threat review, serta pemindaian dependency sebelum prototipe dipakai dengan data nyata.

### Hasil prototipe lokal

Prototipe menguji kontrak sintetis, penolakan ID/payload non-sintetis dan versi tak dikenal, enkripsi/dekripsi round-trip, recovery code benar/salah, perubahan ciphertext, receipt yang memverifikasi target melalui dekripsi, serta konflik yang mempertahankan dua cabang dan membuat revisi terenkripsi baru. Prototipe IndexedDB lokal hanya menerima paket terenkripsi tervalidasi, membaca ulang setelah koneksi ditutup/dibuka, menolak ID/plaintext non-sintetis, dan menampilkan error bila IndexedDB tidak tersedia. Tes otomatis memakai fake-indexeddb; smoke test browser nyata juga memverifikasi record sintetis tetap terbaca setelah reload dan tidak memuat plaintext. Fixture browser dihapus setelah pengujian. Build produksi web lulus.

Belum diuji: persistensi IndexedDB, reload/offline browser, OAuth/token, Google Drive, perangkat/browser kedua yang sebenarnya, revocation provider, dan migrasi data nyata. Kelulusan fixture tidak membuktikan kesiapan produksi maupun perilaku layanan eksternal.

### Gerbang rilis data

- Unit dan integration tests lulus pada fixture sintetis.
- Restore dilakukan ke profil browser bersih dan hasil diverifikasi.
- Review keamanan menyetujui threat model penyimpanan token, recovery, XSS, izin Drive, dan sharing.
- Persetujuan kategori data dan retensi selesai.
- Tidak ada tes yang memerlukan write ke Supabase hosted, Drive pengguna, atau konfigurasi OAuth produksi tanpa persetujuan terpisah.

## Rencana rollout

1. **Desain:** draf desain dan fixture sintetis disiapkan; kategori data, identity binding, token strategy, recovery model, dan data sharing masih memerlukan keputusan. Tidak memakai data nyata.
2. **Prototipe lokal sintetis:** [identityDataMigrationPrototype.js](../web/src/services/identityDataMigrationPrototype.js) dan [identity-data-migration-prototype.test.mjs](../web/tests/identity-data-migration-prototype.test.mjs) menguji kontrak berversi, enkripsi/dekripsi memakai helper Web Crypto yang ada, recovery code, receipt, dan resolusi konflik. Prototipe tidak diimpor oleh aplikasi, tidak memakai Drive/OAuth/Worker/Supabase, dan hanya menerima ID serta teks fixture berawalan `synthetic:`.
3. **Spike OAuth:** validasi flow token/PKCE yang diizinkan Google dan penyimpanan refresh token perangkat. Hasilnya berupa keputusan go/no-go, tanpa menyimpan token pengguna.
4. **Uji perangkat terisolasi:** browser profile dan akun uji milik proyek yang disetujui; Drive file sintetis saja; lakukan restore, revoke, dan conflict.
5. **Pilot opt-in:** hanya setelah persetujuan privasi, kebijakan retensi, dan rencana dukungan; akun pengguna/pilot dan scope dibatasi terpisah.
6. **Migrasi bertahap:** ekspor per pengguna, verifikasi receipt, masa observasi dan rollback, lalu evaluasi baru terhadap penghapusan sumber.
7. **Penghentian Supabase jalur kritis:** hanya setelah seluruh penggunaan auth/data/RPC/Edge Function/cron terinventarisasi dan pengganti diuji; nonaktifkan per domain, bukan sekaligus.

Perubahan hosting, billing, schema hosted, OAuth consent screen, domain produksi, dan penghapusan sumber memerlukan persetujuan eksplisit terpisah. Urutan gerbang mengikuti roadmap: spesifikasi tahap 2 dan verifikasi biaya tahap 1 harus selesai sebelum rollout Worker tahap 3.

## Risiko dan keputusan terbuka

| Risiko/pertanyaan | Status | Dampak bila tidak diputuskan |
|---|---|---|
| Flow Google yang memberi UX masuk sekali sambil menyimpan refresh token hanya pada perangkat dan sesuai kebijakan Google | **PERLU KONFIRMASI** lewat spike dokumentasi/PoC | Tidak dapat menjanjikan sesi tahan lama; jangan rilis strategi token yang belum terbukti. |
| Lokasi kunci pembungkus refresh token yang tidak dapat dibaca bersama ciphertext saat perangkat/akun browser diekspor | **PERLU KONFIRMASI** | Enkripsi token palsu atau token hilang; dampak berupa pengambilalihan sesi atau login ulang. |
| Identitas stabil lintas perangkat tanpa direktori pusat | **PERLU KONFIRMASI** | Salah menggabungkan akun, kehilangan vault, atau tidak dapat memulihkan file. |
| Status legal/consent untuk jurnal, roster, nilai, presensi, dan data anak di Drive | **PERLU KONFIRMASI** | Potensi pengumpulan/penyimpanan tidak sesuai; data tersebut dikecualikan dari pilot. |
| Apakah kebutuhan sharing/admin/ujian bersama benar-benar dihentikan atau didesain ulang | Lihat [spesifikasi desain ulang fitur lintas pengguna Tahap 5](./cross-user-features-redesign-stage5-spec.md); kapabilitas rilis awal tetap **PERLU KONFIRMASI** | Model data dan izin dapat berubah material. |
| Drive quota, storage/user, akses file `drive.file`, dan retensi/penghapusan provider | Verifikasi akun/provider diperlukan | Backup atau sinkronisasi dapat gagal; jangan mengiklankan kapasitas atau durabilitas tertentu. |
| Integritas audit lokal versus audit terpusat | **PERLU KONFIRMASI** | Catatan lokal dapat dihapus/diubah oleh pengguna/perangkat; bukan bukti kepatuhan atau anti-tamper. |
| Sumber legacy Supabase yang dapat diekspor pengguna dan dependensi RPC/server-only | Inventaris belum lengkap | Migrasi parsial dapat melewatkan data atau fitur tersembunyi. |

## Keputusan yang perlu dibuat sebelum uji perangkat atau pilot

1. Apakah tahap pertama hanya mencakup **dokumen perencanaan guru** dan preferensi, sementara jurnal/roster/nilai/presensi dikecualikan?
2. Apakah berbagi antar pengguna sepenuhnya dinonaktifkan pada pilot pertama?
3. Apakah kehilangan faktor pemulihan boleh berarti kehilangan akses ke dokumen terenkripsi secara permanen, atau harus ada metode recovery lain?
4. Apakah pilot menggunakan akun Google uji terpisah dan Drive sintetis, tanpa akun produksi?

Belum ada jawaban untuk pertanyaan di atas yang diasumsikan sebagai persetujuan. Prototipe lokal sintetis tersedia, tetapi belum menjadi bagian dari alur aplikasi; tidak ada hosted service, akun vendor, OAuth, Drive, atau data pengguna yang digunakan.
