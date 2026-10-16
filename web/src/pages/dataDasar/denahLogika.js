// web/src/pages/dataDasar/denahLogika.js
// Logika murni (tanpa DOM, tanpa Firebase) untuk denah duduk & pembagian kelompok.
// Dipisahkan dari tabDenah.js agar bisa diuji otomatis: `node --test` (lihat denahLogika.test.mjs).

export const MAKS_UKURAN = 10;
export const MIN_KELOMPOK = 2;
export const MAKS_KELOMPOK = 10;
export const DEFAULT_DENAH = Object.freeze({ baris: 5, kolom: 6, jumlahKelompok: 4 });

/** Kunci kursi berbasis nol: baris 0, kolom 2 -> "0-2". */
export const kunciKursi = (r, c) => `${r}-${c}`;

const POLA_KUNCI = /^(\d{1,2})-(\d{1,2})$/;

/** Membaca kunci kursi. Mengembalikan { r, c } atau null bila formatnya tidak valid. */
export function bacaKunciKursi(k) {
  const m = typeof k === 'string' ? POLA_KUNCI.exec(k) : null;
  return m ? { r: Number(m[1]), c: Number(m[2]) } : null;
}

/** Membulatkan ke bilangan bulat lalu menjepit ke [min, max]; `def` jika bukan angka. */
export function batas(nilai, min, max, def) {
  const v = Number.parseInt(nilai, 10);
  return Number.isFinite(v) ? Math.min(max, Math.max(min, v)) : def;
}

/** Fisher–Yates. Tidak mengubah array asal. `rng` dapat diganti agar hasil bisa diuji. */
export function acak(arr, rng = Math.random) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

/** Seluruh kunci kursi berurutan baris demi baris. */
export function semuaKunci(baris, kolom) {
  const hasil = [];
  for (let r = 0; r < baris; r += 1) {
    for (let c = 0; c < kolom; c += 1) hasil.push(kunciKursi(r, c));
  }
  return hasil;
}

/**
 * Membersihkan dokumen denah dari Firestore terhadap daftar siswa yang masih ada.
 * Membuang: kursi di luar grid, siswa yang sudah dihapus, siswa ganda, kunci aneh,
 * dan nomor kelompok di luar rentang. Aman terhadap data kosong / rusak.
 */
export function bersihkanDenah(data, idValid) {
  const d = data && typeof data === 'object' ? data : {};
  const ada = idValid instanceof Set ? idValid : new Set(idValid);
  const baris = batas(d.baris, 1, MAKS_UKURAN, DEFAULT_DENAH.baris);
  const kolom = batas(d.kolom, 1, MAKS_UKURAN, DEFAULT_DENAH.kolom);
  const jumlahKelompok = batas(d.jumlahKelompok, MIN_KELOMPOK, MAKS_KELOMPOK, DEFAULT_DENAH.jumlahKelompok);

  const kursi = {};
  const sudah = new Set();
  const sumberKursi = d.kursi && typeof d.kursi === 'object' ? d.kursi : {};
  // Diurutkan agar hasil deterministik bila satu siswa tercatat di dua kursi.
  Object.keys(sumberKursi).sort().forEach((k) => {
    const pos = bacaKunciKursi(k);
    const id = sumberKursi[k];
    if (pos && pos.r < baris && pos.c < kolom && ada.has(id) && !sudah.has(id)) {
      kursi[k] = id;
      sudah.add(id);
    }
  });

  const kelompok = {};
  const sumberKelompok = d.kelompok && typeof d.kelompok === 'object' ? d.kelompok : {};
  Object.keys(sumberKelompok).forEach((id) => {
    const n = sumberKelompok[id];
    if (ada.has(id) && Number.isInteger(n) && n >= 1 && n <= jumlahKelompok) kelompok[id] = n;
  });

  return { baris, kolom, kursi, kelompok, jumlahKelompok };
}

/** Mengubah ukuran grid. `terlepas` berisi id siswa yang kursinya hilang karena grid dikecilkan. */
export function ubahUkuran(kursi, baris, kolom) {
  const baru = {};
  const terlepas = [];
  Object.entries(kursi).forEach(([k, id]) => {
    const pos = bacaKunciKursi(k);
    if (pos && pos.r < baris && pos.c < kolom) baru[k] = id;
    else terlepas.push(id);
  });
  return { kursi: baru, terlepas };
}

/** Mengacak siswa ke kursi (mengisi dari baris depan). `tidakMuat` = siswa yang tidak kebagian kursi. */
export function acakKursi(idSiswa, baris, kolom, rng = Math.random) {
  const slot = semuaKunci(baris, kolom);
  const urut = acak(idSiswa, rng);
  const kursi = {};
  urut.slice(0, slot.length).forEach((id, i) => { kursi[slot[i]] = id; });
  return { kursi, tidakMuat: urut.slice(slot.length) };
}

/**
 * Membagi siswa ke `jumlah` kelompok secara acak dan merata (selisih ukuran kelompok paling banyak 1).
 * Mengembalikan peta { idSiswa: nomorKelompok (mulai 1) }.
 */
export function bagiKelompok(idSiswa, jumlah, rng = Math.random) {
  const n = batas(jumlah, MIN_KELOMPOK, MAKS_KELOMPOK, MIN_KELOMPOK);
  const peta = {};
  acak(idSiswa, rng).forEach((id, i) => { peta[id] = (i % n) + 1; });
  return peta;
}

/**
 * Memindahkan siswa `id` ke kursi `ke`.
 *  - Jika `id` sedang duduk di kursi lain dan `ke` terisi -> keduanya bertukar tempat.
 *  - Jika `id` belum duduk dan `ke` terisi -> penghuni lama dikeluarkan (kembali ke "belum duduk").
 * Tidak mengubah objek asal.
 */
export function pindahkan(kursi, id, ke) {
  const baru = { ...kursi };
  const asal = Object.keys(baru).find((k) => baru[k] === id) ?? null;
  if (asal === ke) return baru;
  const penghuni = baru[ke] ?? null;
  if (asal !== null) delete baru[asal];
  baru[ke] = id;
  if (penghuni !== null && asal !== null) baru[asal] = penghuni;
  return baru;
}

const AWAL_RUMUS = /^[=+\-@\t\r]/;

/**
 * Menyiapkan satu sel CSV: menetralkan "CSV/formula injection" (nilai berawalan = + - @ dianggap rumus
 * oleh Excel/Sheets) dan memberi tanda kutip bila perlu.
 */
export function netralkanSel(nilai) {
  if (typeof nilai === 'number') return String(nilai);
  const s = nilai === null || nilai === undefined ? '' : String(nilai);
  const aman = AWAL_RUMUS.test(s) ? `'${s}` : s;
  return /[",\r\n]/.test(aman) ? `"${aman.replace(/"/g, '""')}"` : aman;
}

/** Menyusun teks CSV (pemisah koma, akhir baris CRLF). */
export function buatCsv(kepala, baris) {
  return `${[kepala, ...baris].map((r) => r.map(netralkanSel).join(',')).join('\r\n')}\r\n`;
}

/** Nama berkas aman dari nama kelas, mis. "X IPA 1" -> "X-IPA-1". */
export function namaBerkas(kelas) {
  const dasar = String(kelas ?? '')
    .normalize('NFKD')
    .replace(/[^\w-]+/g, '-')
    .replace(/^-+|-+$/g, '');
  return dasar || 'kelas';
}
