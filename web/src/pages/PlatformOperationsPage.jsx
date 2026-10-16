import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  collection, getCountFromServer, getDocs, limit, orderBy, query, startAfter, where,
} from 'firebase/firestore';
import { db } from '../firebase/index.js';
import { appCheck, firebaseEnv, pakaiEmulator } from '../firebase/core/app.js';
import { useAuth } from '../context/AuthContext.jsx';
import { usePlatformControls } from '../context/PlatformControlContext.jsx';
import { GRUP_MENU, MENU_ADMIN_SEKOLAH, MENU_SUPERADMIN, menuUntukPeran } from '../navigasi.js';
import { setPlatformControl } from '../services/platformAdminApi.js';
import PRICING from '../../../functions/shared/pricing.json';
import '../styles/platform-tenants.css';

const PERAN_MENU = [
  ['Superadmin', 'superadmin'],
  ['Admin sekolah', 'admin_sekolah'],
  ['Guru', 'guru'],
  ['Operator', 'operator'],
  ['Siswa', 'siswa'],
  ['Orang tua', 'ortu'],
];

const INFO_MODUL = {
  '/platform/dashboard/kesehatan': {
    judul: 'Kesehatan Sistem',
    ringkasan: 'Status konfigurasi yang dapat diketahui dari aplikasi ini. Status operasional Firebase harus diverifikasi dari Firebase Console.',
    status: 'Sebagian tersedia',
    tindakan: 'Tinjau konfigurasi klien di bawah, lalu buka Firebase Console untuk status layanan sebenarnya.',
  },
  '/platform/dashboard/statistik': {
    judul: 'Statistik Global',
    ringkasan: 'Snapshot agregat dokumen Firestore yang diizinkan untuk superadmin. Bukan pengguna aktif, telemetry historis, atau metrik biaya.',
    status: 'Snapshot Firestore',
    tindakan: 'Jumlah dokumen profil tidak sama dengan akun Authentication aktif. Muat ulang untuk mengambil hitungan terbaru.',
  },
  '/platform/dashboard/aktivitas': {
    judul: 'Log Aktivitas Platform',
    ringkasan: 'Riwayat pembuatan akun platform dan perubahan kontrol yang dilakukan melalui Cloud Functions tepercaya.',
    status: 'Audit operasi backend',
    tindakan: 'Log mencakup pembuatan akun dan perubahan kontrol platform yang dilakukan melalui API; bukan audit lengkap semua aktivitas Firebase atau pengguna.',
  },
  '/platform/tenant/langganan': {
    judul: 'Langganan Tenant',
    ringkasan: 'Status langganan sekolah tersedia pada dokumen tenant dan dapat ditinjau di direktori sekolah.',
    status: 'Baca-saja tersedia',
    tindakan: 'Status dihitung dari langganan. Perubahan langganan hanya boleh melalui webhook atau layanan backend tepercaya.',
    link: { href: '#/platform/tenant/sekolah', label: 'Buka daftar sekolah' },
  },
  '/platform/pengguna/peran': {
    judul: 'Peran Global',
    ringkasan: 'Klaim Firebase menentukan izin efektif. Matriks menu di bawah memperlihatkan navigasi yang disediakan aplikasi, bukan pengganti Security Rules.',
    status: 'Matriks navigasi tersedia',
    tindakan: 'Perubahan klaim peran tetap melalui proses provisioning tepercaya; tidak ada perubahan peran dari browser.',
  },
  '/platform/fitur/flags': {
    judul: 'Feature Flags',
    ringkasan: 'Kontrol fitur AI tervalidasi yang diperiksa Cloud Functions sebelum menjalankan layanan terkait.',
    status: 'Dikelola server dan diaudit',
    tindakan: 'Perubahan disimpan melalui callable App Check yang hanya menerima superadmin serta menulis audit immutable.',
  },
  '/platform/ai/api-key': {
    judul: 'API Key Gemini',
    ringkasan: 'Kunci model AI hanya dikelola melalui Firebase Functions Secrets. Rahasia tidak pernah dibaca atau ditampilkan dari browser.',
    status: 'Dikelola server',
    tindakan: 'Periksa dan rotasi kunci melalui Firebase Secret Manager / Functions secrets; aplikasi ini tidak dapat mengonfirmasi nilainya.',
  },
  '/platform/ai/prompt': {
    judul: 'Template Prompt',
    ringkasan: 'Prompt AI saat ini ditetapkan di kode layanan, belum melalui katalog template global yang terversi.',
    status: 'Belum dikelola dari platform',
    tindakan: 'Ubah prompt melalui proses perubahan kode dan pengujian; jangan menyimpan prompt baru ke koleksi tanpa skema dan audit.',
  },
  '/platform/ai/monitoring': {
    judul: 'Monitoring Penggunaan AI',
    ringkasan: 'Cloud Functions membatasi pemakaian AI per jam dan per hari, tetapi belum menyediakan agregat telemetry yang dapat ditampilkan di sini.',
    status: 'Metrik tidak tersedia',
    tindakan: 'Pantau log Functions di Google Cloud Console. Jangan menganggap angka penggunaan atau biaya tersedia pada dashboard ini.',
  },
  '/platform/firebase/firestore': {
    judul: 'Firestore',
    ringkasan: 'Aplikasi menggunakan Firebase JS SDK modular. Status koneksi dan kapasitas Firestore tidak dapat disimpulkan dari konfigurasi lokal.',
    status: 'Pintasan konsol tersedia',
    tindakan: 'Gunakan Firebase Console untuk status database, indeks, penggunaan, dan operasi administrasi.',
    console: 'firestore',
  },
  '/platform/firebase/storage': {
    judul: 'Cloud Storage',
    ringkasan: 'Lampiran media terlindungi memakai alur server; status bucket dan kapasitas harus diperiksa dari konsol.',
    status: 'Pintasan konsol tersedia',
    tindakan: 'Gunakan Firebase Console untuk bucket, aturan, kapasitas, serta pemantauan.',
    console: 'storage',
  },
  '/platform/firebase/functions': {
    judul: 'Cloud Functions',
    ringkasan: 'Fungsi sensitif menggunakan App Check pada callable yang dikonfigurasi. Status deployment dan error runtime harus diperiksa di konsol.',
    status: 'Pintasan konsol tersedia',
    tindakan: 'Gunakan Google Cloud Console untuk deployment, log, error, concurrency, dan penggunaan.',
    console: 'functions',
  },
  '/platform/firebase/auth': {
    judul: 'Authentication',
    ringkasan: 'Aplikasi memakai Firebase JS SDK modular untuk email/kata sandi dan Google popup. Aplikasi tidak memakai passwordless email-link sign-in atau Firebase Android Auth SDK.',
    status: 'Pintasan konsol tersedia',
    tindakan: 'Peringatan penghentian Firebase Dynamic Links tidak memerlukan migrasi untuk alur login saat ini. Pengaturan account linking, provider, pengguna, dan authorized domains tetap dikelola di Firebase Console.',
    console: 'authentication/users',
  },
  '/platform/firebase/fcm': {
    judul: 'Firebase Cloud Messaging',
    ringkasan: 'Aplikasi menyediakan alur notifikasi; status pengiriman dan deliverability FCM belum dikumpulkan sebagai metrik platform.',
    status: 'Pintasan konsol tersedia',
    tindakan: 'Gunakan Firebase Console dan Cloud Logging untuk konfigurasi serta diagnosis notifikasi.',
    console: 'messaging',
  },
  '/platform/keamanan/rules': {
    judul: 'Security Rules',
    ringkasan: 'Aturan akses berada di file Firestore, Realtime Database, dan Storage Rules. Browser tidak dapat memverifikasi versi aturan yang sedang ter-deploy.',
    status: 'Pemeriksaan lokal tidak sama dengan deployment',
    tindakan: 'Jalankan test rules sebelum deployment dan verifikasi versi aktif di Firebase Console.',
    console: 'firestore/rules',
  },
  '/platform/keamanan/audit': {
    judul: 'Audit Log',
    ringkasan: 'Riwayat pembuatan akun dan perubahan kontrol platform yang dicatat server dan hanya dapat dibaca superadmin.',
    status: 'Audit operasi backend',
    tindakan: 'Log mencatat pembuatan akun serta perubahan maintenance mode dan feature flags melalui API; bukan audit umum semua aktivitas.',
  },
  '/platform/keamanan/app-check': {
    judul: 'App Check',
    ringkasan: 'Status ini hanya menunjukkan inisialisasi App Check pada klien saat ini; bukan status enforcement seluruh Firebase service.',
    status: 'Status runtime klien',
    tindakan: 'Verifikasi penerimaan token pada metrik App Check. Jika pertukaran token ditolak (401), cocokkan aplikasi web, site key reCAPTCHA Enterprise, domain Hosting yang diizinkan, dan pembatasan API key di Firebase/Google Cloud Console sebelum mengaktifkan enforcement.',
    console: 'appcheck',
  },
  '/platform/laporan/penggunaan': {
    judul: 'Penggunaan Platform',
    ringkasan: 'Ringkasan berikut merupakan jumlah dokumen saat ini, bukan metrik pengguna aktif atau telemetry historis.',
    status: 'Snapshot Firestore',
    tindakan: 'Jumlah profil tidak sama dengan akun Authentication aktif; interpretasikan sebagai data yang tersedia di Firestore.',
  },
  '/platform/laporan/performa': {
    judul: 'Performa Platform',
    ringkasan: 'Frontend ini tidak mengumpulkan metrik latensi, availability, atau performa lintas tenant.',
    status: 'Metrik tidak tersedia',
    tindakan: 'Gunakan Google Cloud Monitoring dan Firebase Performance Monitoring untuk observabilitas operasional.',
    console: 'firestore',
  },
  '/platform/laporan/biaya': {
    judul: 'Biaya Platform',
    ringkasan: 'Tidak ada pembacaan data penagihan Cloud Billing dari aplikasi ini.',
    status: 'Metrik tidak tersedia',
    tindakan: 'Gunakan Google Cloud Billing Reports dan tetapkan budget alerts melalui konsol Google Cloud.',
    console: 'billing',
  },
  '/platform/pengaturan/konfigurasi': {
    judul: 'Konfigurasi Platform',
    ringkasan: 'Konfigurasi publik yang dipakai aplikasi saat ini. Kunci privat tidak ditampilkan.',
    status: 'Konfigurasi klien',
    tindakan: 'Perubahan konfigurasi Firebase dilakukan melalui environment deployment dan proses rilis.',
  },
  '/platform/pengaturan/integrasi': {
    judul: 'Integrasi Platform',
    ringkasan: 'Status integrasi secret atau layanan pihak ketiga tidak tersedia bagi browser.',
    status: 'Pemeriksaan server diperlukan',
    tindakan: 'Verifikasi secret, webhook, dan koneksi pada Functions/Secret Manager tanpa mengekspos nilainya.',
  },
  '/platform/pengaturan/cadangan': {
    judul: 'Cadangan Platform',
    ringkasan: 'Jadwal dan hasil backup database tidak dicatat dalam aplikasi.',
    status: 'Pemeriksaan server diperlukan',
    tindakan: 'Konfigurasikan dan verifikasi backup Firestore/Storage melalui Google Cloud Console.',
    console: 'firestore',
  },
  '/platform/pengaturan/pemeliharaan': {
    judul: 'Mode Pemeliharaan',
    ringkasan: 'Hentikan akses aplikasi bagi pengguna non-superadmin. Keadaan diperiksa langsung oleh UI dan endpoint AI/pembayaran.',
    status: 'Dikelola server dan diaudit',
    tindakan: 'Mengaktifkan mode ini akan memblokir area aplikasi dan endpoint AI serta checkout; superadmin tetap dapat mengakses konsol.',
  },
  '/platform/konten/template': {
    judul: 'Template Perangkat',
    ringkasan: 'Belum tersedia katalog template global terpisah dengan versi, status publikasi, dan kontrol akses lintas tenant.',
    status: 'Belum terintegrasi',
    tindakan: 'Template belum dapat diterbitkan atau diubah dari browser. Tetapkan skema dan alur persetujuan sebelum menyediakan editor global.',
  },
  '/platform/konten/bank-soal': {
    judul: 'Bank Soal Global',
    ringkasan: 'Konten bank soal dapat memuat kunci jawaban atau materi berlisensi dan tidak boleh dibuka melalui pembacaan global dari klien.',
    status: 'Tidak tersedia untuk akses global klien',
    tindakan: 'Gunakan bank soal yang dibatasi tenant. Katalog global perlu API server yang hanya mengembalikan metadata terkurasi.',
  },
  '/platform/konten/modul': {
    judul: 'Modul Global',
    ringkasan: 'Belum tersedia katalog modul global yang terpisah dari dokumen sekolah dan memiliki kontrol publikasi lintas tenant.',
    status: 'Belum terintegrasi',
    tindakan: 'Data modul lintas tenant tidak dibaca dari browser karena belum ada API metadata yang membatasi cakupan data.',
  },
};

