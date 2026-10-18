// web/src/pages/scan.js
/**
 * scan.js — Halaman hasil scan absensi.
 *
 * Rute: /scan/:kode  (shell: false, halaman publik penuh layar)
 *
 * Alur:
 *   1. Normalisasi + validasi kode dari ctx.params.kode.
 *   2. Tunggu sesi Supabase siap (menghindari "Perlu login" palsu saat cold start).
 *   3. Cari siswa dengan kode unik pada roster milik pengguna.
 *   4. Catat kehadiran hari ini secara idempoten.
 *   5. Tampilkan hasil: tercatat / sudah tercatat / tidak dikenali / galat.
 *   6. Auto-kembali ke /datadasar/barcode agar bisa scan berikutnya tanpa klik
 *      (bisa dijeda dengan tombol "Tetap di sini").
 *
 * Keamanan:
 *   - Hanya pendidik yang login dapat mencari & mencatat siswanya sendiri (diperkuat RLS).
 *   - Semua nilai dinamis di-escape (esc) sebelum dirender.
 *   - Kode divalidasi (panjang & karakter) sebelum menyentuh database.
 *   - Render usang dibatalkan bila halaman sudah berganti (token render).
 */
import { esc } from '../ui.js';
import { getState } from '../state.js';
import { cariSiswaByKode, catatKehadiran, tungguPengguna } from '../services/absensi.js';
import { jamLokal, normalisasiKode, pesanGalat } from '../utils/scan-util.js';
import { umpanBalik } from '../utils/umpan-balik.js';

/** Ubah ke false bila ingin hanya menampilkan data siswa tanpa mencatat kehadiran. */
const CATAT_OTOMATIS = true;

const RUTE_KEMBALI = '#/datadasar/barcode';
const RUTE_LOGIN = '#/login';
/** Kunci sessionStorage agar halaman login dapat mengembalikan pengguna ke tautan scan. */
export const KUNCI_TUJUAN_LOGIN = 'scan:tujuanSetelahLogin';

/** Lama tampil sebelum kembali otomatis (ms). Galat diberi waktu lebih panjang untuk dibaca. */
const AUTO_KEMBALI_MS = { sukses: 3000, sudah: 4000, gagal: 6000 };

const NOOP = () => {};

const PESAN_KODE = {
  kosong: 'QR atau barcode kosong.',
  'terlalu-panjang': 'Kode terlalu panjang, kemungkinan bukan kartu siswa.',
  karakter: 'Kode berisi karakter yang tidak valid.',
};

/* ------------------------------------------------------------------ */
/* Template tampilan                                                   */
/* ------------------------------------------------------------------ */

const tombolKembali = (kelas = 'btn-outline', teks = 'Kembali ke Kartu') =>
  `<a class="btn ${kelas}" href="${RUTE_KEMBALI}">${teks}</a>`;

const blokSisa = (detik) => `
  <p class="scan-sisa" aria-hidden="true">
    Kembali otomatis dalam <strong id="scanSisa">${detik}</strong> detik
    <button type="button" class="btn-tautan" id="scanTahan">Tetap di sini</button>
  </p>`;

function tplLogin() {
  return `
    <section class="scan-hasil" role="status">
      <h1>Perlu login</h1>
      <p>Login dulu untuk memproses scan absensi. Setelah masuk, Anda akan dikembalikan ke kartu ini.</p>
      <a class="btn btn-primary" href="${RUTE_LOGIN}">Masuk</a>
    </section>`;
}

function tplGagal({ ikon = '✗', judul, pesan, info = '', kode = '', detik = null }) {
  return `
    <section class="scan-hasil scan-hasil--gagal" role="alert">
      <div class="scan-ikon" aria-hidden="true">${ikon}</div>
      <h1>${esc(judul)}</h1>
      <p>${pesan}</p>
      ${kode ? `<p><code class="dd-kode">${esc(kode)}</code></p>` : ''}
      ${info ? `<p class="scan-info">${esc(info)}</p>` : ''}
      ${tombolKembali()}
      ${detik != null ? blokSisa(detik) : ''}
    </section>`;
}

function tplMemuat(kode) {
  return `
    <section class="scan-hasil scan-hasil--memuat" role="status" aria-live="polite">
      <div class="scan-spinner" aria-hidden="true"></div>
      <h1>Memeriksa kode…</h1>
      <p><code class="dd-kode">${esc(kode)}</code></p>
    </section>`;
}

function tplSiswa({ siswa, kode, hasil, detik }) {
  const jam = jamLokal(hasil?.waktu);
  let varian = 'sukses';
  let ikon = '✓';
  let catatan;

  if (!CATAT_OTOMATIS) {
    catatan = 'Data siswa ditemukan. Pencatatan kehadiran otomatis sedang dinonaktifkan.';
  } else if (hasil?.status === 'sudah') {
    varian = 'sudah';
    ikon = '•';
    catatan = `Sudah tercatat hadir hari ini${jam ? ` pukul ${esc(jam)}` : ''}. Tidak dicatat ulang.`;
  } else {
    catatan = `Kehadiran dicatat${jam ? ` pukul ${esc(jam)}` : ''}. Terima kasih.`;
  }

  return `
    <section class="scan-hasil scan-hasil--${varian}" role="status" aria-live="polite">
      <div class="scan-ikon" aria-hidden="true">${ikon}</div>
      <h1>${esc(siswa.nama || 'Siswa')}</h1>
      <dl class="scan-detail">
        <div><dt>Kelas</dt><dd>${esc(siswa.kelas || '-')}</dd></div>
        <div><dt>NISN</dt><dd>${esc(siswa.nisn || '-')}</dd></div>
        <div><dt>Kode</dt><dd><code class="dd-kode">${esc(kode)}</code></dd></div>
      </dl>
      <p class="scan-info">${catatan}</p>
      ${tombolKembali('btn-primary', 'Scan Berikutnya')}
      ${blokSisa(detik)}
    </section>`;
}

