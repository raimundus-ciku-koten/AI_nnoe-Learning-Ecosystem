// web/src/pages/dataDasar/umum.js
/**
 * Helper bersama untuk semua tab Data Dasar.
 *
 * GABUNGAN 2 VERSI — self-contained, tanpa impor eksternal.
 * Jika ingin modular, pindahkan blok 6 (Kode Siswa) ke `kodeSiswa.js` dan
 * blok 7 (Barcode) ke `barcode.js`, lalu ubah impornya.
 *
 * Ekspor utama:
 *   - Utilitas: buatId, bersih, kunciKelas, urutUnik, urutNama, HARI, ik
 *   - Data siswa: ambilSiswa, bekukanKodeSiswa
 *   - Kode siswa: buatKodeSiswa, urlScanKode, kodeSiswaValid, fnv1a32
 *   - Barcode: barcodeCode128SVG, barcodeCode39SVG
 *   - Penanganan galat: galat, toast (re-export)
 */
import { esc, ikon } from '../../ui.js';
import { buatKodeAcak } from '../../lib/kodeSiswa.js';
import { toast } from '../../components/toast.js';
import { muatSiswa as muatDaftarSiswa } from '../../services/students.js';
import { muatPenugasanGuru } from '../../services/teacherAssignments.js';

// Toast satu sumber (components/toast.js). Re-export agar impor dari modul ini tetap jalan.
export { toast };

/* ===========================================================================
 * 1. IKON — versi aman (tidak crash bila nama ikon belum terdaftar)
 * =========================================================================== */
export const ik = (nama, kelas = '') => {
  try { return ikon(nama, kelas) || ''; } catch { return ''; }
};

/* ===========================================================================
 * 2. UTILITAS UMUM
 * =========================================================================== */
export const HARI = ['', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];

/** ID acak 20 karakter untuk dokumen/entri baru. */
export const buatId = () => {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 20);
  }
  return (Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).slice(0, 20);
};

/** Bersihkan teks: buang karakter kontrol, rapikan spasi, batasi panjang. */
export const bersih = (teks, maks = 100) =>
  String(teks ?? '')
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maks);

/** Nama kelas → kunci aman untuk ID dokumen. */
export const kunciKelas = (kelas) =>
  String(kelas ?? '').trim().toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'kelas';

/** Unik + urut numeric-aware (`7A` < `7B` < `10A`). */
export const urutUnik = (arr) =>
  [...new Set((arr || []).map((x) => String(x ?? '').trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, 'id', { numeric: true }));

export const urutNama = (a, b) =>
  String(a?.nama ?? '').localeCompare(String(b?.nama ?? ''), 'id', { sensitivity: 'base' });

/* ===========================================================================
 * 3. PENANGANAN GALAT
 * =========================================================================== */
const PESAN_GALAT = [
  ['permission-denied',    'Anda tidak memiliki izin.'],
  ['unauthenticated',      'sesi berakhir, silakan masuk ulang.'],
  ['unavailable',          'koneksi bermasalah, coba lagi.'],
  ['network',              'koneksi bermasalah, coba lagi.'],
  ['deadline-exceeded',    'permintaan terlalu lama, coba lagi.'],
  ['resource-exhausted',   'kuota terlampaui, coba beberapa saat lagi.'],
  ['not-found',            'data tidak ditemukan.'],
  ['failed-precondition',  'prasyarat layanan belum terpenuhi.'],
];

export function galat(err, awalan = 'Terjadi kesalahan') {
  console.error(`[DataDasar] ${awalan}:`, err);
  const kode = String(err?.code ?? '');
  const cocok = PESAN_GALAT.find(([k]) => kode.includes(k));
  toast(cocok ? `${awalan}: ${cocok[1]}` : `${awalan}.`, 'galat');
}

/* ===========================================================================
 * 4. PENUGASAN GURU
 * =========================================================================== */

/** Muat daftar penugasan per pengguna dari profil Supabase yang diizinkan RLS. */
export const muatPenugasan = muatPenugasanGuru;

/* ===========================================================================
 * 5. SISWA (dengan cache concurrent-safe)
 * =========================================================================== */

/**
 * Daftar siswa milik guru, di-cache di `ctx.cache.siswa`.
 * Panggilan serentak berbagi satu request (tidak baca ganda).
 */
export async function ambilSiswa(ctx, paksa = false) {
  const uid = ctx?.user?.uid;
  if (!uid) throw new Error('Pengguna belum masuk');
  const cache = (ctx.cache ??= {});

  if (!paksa && cache.siswa) return cache.siswa;
  if (!paksa && cache.siswaJanji) return cache.siswaJanji;

  const janji = muatDaftarSiswa(uid)
    .then((students) => (cache.siswa = students))
    .finally(() => { if (cache.siswaJanji === janji) delete cache.siswaJanji; });
  cache.siswaJanji = janji;
  return janji;
}

/**
 * Simpan permanen `kodeUnik` untuk siswa yang belum punya, supaya kode pada kartu
 * yang sudah dicetak TIDAK berubah. Tabrakan kode diselesaikan otomatis.
 * Kode siswa diwajibkan saat row Supabase dibuat dan tidak dapat diubah.
 * @returns {Promise<number>} jumlah siswa yang diperbarui
 */
export async function bekukanKodeSiswa(ctx, daftar = null) {
  const uid = ctx?.user?.uid;
  if (!uid) throw new Error('Pengguna belum masuk');
  const siswa = daftar || (await ambilSiswa(ctx));
  if (siswa.some((student) => !student.kodeUnik)) {
    throw new Error('Ada siswa tanpa kode unik. Data legacy harus direkonsiliasi sebelum digunakan.');
  }
  return 0;
}

/* ===========================================================================
 * 6. KODE UNIK SISWA + URL SCAN
 * ---------------------------------------------------------------------------
 * Kode baru adalah token acak kriptografis, tidak memuat kelas atau data siswa.
 * =========================================================================== */

/** FNV-1a 32-bit hash. */
export function fnv1a32(str) {
  let h = 0x811c9dc5;
  for (let i = 0; i < str.length; i += 1) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0; // Math.imul = cepat & tepat 32-bit
  }
  return h >>> 0;
}

