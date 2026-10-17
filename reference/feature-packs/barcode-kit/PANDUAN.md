# Kit Barcode & Absensi — Panduan Pasang

## 1. Salin file (struktur sama dengan proyek Anda)

| File | Status |
|---|---|
| `web/src/pages/dataDasar/tabBarcode.js` | **ganti** file lama (ekspor `tabBarcode(el, ctx)` tidak berubah) |
| `web/src/pages/dataDasar/kartuCetak.js` | baru |
| `web/src/lib/code128.js`, `kodeSiswa.js`, `berkas.js`, `teks.js` | baru |
| `web/src/firebase/app.js`, `siswaKodeRepo.js`, `absensiRepo.js` | baru |
| `web/src/pages/scan/halamanScan.js` | baru, **opsional** (daftarkan di router untuk `#/scan` dan `#/scan/:kode`) |
| `firestore.rules`, `firebase.json`, `.env.example` | baru — **gabungkan**, jangan menimpa milik Anda |
| `tests/*.test.mjs` | baru |

`tabBarcode.js` tetap jalan walau `umum.js`/`ui.js` kekurangan helper (cadangan lokal dipertahankan).
Modul Firebase hanya dimuat saat tombol **Simpan Kode** ditekan, jadi tab tetap berfungsi baca-saja bila Firebase bermasalah.

## 2. Asumsi yang perlu Anda cocokkan

- Bundler dengan paket npm `firebase` (mis. Vite, `import.meta.env`). Tanpa bundler, impor `firebase/...` tidak akan terurai.
- Koleksi siswa bernama `siswa`, dokumen punya field `nama`, `nisn`, `kelas`, dan `ambilSiswa()` mengembalikan `id` dokumen. Ubah nama koleksi di `siswaKodeRepo.js` / `absensiRepo.js` / `firestore.rules`.
- Peran lewat **custom claim** `role` (`admin` | `guru`). Contoh mengisi (Admin SDK, sekali jalan):
  `await getAuth().setCustomUserClaims(uid, { role: 'admin' })` — pengguna harus login ulang.
  Bila peran Anda disimpan di dokumen `users/{uid}`, ubah fungsi `peran()` di `firestore.rules`.
- Zona waktu absensi `Asia/Makassar` (WITA); ubah `ZONA_WAKTU` di `absensiRepo.js`.
- `firebase.json` mengarah ke `web/dist` sebagai folder build.

## 3. Perintah

```bash
npm i firebase
npm i -D @firebase/rules-unit-testing firebase-tools

node --test tests/lib.test.mjs tests/code128.test.mjs                                   # tanpa emulator
npx firebase emulators:exec --only firestore "node --test tests/firestore.rules.test.mjs" # perlu Java 11+

npx firebase deploy --only firestore:rules      # setelah rules digabung & tes lulus
npm run build && npx firebase deploy --only hosting
```

Dev dengan emulator: isi `VITE_USE_EMULATOR=true` lalu `npx firebase emulators:start`.

## 4. App Check

Daftarkan app web di Console → App Check (reCAPTCHA Enterprise), isi `VITE_APPCHECK_SITE_KEY`.
Pantau metrik dulu beberapa hari, **baru** klik *Enforce* untuk Firestore — mengaktifkan enforcement
sebelum semua klien mengirim token akan menolak pengguna sah.

## 5. Catatan keamanan

- Kode siswa **set-sekali**: setelah tersimpan, rules menolak perubahannya (kartu tercetak tetap valid).
- Guru hanya dapat *membuat* absensi (tidak mengubah/menghapus); `waktu` wajib `serverTimestamp()`.
- Tanggal dikirim klien; rules memvalidasi format dan kesesuaian ID, tetapi tidak dapat membuktikan
  tanggal = hari ini. Bila perlu kebal manipulasi penuh, pindahkan pencatatan ke Cloud Function.
- Belum ada Content-Security-Policy di `firebase.json` (salah konfigurasi bisa memblokir login/App Check).
  Tambahkan setelah daftar domain yang dipakai aplikasi Anda jelas.