/* ------------------------------------------------------------------ */
/* Auto-kembali                                                        */
/* ------------------------------------------------------------------ */

/**
 * Pasang hitung mundur kembali ke halaman kartu.
 * @returns {() => void} fungsi pembersih
 */
function pasangAutoKembali(wadah, totalMs) {
  let sisa = Math.ceil(totalMs / 1000);
  const elSisa = () => wadah.querySelector('#scanSisa');

  const idTimer = setInterval(() => {
    sisa = Math.max(0, sisa - 1);
    const el = elSisa();
    if (el) el.textContent = String(sisa);
  }, 1000);

  const idRedirect = setTimeout(() => {
    // Jangan membajak navigasi bila pengguna sudah pindah halaman.
    if (location.hash.startsWith('#/scan/')) location.hash = RUTE_KEMBALI;
  }, totalMs);

  const berhenti = () => { clearInterval(idTimer); clearTimeout(idRedirect); };

  const tahan = wadah.querySelector('#scanTahan');
  tahan?.addEventListener('click', () => {
    berhenti();
    tahan.closest('.scan-sisa')?.remove();
  }, { once: true });

  return berhenti;
}

/* ------------------------------------------------------------------ */
/* Halaman                                                             */
/* ------------------------------------------------------------------ */

export async function halamanScan(wadah, ctx = {}) {
  // Token render: bila halaman dirender ulang pada wadah yang sama saat query masih berjalan,
  // hasil lama dibuang agar tidak menimpa tampilan terbaru.
  const token = Symbol('scan');
  wadah.__scanToken = token;
  const usang = () => wadah.__scanToken !== token || !wadah.isConnected;

  const cek = normalisasiKode(ctx?.params?.kode);
  if (!cek.ok) {
    wadah.innerHTML = tplGagal({
      judul: 'Kode tidak terbaca',
      pesan: esc(PESAN_KODE[cek.alasan] || 'Kode tidak valid.'),
    });
    umpanBalik('gagal');
    return NOOP;
  }
  const { kode } = cek;

  wadah.innerHTML = tplMemuat(kode);

  // Tunggu sesi Supabase siap; state aplikasi dipakai sebagai cadangan.
  let user = null;
  try {
    user = await tungguPengguna(getState()?.user ?? null);
  } catch (error) {
    console.error('[scan] gagal memulihkan sesi:', error);
    if (usang()) return NOOP;
    wadah.innerHTML = tplGagal({
      ikon: '⚠',
      judul: 'Sesi tidak dapat diperiksa',
      pesan: esc(pesanGalat(error)),
      info: 'Periksa koneksi lalu muat ulang halaman.',
      detik: Math.ceil(AUTO_KEMBALI_MS.gagal / 1000),
    });
    return pasangAutoKembali(wadah, AUTO_KEMBALI_MS.gagal);
  }
  if (usang()) return NOOP;

  if (!user?.uid) {
    // Simpan tujuan agar halaman login bisa mengembalikan pengguna (lihat README).
    try { sessionStorage.setItem(KUNCI_TUJUAN_LOGIN, location.hash); } catch { /* mode privat */ }
    wadah.innerHTML = tplLogin();
    return NOOP;
  }

  let siswa = null;
  let hasil = null;
  let err = null;
  try {
    siswa = await cariSiswaByKode(user.uid, kode);
    if (siswa && CATAT_OTOMATIS) hasil = await catatKehadiran(user.uid, siswa, kode);
  } catch (e) {
    err = e;
    // Galat sebenarnya ke konsol untuk debugging; pengguna melihat pesan ramah.
    console.error('[scan] gagal memproses kode', e);
  }
  if (usang()) return NOOP;

  if (err) {
    wadah.innerHTML = tplGagal({
      ikon: '⚠',
      judul: 'Gagal memproses scan',
      pesan: esc(pesanGalat(err)),
      info: 'Kehadiran belum tercatat. Silakan scan ulang.',
      detik: Math.ceil(AUTO_KEMBALI_MS.gagal / 1000),
    });
    umpanBalik('gagal');
    return pasangAutoKembali(wadah, AUTO_KEMBALI_MS.gagal);
  }

  if (!siswa) {
    wadah.innerHTML = tplGagal({
      judul: 'Kode tidak dikenali',
      pesan: 'Kode ini tidak ditemukan pada data siswa Anda.',
      kode,
      info: 'Pastikan kartu yang discan milik kelas Anda.',
      detik: Math.ceil(AUTO_KEMBALI_MS.gagal / 1000),
    });
    umpanBalik('gagal');
    return pasangAutoKembali(wadah, AUTO_KEMBALI_MS.gagal);
  }

  const sudah = hasil?.status === 'sudah';
  const ms = sudah ? AUTO_KEMBALI_MS.sudah : AUTO_KEMBALI_MS.sukses;
  wadah.innerHTML = tplSiswa({ siswa, kode, hasil, detik: Math.ceil(ms / 1000) });
  umpanBalik(sudah ? 'sudah' : 'sukses');
  return pasangAutoKembali(wadah, ms);
}
