// web/src/pages/dataDasar/barcode.js
// Generator barcode SVG murni (tanpa dependensi): Code128-B (ISO/IEC 15417) & Code39.
// Modul ini sengaja mandiri agar mudah diuji di Node/Vitest tanpa Firebase.

const escXml = (s) =>
  String(s).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));

/* ------------------------------ Code128 ------------------------------ */
export const CODE128_POLA = [
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
export const CODE128_START_B = 104;
export const CODE128_STOP = 106;
const CODE128_OFFSET = 32; // nilai 0..94 = ASCII 32..126

/** Hanya ASCII 32..126; selain itu diganti '?'. Dipotong sampai `maks`. */
export function normalisasiCode128B(teks, maks = 48) {
  return Array.from(String(teks ?? '').slice(0, maks), (c) => {
    const k = c.charCodeAt(0);
    return k >= 32 && k <= 126 ? c : '?';
  }).join('');
}

/** Deret nilai simbol: [START_B, ...data, checksum, STOP]. */
export function nilaiCode128B(teks, maks = 48) {
  const kode = normalisasiCode128B(teks, maks);
  const nilai = [CODE128_START_B];
  let sum = CODE128_START_B;
  for (let i = 0; i < kode.length; i += 1) {
    const v = kode.charCodeAt(i) - CODE128_OFFSET;
    nilai.push(v);
    sum += v * (i + 1);
  }
  nilai.push(sum % 103, CODE128_STOP);
  return { kode, nilai };
}

/** String bit ('1' = bar, '0' = spasi) untuk Code128-B. */
export function bitCode128B(teks, maks = 48) {
  const { kode, nilai } = nilaiCode128B(teks, maks);
  return { kode, bit: nilai.map((v) => CODE128_POLA[v]).join('') };
}

/* ------------------------------ Code39 ------------------------------- */
export const CODE39_POLA = {
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

export function bitCode39(teks, maks = 32) {
  const kode = String(teks ?? '').toUpperCase().replace(/[^0-9A-Z\-. $/+%]/g, '').slice(0, maks);
  let bit = '';
  for (const c of `*${kode}*`) bit += `${CODE39_POLA[c]}0`; // 0 = jarak antar-karakter
  return { kode, bit: bit.slice(0, -1) };
}

/* ------------------------------ Render SVG --------------------------- */
const ZONA_TENANG = 10; // modul — syarat minimum agar mudah dipindai

function renderSvg({ kode, bit }, { tinggi, lebarModul, tampilkanTeks }) {
  // Run-length encoding → satu <path> kecil.
  let x = ZONA_TENANG * lebarModul;
  let d = '';
  for (let i = 0; i < bit.length;) {
    const c = bit[i];
    let j = i;
    while (j < bit.length && bit[j] === c) j += 1;
    const w = (j - i) * lebarModul;
    if (c === '1') d += `M${x.toFixed(2)} 0h${w.toFixed(2)}v${tinggi}h${(-w).toFixed(2)}z`;
    x += w;
    i = j;
  }
  const lebar = Math.ceil((bit.length + ZONA_TENANG * 2) * lebarModul);
  const tTeks = tampilkanTeks ? 18 : 0;
  const tinggiTotal = tinggi + tTeks;
  const label = escXml(kode);
  const teks = tampilkanTeks
    ? `<text x="${lebar / 2}" y="${tinggi + 14}" text-anchor="middle" font-family="ui-monospace,monospace" font-size="11" fill="#111">${label}</text>`
    : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${lebar} ${tinggiTotal}" width="${lebar}" height="${tinggiTotal}" role="img" aria-label="Barcode ${label}"><rect width="100%" height="100%" fill="#fff"/><path d="${d}" fill="#000"/>${teks}</svg>`;
}

/**
 * Barcode Code128 subset B sebagai SVG inline (± 1–3 KB).
 * @param {string} teks
 * @param {{tinggi?:number, lebarModul?:number, maks?:number, tampilkanTeks?:boolean}} [o]
 */
export function barcodeCode128SVG(teks, { tinggi = 48, lebarModul = 1.6, maks = 48, tampilkanTeks = true } = {}) {
  return renderSvg(bitCode128B(teks, maks), { tinggi, lebarModul, tampilkanTeks });
}

/** Barcode Code39 (fallback printer/scanner lama). */
export function barcodeCode39SVG(teks, { tinggi = 48, lebarModul = 1.6, maks = 32, tampilkanTeks = true } = {}) {
  return renderSvg(bitCode39(teks, maks), { tinggi, lebarModul, tampilkanTeks });
}