/**
 * Buat token acak untuk kartu baru. Kode tersimpan tidak pernah berubah.
 *
 * @param {Object} siswa
 * @returns {string}
 */
export function buatKodeSiswa(siswa) {
  if (siswa?.kodeUnik) return String(siswa.kodeUnik);
  return buatKodeAcak();
}

/**
 * Validasi format kode siswa (ALE-XXXXXX-XXXXXX-XXXX).
 * @param {string} kode
 * @returns {boolean}
 */
export function kodeSiswaValid(kode) {
  return /^(?:ALE-[0-9A-F]{32}|ALE-[A-Z0-9]{1,6}-[A-Z0-9]{6}-\d{4})$/.test(String(kode ?? ''));
}

/**
 * Bangun URL scan absensi dari kode unik.
 * Format: <origin><pathname>#/scan/<kodeUnik>
 * Aman untuk hosting statis.
 * Daftarkan rute di main.js: daftar('/scan/:kode', halamanScan, { shell: false });
 */
export function urlScanKode(kode) {
  const origin =
    typeof location !== 'undefined' && location.origin
      ? location.origin
      : 'https://ainnoe.app';
  const pathname =
    typeof location !== 'undefined' && location.pathname
      ? location.pathname.replace(/\/[^/]*$/, '/')
      : '/';
  const bersihOrigin = String(origin).replace(/\/+$/, '');
  const bersihKode   = encodeURIComponent(String(kode || '').trim());
  return `${bersihOrigin}${pathname}#/scan/${bersihKode}`;
}

/* ===========================================================================
 * 7. BARCODE CODE128B — IMPLEMENTASI STANDAR ISO/IEC 15417
 * ---------------------------------------------------------------------------
 * Tabel 107 pola Code128 (0..106). Tanpa dependensi eksternal.
 * =========================================================================== */

const CODE128_POLA = [
  '11011001100','11001101100','11001100110','10010011000','10010001100',
  '10001001100','10011001000','10011000100','10001100100','11001001000',
  '11001000100','11000100100','10110011100','10011011100','10011001110',
  '10111001100','10011101100','10011100110','11001110010','11001011100',
  '11001001110','11011100100','11001110100','11101101110','11101001100',
  '11100101100','11100100110','11101100100','11100110100','11100110010',
  '11011011000','11011000110','11000110110','10100011000','10001011000',
  '10001000110','10110001000','10001101000','10001100010','11010001000',
  '11000101000','11000100010','10110111000','10110001110','10001101110',
  '10111011000','10111000110','10001110110','11101110110','11010001110',
  '11000101110','11011101000','11011100010','11011101110','11101011000',
  '11101000110','11100010110','11101101000','11101100010','11100011010',
  '11101111010','11001000010','11110001010','10100110000','10100001100',
  '10010110000','10010000110','10000101100','10000100110','10110010000',
  '10110000100','10011010000','10011000010','10000110100','10000110010',
  '11000010010','11001010000','11110111010','11000010100','10001111010',
  '10100111100','10010111100','10010011110','10111100100','10011110100',
  '10011110010','11110100100','11110010100','11110010010','11011011110',
  '11011110110','11110110110','10101111000','10100011110','10001011110',
  '10111101000','10111100010','11110101000','11110100010','10111011110',
  '10111101110','11101011110','11110101110','11010000100','11010010000',
  '11010011100','1100011101011',
];
const CODE128_START_B      = 104;
const CODE128_STOP         = 106;
const CODE128_ASCII_OFFSET = 32; // nilai 0..94 mewakili ASCII 32..126

/** Normalisasi: hanya ASCII 32..126, max `maks` char. */
function normalisasiCode128B(teks, maks = 48) {
  return String(teks ?? '')
    .slice(0, maks)
    .split('')
    .map((c) => {
      const code = c.charCodeAt(0);
      return (code >= 32 && code <= 126) ? c : '?';
    })
    .join('');
}

