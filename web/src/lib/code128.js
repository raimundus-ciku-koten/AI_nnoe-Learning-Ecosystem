// web/src/lib/code128.js
/**
 * Encoder Code 128 (ISO/IEC 15417) + renderer SVG.
 * ---------------------------------------------------------------------------
 *  - Otomatis memakai Set B (ASCII 32–126) dan Set C (pasangan digit) agar
 *    barcode lebih pendek → modul lebih lebar → lebih mudah dipindai.
 *  - Murni (tanpa DOM, tanpa dependensi) sehingga bisa diuji di Node.
 *  - SVG memakai satu <path> (bukan puluhan <rect>) → DOM ringan, cetak cepat.
 *  - Karakter di luar ASCII cetak diganti "-" agar hasil selalu valid.
 */

// Lebar bar/spasi bergantian (bar dulu). 0–102 data, 103–105 start A/B/C, 106 stop.
const POLA = (
  '212222 222122 222221 121223 121322 131222 122213 122312 132212 221213 ' +
  '221312 231212 112232 122132 122231 113222 123122 123221 223211 221132 ' +
  '221231 213212 223112 312131 311222 321122 321221 312212 322112 322211 ' +
  '212123 212321 232121 111323 131123 131321 112313 132113 132311 211313 ' +
  '231113 231311 112133 112331 132131 113123 113321 133121 313121 211331 ' +
  '231131 213113 213311 213131 311123 311321 331121 312113 312311 332111 ' +
  '314111 221411 431111 111224 111422 121124 121421 141122 141221 112214 ' +
  '112412 122114 122411 142112 142211 241211 221114 413111 241112 134111 ' +
  '111242 121142 121241 114212 124112 124211 411212 421112 421211 212141 ' +
  '214121 412121 111143 111341 131141 114113 114311 411113 411311 113141 ' +
  '114131 311141 411131 211412 211214 211232 2331112'
).split(' ');

export const CODE_C = 99;
export const CODE_B = 100;
export const START_B = 104;
export const START_C = 105;
export const STOP = 106;

const ESC_ATTR = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
const escAttr = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ESC_ATTR[c]);

/** Ganti karakter di luar ASCII cetak (32–126) dengan "-". */
export function bersihkan(teks) {
  return String(teks ?? '').replace(/[^\x20-\x7E]/g, '-');
}

function panjangDigit(s, dari) {
  let n = 0;
  while (dari + n < s.length) {
    const c = s.charCodeAt(dari + n);
    if (c < 48 || c > 57) break;
    n++;
  }
  return n;
}

/**
 * Daftar nilai simbol lengkap: [start, ...data, checksum, stop].
 * Set C dipakai untuk deretan digit ≥ 4 (di awal / di akhir) atau ≥ 6 (di tengah).
 */
export function nilaiCode128(teks) {
  const s = bersihkan(teks);
  const data = [];
  let start = null;
  let set = null; // 'B' | 'C'
  let i = 0;

  while (i < s.length) {
    let run = panjangDigit(s, i);

    if (set === 'C') {
      if (run >= 2) {
        data.push(Number(s.slice(i, i + 2)));
        i += 2;
      } else {
        data.push(CODE_B);
        set = 'B';
      }
      continue;
    }

    const sampaiAkhir = i + run === s.length;
    const ambang = i === 0 || sampaiAkhir ? 4 : 6;

    if (run >= ambang) {
      if (run % 2 === 1) { // satu digit di Set B dulu agar sisanya genap
        if (set === null) { start = START_B; set = 'B'; }
        data.push(s.charCodeAt(i) - 32);
        i++; run--;
      }
      if (set === null) start = START_C; else data.push(CODE_C);
      set = 'C';
      continue;
    }

    if (set === null) { start = START_B; set = 'B'; }
    data.push(s.charCodeAt(i) - 32);
    i++;
  }

  if (start === null) start = START_B;
  let jumlah = start;
  data.forEach((v, idx) => { jumlah += v * (idx + 1); });
  return [start, ...data, jumlah % 103, STOP];
}

/** Urutan lebar modul (mis. "2112…") dari daftar nilai simbol. */
export function polaModul(nilai) {
  return nilai.map((v) => POLA[v]).join('');
}

/**
 * @param {string} kode
 * @param {{tinggi?:number, lebarModul?:number, zonaTenang?:number}} [opsi]
 *   tinggi      — tinggi bar (px/unit SVG)
 *   lebarModul  — lebar 1 modul (px/unit SVG)
 *   zonaTenang  — margin kosong kiri/kanan dalam modul (standar ≥ 10)
 */
export function svgCode128(kode, { tinggi = 42, lebarModul = 1.4, zonaTenang = 10 } = {}) {
  const pola = polaModul(nilaiCode128(kode));
  let totalModul = 0;
  for (let i = 0; i < pola.length; i++) totalModul += pola.charCodeAt(i) - 48;

  const lebarVB = totalModul + zonaTenang * 2;
  const tinggiVB = +(tinggi / lebarModul).toFixed(3);

  let x = zonaTenang;
  let d = '';
  for (let i = 0; i < pola.length; i++) {
    const w = pola.charCodeAt(i) - 48;
    if (i % 2 === 0) d += `M${x} 0h${w}v${tinggiVB}h-${w}z`;
    x += w;
  }

  const lebar = +(lebarVB * lebarModul).toFixed(3);
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lebarVB} ${tinggiVB}" ` +
    `width="${lebar}" height="${tinggi}" role="img" aria-label="Barcode ${escAttr(kode)}" ` +
    `preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges">` +
    `<rect width="${lebarVB}" height="${tinggiVB}" fill="#fff"/><path fill="#000" d="${d}"/></svg>`
  );
}