const paket = [
  ...PRICING.school.map((item) => ({ ...item, kelompok: 'Sekolah' })),
  ...PRICING.student.map((item) => ({ ...item, kelompok: 'Siswa' })),
  ...PRICING.teacherSd.map((item) => ({ ...item, kelompok: 'Guru kelas SD' })),
  ...PRICING.teacherSubject.map((item) => ({ ...item, kelompok: 'Guru mapel' })),
];

function linkConsole(projectId, target) {
  if (!projectId) return '';
  return `https://console.firebase.google.com/project/${encodeURIComponent(projectId)}/${target}`;
}

function linkCloudBilling(projectId) {
  return `https://console.cloud.google.com/billing?project=${encodeURIComponent(projectId)}`;
}

const LAYANAN_FIREBASE = [
  {
    judul: 'Authentication',
    deskripsi: 'Provider login, pengguna, template email, dan kebijakan account linking.',
    console: 'authentication/users',
    docs: 'https://firebase.google.com/docs/auth',
    route: '/platform/firebase/auth',
    status: '2 provider di aplikasi',
    tindakan: 'Login email/kata sandi dan Google memakai Firebase Authentication. Pertahankan pilihan “link accounts that use the same email” seperti pada gambar; verifikasi setting aktual di Console.',
  },
  {
    judul: 'Cloud Firestore',
    deskripsi: 'Database dokumen aplikasi, indeks, penggunaan, dan Security Rules.',
    console: 'firestore/databases',
    docs: 'https://firebase.google.com/docs/firestore',
    route: '/platform/firebase/firestore',
    status: 'SDK modular terintegrasi',
    tindakan: 'Firestore dipakai aplikasi dengan cache lokal. Pastikan Rules dan indeks yang diuji sudah di-deploy.',
  },
  {
    judul: 'Realtime Database',
    deskripsi: 'Data real-time untuk chat dan presence.',
    console: 'database',
    docs: 'https://firebase.google.com/docs/database',
    status: 'SDK modular terintegrasi',
    tindakan: 'Chat, presence, dan token notifikasi memakai RTDB. Pastikan URL database, Rules, serta trigger notifikasi cocok dengan proyek.',
  },
  {
    judul: 'App Check',
    deskripsi: 'Validasi aplikasi dan token sebelum layanan Firebase menerima trafik.',
    console: 'appcheck',
    docs: 'https://firebase.google.com/docs/app-check',
    route: '/platform/keamanan/app-check',
    status: '401 token perlu diperbaiki',
    tindakan: 'Permintaan pertukaran token produksi terlihat mendapat HTTP 401. Cocokkan web app, site key, domain yang diizinkan, API key restrictions, dan metrik token di Console; jangan aktifkan enforcement sebelum token valid.',
  },
  {
    judul: 'Cloud Storage',
    deskripsi: 'Bucket, akses file, aturan, dan kapasitas penyimpanan.',
    console: 'storage',
    docs: 'https://firebase.google.com/docs/storage',
    route: '/platform/firebase/storage',
    status: 'SDK siap digunakan',
    tindakan: 'Verifikasi bucket aktif dan Storage Rules sebelum mengunggah media.',
  },
  {
    judul: 'Cloud Functions',
    deskripsi: 'Deployment, log, error runtime, dan fungsi backend.',
    console: 'functions',
    docs: 'https://firebase.google.com/docs/functions',
    route: '/platform/firebase/functions',
    status: 'SDK/backend terintegrasi',
    tindakan: 'Pastikan fungsi yang dipanggil browser sudah di-deploy dan App Check enforcement sesuai konfigurasi server.',
  },
  {
    judul: 'Cloud Messaging',
    deskripsi: 'Konfigurasi push notification dan laporan pengiriman.',
    console: 'messaging',
    docs: 'https://firebase.google.com/docs/cloud-messaging',
    route: '/platform/firebase/fcm',
    status: 'Web Push terintegrasi',
    tindakan: 'Push memerlukan VAPID key produksi, izin browser, service worker, RTDB Rules, dan trigger notifikasi yang sudah di-deploy.',
  },
  {
    judul: 'Remote Config',
    deskripsi: 'Parameter dan feature flag untuk perilaku aplikasi.',
    console: 'remoteconfig',
    docs: 'https://firebase.google.com/docs/remote-config',
    status: 'Belum terhubung ke UI',
    tindakan: 'Buat template/parameter di Console, lalu definisikan nilai default dan integrasikan parameter ke fitur sebelum memublikasikan konfigurasi.',
  },
  {
    judul: 'Crashlytics',
    deskripsi: 'Laporan crash dan stabilitas aplikasi Android/iOS.',
    console: 'crashlytics',
    docs: 'https://firebase.google.com/docs/crashlytics',
    status: 'Butuh registrasi aplikasi native',
    tindakan: 'Firebase Crashlytics tidak mendukung aplikasi web. APK saat ini adalah TWA; daftarkan Android app dan tambahkan SDK native bila ingin melaporkan crash wrapper.',
  },
  {
    judul: 'Performance Monitoring',
    deskripsi: 'Metrik performa dan latensi web yang dialami pengguna.',
    console: 'performance',
    docs: 'https://firebase.google.com/docs/perf-mon',
    status: 'SDK web diinisialisasi saat idle',
    tindakan: 'Web SDK memulai pengumpulan otomatis pada browser yang didukung. Periksa metrik dan domain di Console; tidak mengukur performa konten native.',
  },
  {
    judul: 'App Distribution',
    deskripsi: 'Distribusi versi pra-rilis kepada tester tepercaya.',
    console: 'appdistribution',
    docs: 'https://firebase.google.com/docs/app-distribution',
    status: 'Alur rilis Console/CLI',
    tindakan: 'Daftarkan Android app, tandatangani APK/AAB dengan release key, lalu unggah build dan tambahkan grup tester di App Distribution.',
  },
  {
    judul: 'Release Monitoring',
    deskripsi: 'Pantau stabilitas dan penggunaan rilis aplikasi terbaru.',
    console: 'crashlytics',
    docs: 'https://firebase.google.com/docs/crashlytics',
    status: 'Memerlukan Crashlytics',
    tindakan: 'Pantauan rilis bergantung pada Crashlytics dan build Android terdaftar; aktifkan Crashlytics native terlebih dahulu.',
  },
  {
    judul: 'Firebase AI Logic',
    deskripsi: 'Integrasi model generatif dari aplikasi Firebase.',
    console: 'ai',
    docs: 'https://firebase.google.com/docs/ai-logic',
    status: 'Belum diintegrasikan',
    tindakan: 'Aplikasi saat ini memakai alur BYOK/provider sendiri, bukan Firebase AI Logic. Aktifkan produk di Console dan rancang provider, App Check, serta kuota sebelum migrasi.',
  },
];

