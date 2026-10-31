# Setup awal AI_nnoe dan referensi RBAC

Panduan ini untuk repository yang sudah ada. Aplikasi menggunakan React + Vite
di `web/`, Supabase untuk Auth/Postgres, GitHub Actions untuk pemeriksaan, dan
Vercel untuk hosting. Jangan membuat proyek Next.js baru atau menimpa isi
workspace ini.

## 1. Persiapan lokal (Windows PowerShell)

Pastikan Node.js memenuhi `engines.node` di `web/package.json` (minimal
`20.19.0`), lalu jalankan dari root repository:

```powershell
node --version
npm ci --prefix web
Copy-Item web\.env.example web\.env.local
notepad web\.env.local
npm run dev --prefix web
```

Isi konfigurasi lokal berikut di `web/.env.local`:

```dotenv
VITE_SUPABASE_URL=https://YOUR_PROJECT_REF.supabase.co
VITE_SUPABASE_ANON_KEY=YOUR_SUPABASE_PUBLISHABLE_OR_ANON_KEY
```

`VITE_*` masuk ke bundle browser. Hanya URL dan publishable/anon key yang boleh
berada di sana. Jangan masukkan `service_role`, password, private key, secret
OAuth, atau secret provider ke file `VITE_*`. File `.env.local` tidak boleh
di-commit.

Verifikasi perubahan sebelum membuka pull request:

```powershell
npm test --prefix web
npm run build --prefix web
```

## 2. Skema identitas dan role yang sudah tersedia

Skema kanonis sudah berada di migrasi repository; jangan membuat tabel role
kedua atau mengganti migrasi tersebut dengan skema starter lain:

- `supabase/migrations/20261016000100_identity_foundation.sql` membuat
  `tenants`, `user_allowlist`, `profiles`, trigger provisioning Auth, helper
  claim, dan kebijakan RLS dasar.
- `supabase/migrations/20261017000100_platform_user_management.sql` menambah
  atribut profil sekolah seperti `instansi`, `nip`, `mapel_ids`, dan
  `kelas_ids`.
- `supabase/migrations/20261018001200_multi_role_identity.sql` menambahkan
  role ganda yang tervalidasi dan access-token hook.

Ringkasan model:

| Tabel | Fungsi |
|---|---|
| `tenants` | Institusi/sekolah dan status aktifnya. |
| `user_allowlist` | Undangan tepercaya per email: role, daftar role, tenant, dan status aktif. Bukan tabel yang boleh ditulis browser. |
| `profiles` | Profil yang terikat ke `auth.users.id`, role server, tenant, serta atribut sekolah. |

Auth trigger membuat/memperbarui profil dari allowlist. Access-token hook hanya
menerima `active_role` jika role itu memang telah diberikan pada profil oleh
proses tepercaya. `user_metadata` yang dapat diubah pengguna tidak memberi
hak akses dengan sendirinya. RLS membatasi profil dan data berdasarkan
identitas, role aktif, serta tenant.

Role yang didukung mencakup `superadmin`, `admin_sekolah`, `operator`,
`guru`, `siswa`, `ortu`, `orang_tua`, `kepala_sekolah`, `wali_kelas`,
`guru_bk`, `guru_kokurikuler`, dan `guru_ekstrakurikuler`. Akun superadmin
harus berdiri sendiri; constraint database melarang menggabungkannya dengan
role lain.

### Pemeriksaan read-only

Jalankan hanya setelah memastikan project/lingkungan yang sedang dibuka.
Query ini membaca profil dan tidak mengubah data:

```sql
select
  email,
  nama,
  role,
  roles,
  tenant_id,
  instansi,
  active
from public.profiles
order by tenant_id nulls first, email;
```

### Pemetaan identitas yang diminta

Identitas berikut adalah data referensi, bukan kredensial. Jangan menaruh
password atau API key di SQL, seed, Git, atau chat.

| Akun uji | Role yang disarankan | Catatan |
|---|---|---|
| CEO AI_nnoe Corp. | `superadmin` | Akun terpisah; aktifkan hanya setelah email pemilik diverifikasi. |
| Raimundus Ciku Koten, S.Pd.,Gr. | `guru` | NIP dan mapel dikelola sebagai atribut profil melalui provisioning tepercaya. |
| Operator SMAN 1 Tanjung Bunga | `admin_sekolah` | Gunakan akun siswa dan orang tua terpisah untuk uji role di staging. |

Skema mendukung beberapa role dalam satu tenant, tetapi akun admin sekolah
yang sama tidak disarankan dipakai sebagai siswa/orang tua: hal itu membuat
hasil uji otorisasi tidak mewakili pengguna sebenarnya. Jika pengujian
perpindahan role memang diperlukan, lakukan hanya dengan akun sintetis di
lingkungan lokal/staging dan berikan role minimum yang diperlukan.

## 3. Migrasi dan Supabase

File migrasi lokal tidak membuktikan bahwa skema hosted sudah sama. Audit
sebelumnya menemukan perbedaan besar antara migrasi lokal dan relasi hosted;
karena itu:

1. Jangan jalankan `supabase db push`, `apply_migration`, atau SQL DDL pada
   Staging/Production sebagai bagian dari setup awal ini.
2. Cocokkan migration history, skema, RLS, dan fungsi Auth di Staging dengan
   migrasi repository.
3. Siapkan dan verifikasi backup serta prosedur restore sebelum migrasi.
4. Uji akun owner, admin tenant, guru, siswa, orang tua, dan pengguna tenant
   lain terhadap setiap kebijakan RLS.
5. Minta persetujuan terpisah sebelum perubahan hosted yang menulis data atau
   skema.

Variabel Supabase untuk aplikasi browser adalah
`VITE_SUPABASE_URL` dan `VITE_SUPABASE_ANON_KEY`. Secret server hanya boleh
berada di konfigurasi server/Edge Function dan tidak pernah di `VITE_*`.

## 4. GitHub dan Vercel

Periksa perubahan sebelum staging. Hindari `git add .` pada workspace yang
memiliki perubahan lokal lain:

```powershell
git status --short
git diff --check
git diff -- path\to\file
git add -p
git diff --cached --check
git commit -m "Describe the reviewed change"
git push -u origin YOUR_BRANCH
```

Buat pull request, tunggu CI dan Preview, lalu tinjau perubahan sebelum merge.
Untuk Vercel, gunakan root directory `web/` dan set variabel Supabase publik
di Development, Preview, dan Production. Deploy Production hanya setelah
database, RLS, dan uji role lulus; jangan gunakan `vercel --prod` sebagai
pengganti gate tersebut. Free-tier limits dan kebijakan penyedia dapat
berubah; pantau pemakaian dan jangan mengaktifkan layanan berbayar tanpa
persetujuan pemilik.

## 5. Batas integrasi pembayaran dan iklan

Panduan ini hanya menyiapkan aplikasi dan RBAC. Jangan menambahkan key
Midtrans ke frontend: bila integrasi pembayaran kelak disetujui, gunakan
serverless/Edge Function dan secret server-only. Transaksi dapat menimbulkan
biaya sehingga tidak dapat dijanjikan zero-cost. Jangan menerbitkan
`ads.txt`/`app-ads.txt` dengan placeholder; file tersebut baru valid setelah
publisher ID resmi tersedia dan integrasi iklan disetujui.