/**
 * Render barcode Code128 (subset B) sebagai SVG inline.
 * Standar ISO/IEC 15417 — checksum modulo 103 dengan bobot posisi.
 * Ukuran output ~2–4 KB/kartu — aman untuk cetak massal.
 *
 * @param {string} teks
 * @param {{ tinggi?: number, lebarModul?: number, maks?: number }} [opts]
 * @returns {string} SVG markup
 */
export function barcodeCode128SVG(teks, { tinggi = 48, lebarModul = 1.6, maks = 48 } = {}) {
  const kode = normalisasiCode128B(teks, maks);

  // Deret nilai Code128B: [START_B, ...nilai(teks), checksum, STOP]
  const nilai = [CODE128_START_B];
  let checksum = CODE128_START_B;
  for (let i = 0; i < kode.length; i += 1) {
    const v = kode.charCodeAt(i) - CODE128_ASCII_OFFSET;
    nilai.push(v);
    checksum += v * (i + 1); // bobot: posisi (1-based)
  }
  nilai.push(checksum % 103);
  nilai.push(CODE128_STOP);

  // Deret bit total
  const bit = nilai.map((v) => CODE128_POLA[v] || '').join('');
  const lebar = bit.length * lebarModul;

  // RLE → path SVG
  let x = 0;
  let d = '';
  let i = 0;
  while (i < bit.length) {
    const c = bit[i];
    let j = i;
    while (j < bit.length && bit[j] === c) j += 1;
    const w = (j - i) * lebarModul;
    if (c === '1') {
      d += `M${x.toFixed(2)},0 h${w.toFixed(2)} v${tinggi} h${(-w).toFixed(2)} z`;
    }
    x += w;
    i = j;
  }

  const lebarTotal = Math.ceil(lebar);
  const tinggiTotal = tinggi + 18;

  return `
    <svg xmlns="http://www.w3.org/2000/svg"
         viewBox="0 0 ${lebarTotal} ${tinggiTotal}"
         width="${lebarTotal}" height="${tinggiTotal}"
         role="img" aria-label="Barcode ${esc(kode)}">
      <rect width="100%" height="100%" fill="#fff"/>
      <path d="${d}" fill="#000"/>
      <text x="${lebarTotal / 2}" y="${tinggi + 14}"
            text-anchor="middle"
            font-family="ui-monospace, monospace" font-size="11" fill="#111">
        ${esc(kode)}
      </text>
    </svg>`;
}

/* ===========================================================================
 * 8. BARCODE CODE39 (fallback opsional untuk printer legacy)
 * =========================================================================== */
const CODE39_POLA = {
  '0':'101001101101','1':'110100101011','2':'101100101011','3':'110110010101',
  '4':'101001101011','5':'110100110101','6':'101100110101','7':'101001011011',
  '8':'110100101101','9':'101100101101',
  'A':'110101001011','B':'101101001011','C':'110110100101','D':'101011001011',
  'E':'110101100101','F':'101101100101','G':'101010011011','H':'110101001101',
  'I':'101101001101','J':'101011001101','K':'110101010011','L':'101101010011',
  'M':'110110101001','N':'101011010011','O':'110101101001','P':'101101101001',
  'Q':'101010110011','R':'110101011001','S':'101101011001','T':'101011011001',
  'U':'110010101011','V':'100110101011','W':'110011010101','X':'100101101011',
  'Y':'110010110101','Z':'100110110101',
  '-':'100101011011','.':'110010101101',' ':'100110101101','$':'100100100101',
  '/':'100100101001','+':'100101001001','%':'101001001001','*':'100101101101',
};

export function barcodeCode39SVG(teks, { tinggi = 48, lebarModul = 1.6, maks = 32 } = {}) {
  const kode = String(teks ?? '').toUpperCase()
    .replace(/[^0-9A-Z\-. $/+%]/g, '')
    .slice(0, maks);

  const berKode = `*${kode}*`;
  let bit = '';
  for (const c of berKode) {
    bit += CODE39_POLA[c] || '';
    bit += '0'; // jarak antar-karakter
  }

  let x = 0;
  let d = '';
  let i = 0;
  while (i < bit.length) {
    const c = bit[i];
    let j = i;
    while (j < bit.length && bit[j] === c) j += 1;
    const w = (j - i) * lebarModul;
    if (c === '1') {
      d += `M${x.toFixed(2)},0 h${w.toFixed(2)} v${tinggi} h${(-w).toFixed(2)} z`;
    }
    x += w;
    i = j;
  }

  const lebarTotal = Math.ceil(x);
  const tinggiTotal = tinggi + 18;

  return `
    <svg xmlns="http://www.w3.org/2000/svg"
         viewBox="0 0 ${lebarTotal} ${tinggiTotal}"
         width="${lebarTotal}" height="${tinggiTotal}"
         role="img" aria-label="Barcode ${esc(kode)}">
      <rect width="100%" height="100%" fill="#fff"/>
      <path d="${d}" fill="#000"/>
      <text x="${lebarTotal / 2}" y="${tinggi + 14}"
            text-anchor="middle"
            font-family="ui-monospace, monospace" font-size="11" fill="#111">
        ${esc(kode)}
      </text>
    </svg>`;
}