function RingkasanFirebase({ projectId, appCheckAktif, emulator }) {
  return (
    <>
      <header className="platform-tenants-heading firebase-overview-heading">
        <p className="platform-tenants-kicker">Pusat kendali · superadmin</p>
        <h1>Firebase</h1>
        <p>Ringkasan layanan proyek dan pintasan ke Firebase Console. Kartu ini tidak menyiratkan bahwa layanan sudah diaktifkan atau bahwa metrik operasional tersedia.</p>
        <dl className="firebase-overview-facts">
          <div><dt>Project ID</dt><dd>{projectId || 'Tidak dikonfigurasi'}</dd></div>
          <div><dt>App Check SDK</dt><dd>{appCheckAktif ? 'Terinisialisasi di klien' : 'Tidak terinisialisasi'}</dd></div>
          <div><dt>Emulator</dt><dd>{emulator ? 'Aktif' : 'Tidak aktif'}</dd></div>
        </dl>
      </header>
      <section className="firebase-overview-grid" aria-label="Layanan Firebase">
        {LAYANAN_FIREBASE.map((layanan) => (
          <article className="firebase-overview-card" key={layanan.judul}>
            <h2>{layanan.judul}</h2>
            <p>{layanan.deskripsi}</p>
            <span className="firebase-overview-status">{layanan.status}</span>
            <p className="firebase-overview-next">{layanan.tindakan}</p>
            <div className="firebase-overview-actions">
              {projectId && (
                <a href={linkConsole(projectId, layanan.console)} target="_blank" rel="noopener noreferrer"
                   aria-label={`Buka ${layanan.judul} di Firebase Console`}>
                  Buka Console
                </a>
              )}
              {layanan.route && <a href={`#${layanan.route}`}>Detail layanan</a>}
              <a href={layanan.docs} target="_blank" rel="noopener noreferrer"
                 aria-label={`Dokumentasi ${layanan.judul}`}>
                Dokumentasi
              </a>
            </div>
          </article>
        ))}
      </section>
      <aside className="firebase-overview-note" role="note">
        <h2>Catatan autentikasi Android</h2>
        <p>
          Login saat ini berjalan di web/TWA dengan Firebase JS SDK. Tidak ditemukan alur
          email-link sign-in atau Firebase Android Auth SDK di aplikasi, sehingga migrasi
          Firebase Dynamic Links untuk alur tersebut belum berlaku. Jika fitur email-link
          ditambahkan kelak, siapkan domain Firebase Hosting dan verifikasi deep link
          Android sebelum merilisnya.
        </p>
      </aside>
    </>
  );
}

function KartuInfo({ info, projectId, appCheckAktif, emulator }) {
  return (
    <>
      <header className="platform-tenants-heading">
        <p className="platform-tenants-kicker">Pusat kendali · superadmin</p>
        <h1>{info.judul}</h1>
        <p>{info.ringkasan}</p>
      </header>
      <section className="platform-tenants-card">
        <span className="platform-tenants-status is-unknown">{info.status}</span>
        <p>{info.tindakan}</p>
        {info.judul === 'Kesehatan Sistem' && (
          <dl className="platform-ops-facts">
            <div><dt>Firebase project</dt><dd>{projectId || 'Tidak dikonfigurasi'}</dd></div>
            <div><dt>App Check klien</dt><dd>{appCheckAktif ? 'Terinisialisasi pada sesi ini' : 'Tidak terinisialisasi pada sesi ini'}</dd></div>
            <div><dt>Firebase Emulator</dt><dd>{emulator ? 'Aktif pada build development' : 'Tidak aktif pada sesi ini'}</dd></div>
          </dl>
        )}
        {info.judul === 'App Check' && (
          <p className="platform-ops-note">
            {appCheckAktif
              ? 'SDK App Check terinisialisasi pada klien ini. Status ini tidak membuktikan bahwa token diterima atau enforcement aktif.'
              : 'App Check tidak terinisialisasi pada klien ini. Hal ini tidak membuktikan enforcement server mati atau aktif.'}
          </p>
        )}
        {info.judul === 'Konfigurasi Platform' && (
          <dl className="platform-ops-facts">
            <div><dt>Project ID</dt><dd>{projectId || 'Tidak dikonfigurasi'}</dd></div>
            <div><dt>Auth domain</dt><dd>{firebaseEnv.authDomain || 'Tidak dikonfigurasi'}</dd></div>
            <div><dt>Storage bucket</dt><dd>{firebaseEnv.storageBucket || 'Tidak dikonfigurasi'}</dd></div>
            <div><dt>Realtime Database URL</dt><dd>{firebaseEnv.databaseURL || 'Tidak dikonfigurasi'}</dd></div>
          </dl>
        )}
        {info.console && projectId && (
          <a className="platform-tenants-button platform-ops-console"
             href={info.console === 'billing' ? linkCloudBilling(projectId) : linkConsole(projectId, info.console)}
             target="_blank" rel="noopener noreferrer">
            {info.console === 'billing' ? 'Buka Google Cloud Billing' : 'Buka Firebase Console'}
          </a>
        )}
        {info.link && <a className="platform-tenants-button platform-ops-console" href={info.link.href}>{info.link.label}</a>}
      </section>
    </>
  );
}

function DaftarPaket() {
  const formatHarga = (nominal) => new Intl.NumberFormat('id-ID', {
    style: 'currency', currency: 'IDR', maximumFractionDigits: 0,
  }).format(nominal);

  return (
    <>
      <header className="platform-tenants-heading">
        <p className="platform-tenants-kicker">Manajemen tenant · katalog</p>
        <h1>Paket</h1>
        <p>Katalog harga aplikasi dari konfigurasi paket. Katalog ini tidak membuat langganan atau mengubah entitlement.</p>
      </header>
      <section className="platform-tenants-card">
        <div className="platform-package-grid">
          {paket.map((item) => (
            <article className="platform-package" key={item.id}>
              <p>{item.kelompok}</p>
              <h2>{item.name}</h2>
              <strong>{formatHarga(item.annualPrice)}<small> / tahun</small></strong>
              <span>{item.features}</span>
              <code>{item.id}</code>
            </article>
          ))}
        </div>
        <p className="platform-ops-note">Pembayaran dan status langganan diproses backend/webhook; tidak ada aksi perubahan paket pada halaman katalog.</p>
      </section>
    </>
  );
}

function DaftarPeran({ mode }) {
  const semuaGrup = MENU_SUPERADMIN;
  const matriks = PERAN_MENU.map(([label, role]) => ({
    label,
    role,
    grup: menuUntukPeran(role),
  }));

  return (
    <>
      <header className="platform-tenants-heading">
        <p className="platform-tenants-kicker">Kontrol akses · katalog aplikasi</p>
        <h1>{mode === 'menu' ? 'Katalog menu platform' : 'Matriks menu dan peran'}</h1>
        <p>
          {mode === 'menu'
            ? 'Daftar menu superadmin yang berasal dari katalog navigasi aplikasi.'
            : 'Matriks ini menampilkan grup menu yang disediakan frontend menurut peran. Security Rules dan custom claims tetap menjadi sumber otorisasi.'}
        </p>
      </header>
      <section className="platform-tenants-card">
        {mode === 'menu' ? (
          <div className="platform-ops-menu-list">
            {semuaGrup.map((group) => (
              <article key={group.id}>
                <h2>{group.label}</h2>
                <ul>{group.item.map((item) => <li key={item.path}><a href={`#${item.path}${item.search || ''}`}>{item.label}</a></li>)}</ul>
              </article>
            ))}
          </div>
        ) : (
          <div className="platform-tenants-table-wrap">
            <table className="platform-tenants-table">
              <thead><tr><th scope="col">Peran</th><th scope="col">Grup menu</th><th scope="col">Tautan</th></tr></thead>
              <tbody>
                {matriks.map(({ label, role, grup }) => (
                  <tr key={role}>
                    <th scope="row">{label}</th>
                    <td>{grup.map((section) => section.label).join(' · ')}</td>
                    <td>{grup.reduce((total, section) => total + section.item.length, 0)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        {mode === 'peran' && (
          <p className="platform-ops-note">
            {GRUP_MENU.length + MENU_ADMIN_SEKOLAH.length} grup guru dan admin sekolah didefinisikan terpisah dari {MENU_SUPERADMIN.length} grup superadmin.
            Perubahan hak akses global membutuhkan perubahan claim dan Security Rules yang teruji.
          </p>
        )}
      </section>
    </>
  );
}

function KontrolToggle({ label, description, enabled, setting, danger = false }) {
  const [draft, setDraft] = useState(enabled);
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const dirty = draft !== enabled;

  useEffect(() => {
    setDraft(enabled);
  }, [enabled]);

  async function simpan() {
    if (!dirty || busy) return;
    if (danger && draft && !window.confirm(
      'Aktifkan mode pemeliharaan? Pengguna selain superadmin akan kehilangan akses ke aplikasi.',
    )) return;

    setBusy(true);
    setError('');
    setNotice('');
    try {
      const result = await setPlatformControl(setting(draft));
      setNotice(result.changed ? 'Perubahan tersimpan dan tercatat di audit.' : 'Kontrol sudah memiliki nilai tersebut; tidak ada perubahan baru.');
    } catch (err) {
      console.error('[platform-controls] Gagal menyimpan kontrol:', err);
      setError(err?.code === 'functions/permission-denied'
        ? 'Server menolak perubahan. Pastikan akun memiliki klaim superadmin dan App Check valid.'
        : 'Kontrol gagal disimpan. Periksa koneksi dan coba lagi.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <article className={`platform-control-row${danger ? ' is-danger' : ''}`}>
      <div>
        <h2>{label}</h2>
        <p>{description}</p>
        <span className={`platform-tenants-status ${enabled ? (danger ? 'is-inactive' : 'is-active') : 'is-unknown'}`}>
          {enabled ? 'Aktif' : 'Nonaktif'}
        </span>
      </div>
      <label className="platform-control-switch">
        <input
          aria-label={label}
          type="checkbox"
          checked={draft}
          disabled={busy}
          onChange={(event) => { setDraft(event.target.checked); setError(''); setNotice(''); }}
        />
        <span>{draft ? 'Aktif' : 'Nonaktif'}</span>
      </label>
      <button className="platform-tenants-button" type="button" disabled={!dirty || busy} onClick={() => void simpan()}>
        {busy ? 'Menyimpan…' : 'Simpan perubahan'}
      </button>
      {error && <p className="platform-tenants-error" role="alert">{error}</p>}
      {notice && <p className="platform-ops-note" role="status">{notice}</p>}
    </article>
  );
}

function KontrolPlatform({ maintenance = false }) {
  const controls = usePlatformControls();
  const maintenanceAktif = controls.maintenance;

  return (
    <>
      <header className="platform-tenants-heading">
        <p className="platform-tenants-kicker">{maintenance ? 'Pengaturan platform · kontrol akses' : 'Manajemen fitur · kontrol server'}</p>
        <h1>{maintenance ? 'Mode Pemeliharaan' : 'Feature Flags'}</h1>
        <p>{maintenance
          ? 'Tutup akses antarmuka bagi seluruh peran selain superadmin dan hentikan endpoint AI serta checkout.'
          : 'Aktif/nonaktifkan kemampuan AI yang diperiksa kembali oleh Cloud Functions. Perubahan dicatat secara permanen di audit.'}</p>
      </header>
      {controls.error && <p className="platform-tenants-error" role="alert">{controls.error}</p>}
      <section className="platform-tenants-card">
        {maintenance ? (
          <KontrolToggle
            label="Mode pemeliharaan global"
            description="Pengguna selain superadmin dialihkan ke halaman pemeliharaan. Endpoint AI dan checkout juga menolak permintaan baru."
            enabled={maintenanceAktif}
            danger
            setting={(enabled) => ({ setting: 'maintenance', enabled })}
          />
        ) : (
          <>
            <KontrolToggle
              label="Asisten AI"
              description="Mengizinkan atau menolak callable percakapan Asisten AI."
              enabled={controls.features.aiAssistant}
              setting={(enabled) => ({ setting: 'feature', feature: 'aiAssistant', enabled })}
            />
            <KontrolToggle
              label="Generator perangkat ajar AI"
              description="Mengizinkan atau menolak callable pembuatan ATP, KKTP, dan modul ajar."
              enabled={controls.features.aiGeneration}
              setting={(enabled) => ({ setting: 'feature', feature: 'aiGeneration', enabled })}
            />
          </>
        )}
        <p className="platform-ops-note">
          Perubahan hanya dapat dilakukan oleh callable terproteksi App Check dengan klaim superadmin.
          Firestore mencatat actor UID, kontrol, nilai sebelum/sesudah, dan waktu server; klien tidak dapat menulis audit atau kontrol.
          Mode pemeliharaan membatasi antarmuka dan endpoint yang disebutkan, bukan akses SDK Firestore yang sudah diizinkan oleh rules.
        </p>
      </section>
    </>
  );
}

function labelKontrol(target) {
  if (target === 'maintenance') return 'Mode pemeliharaan';
  if (target === 'features.aiAssistant') return 'Asisten AI';
  if (target === 'features.aiGeneration') return 'Generator perangkat ajar AI';
  return target || 'Kontrol platform';
}

function nilaiAudit(value) {
  if (typeof value === 'boolean') return value ? 'Aktif' : 'Nonaktif';
  return String(value ?? '—');
}

export function aktivitasAudit(data) {
  if (data.action === 'platform.user.created') return 'Akun pengguna dibuat';
  return labelKontrol(data.target);
}

export function rincianAudit(data) {
  if (data.action === 'platform.user.created') {
    const role = PERAN_MENU.find(([, id]) => id === data.role)?.[0] || data.role || 'Peran tidak diketahui';
    return `${role} · tenant ${data.tenantId || '—'} · UID ${data.target || '—'}`;
  }
  return `${nilaiAudit(data.before)} → ${nilaiAudit(data.after)}`;
}

function DaftarAudit() {
  const [entries, setEntries] = useState([]);
  const [cursor, setCursor] = useState(null);
  const [nextCursor, setNextCursor] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [reload, setReload] = useState(0);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError('');
    const base = query(collection(db, 'platformAudit'), orderBy('createdAt', 'desc'));
    const pageQuery = query(base, ...(cursor ? [startAfter(cursor)] : []), limit(26));
    getDocs(pageQuery).then((snapshot) => {
      if (!active) return;
      const page = snapshot.docs.slice(0, 25);
      setEntries((current) => cursor ? [...current, ...page] : page);
      setNextCursor(page.at(-1) || null);
      setHasMore(snapshot.docs.length > 25);
    }).catch((err) => {
      console.error('[platform-audit] Gagal memuat audit platform:', err);
      if (active) setError(err?.code === 'permission-denied'
        ? 'Akses log audit ditolak. Pastikan sesi memiliki klaim superadmin terbaru.'
        : 'Log audit tidak dapat dimuat. Periksa koneksi lalu coba lagi.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [cursor, reload]);

  function muatUlang() {
    setEntries([]);
    setCursor(null);
    setNextCursor(null);
    setHasMore(false);
    setReload((value) => value + 1);
  }

  return (
    <>
      <header className="platform-tenants-heading">
        <p className="platform-tenants-kicker">Keamanan dan audit · kontrol platform</p>
        <h1>Audit Log</h1>
        <p>Perubahan kontrol platform dicatat oleh Cloud Functions. Daftar ini tidak mencakup seluruh aktivitas Firebase atau semua tindakan pengguna.</p>
      </header>
      <section className="platform-tenants-card">
        <div className="platform-tenants-toolbar">
          <div><h2>Aktivitas platform terbaru</h2><p>{entries.length} entri dimuat · maksimal 25 per halaman</p></div>
          <button className="platform-tenants-button secondary" type="button" onClick={muatUlang} disabled={loading}>
            {loading && !entries.length ? 'Memuat…' : 'Muat ulang'}
          </button>
        </div>
        {error && <p className="platform-tenants-error" role="alert">{error}</p>}
        {loading && !entries.length ? (
          <p className="platform-tenants-empty" role="status">Memuat log audit…</p>
        ) : !error && !entries.length ? (
          <p className="platform-tenants-empty">Belum ada perubahan kontrol yang tercatat.</p>
        ) : entries.length > 0 && (
          <div className="platform-tenants-table-wrap">
            <table className="platform-tenants-table">
              <thead><tr><th scope="col">Waktu</th><th scope="col">Admin UID</th><th scope="col">Aktivitas</th><th scope="col">Rincian</th></tr></thead>
              <tbody>
                {entries.map((entry) => {
                  const data = entry.data();
                  const waktu = data.createdAt?.toDate?.();
                  return (
                    <tr key={entry.id}>
                      <td>{waktu instanceof Date ? new Intl.DateTimeFormat('id-ID', { dateStyle: 'medium', timeStyle: 'short' }).format(waktu) : 'Menunggu waktu server'}</td>
                      <td>{data.actorUid || '—'}</td>
                      <td>{aktivitasAudit(data)}</td>
                      <td>{rincianAudit(data)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {hasMore && (
          <div className="platform-tenants-more">
            <button className="platform-tenants-button" type="button" disabled={loading} onClick={() => setCursor(nextCursor)}>
              {loading ? 'Memuat…' : 'Muat entri berikutnya'}
            </button>
          </div>
        )}
      </section>
    </>
  );
}

function RingkasanPenggunaan({ role, judul = 'Penggunaan Platform' }) {
  const [counts, setCounts] = useState(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [ulang, setUlang] = useState(0);

  useEffect(() => {
    if (role !== 'superadmin') return undefined;
    let active = true;
    setLoading(true);
    setError('');
    Promise.all([
      getCountFromServer(collection(db, 'tenants')),
      getCountFromServer(collection(db, 'users')),
      getCountFromServer(query(collection(db, 'users'), where('role', '==', 'admin_sekolah'))),
      getCountFromServer(collection(db, 'directory')),
    ]).then(([tenants, users, admins, directory]) => {
      if (active) setCounts({
        tenants: tenants.data().count,
        users: users.data().count,
        admins: admins.data().count,
        directory: directory.data().count,
      });
    }).catch((err) => {
      console.error('[platform-usage] Gagal memuat agregat:', err);
      if (active) setError(err?.code === 'permission-denied'
        ? 'Akses agregat lintas tenant ditolak. Pastikan klaim superadmin sudah diperbarui.'
        : 'Snapshot penggunaan tidak dapat dimuat. Coba lagi nanti.');
    }).finally(() => {
      if (active) setLoading(false);
    });
    return () => { active = false; };
  }, [role, ulang]);

  return (
    <>
      <header className="platform-tenants-heading">
        <p className="platform-tenants-kicker">{judul === 'Statistik Global' ? 'Dashboard superadmin · snapshot' : 'Laporan dan analitik · snapshot'}</p>
        <h1>{judul}</h1>
        <p>Jumlah dokumen Firestore saat ini; bukan pengguna aktif, penggunaan historis, atau laporan biaya.</p>
      </header>
      <section className="platform-tenants-card">
        {error && <p className="platform-tenants-error" role="alert">{error}</p>}
        {loading && <p role="status">Menghitung snapshot Firestore…</p>}
        {counts && (
          <div className="platform-ops-counts">
            <article><span>Tenant sekolah</span><strong>{counts.tenants.toLocaleString('id-ID')}</strong></article>
            <article><span>Profil pengguna</span><strong>{counts.users.toLocaleString('id-ID')}</strong></article>
            <article><span>Admin sekolah</span><strong>{counts.admins.toLocaleString('id-ID')}</strong></article>
            <article><span>Entri direktori chat</span><strong>{counts.directory.toLocaleString('id-ID')}</strong></article>
          </div>
        )}
        <button className="platform-tenants-button secondary" type="button" disabled={loading} onClick={() => setUlang((n) => n + 1)}>
          {loading ? 'Memuat…' : 'Muat ulang snapshot'}
        </button>
        <p className="platform-ops-note">Angka agregat dapat menimbulkan pembacaan Firestore dan biaya. Untuk tren, biaya, dan akun Auth aktif gunakan telemetry backend/Cloud Monitoring.</p>
      </section>
    </>
  );
}

export default function PlatformOperationsPage() {
  const { pathname } = useLocation();
  const { role } = useAuth();
  const info = INFO_MODUL[pathname];
  const mode = pathname === '/platform/tenant/paket' ? 'paket'
    : pathname === '/platform/pengguna/peran' || pathname === '/platform/fitur/izin' ? 'peran'
      : pathname === '/platform/fitur/menu' ? 'menu' : '';
  if (role !== 'superadmin') {
    return <main className="platform-tenants"><section className="platform-tenants-card" role="alert"><h1>Akses platform dibatasi</h1><p>Modul platform hanya tersedia untuk superadmin.</p></section></main>;
  }

  return (
    <main className="platform-tenants">
      {pathname === '/platform/firebase'
        ? <RingkasanFirebase projectId={firebaseEnv.projectId} appCheckAktif={Boolean(appCheck)} emulator={pakaiEmulator} />
        : pathname === '/platform/laporan/penggunaan' || pathname === '/platform/dashboard/statistik'
        ? <RingkasanPenggunaan
          role={role}
          judul={pathname === '/platform/dashboard/statistik' ? 'Statistik Global' : 'Penggunaan Platform'}
        />
        : pathname === '/platform/fitur/flags'
          ? <KontrolPlatform />
          : pathname === '/platform/pengaturan/pemeliharaan'
            ? <KontrolPlatform maintenance />
            : pathname === '/platform/dashboard/aktivitas' || pathname === '/platform/keamanan/audit'
              ? <DaftarAudit />
        : mode === 'paket'
          ? <DaftarPaket />
          : mode === 'menu' || mode === 'peran'
            ? <DaftarPeran mode={mode} />
            : info
              ? <KartuInfo info={info} projectId={firebaseEnv.projectId} appCheckAktif={Boolean(appCheck)} emulator={pakaiEmulator} />
              : (
                <section className="platform-tenants-card" role="alert">
                  <h1>Modul platform tidak tersedia</h1>
                  <p>Rute ini belum terdaftar pada katalog menu platform.</p>
                </section>
              )}
    </main>
  );
}
