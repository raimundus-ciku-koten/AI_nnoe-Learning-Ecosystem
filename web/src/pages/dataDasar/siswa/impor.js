// web/src/pages/dataDasar/siswa/impor.js
/**
 * Penguraian data impor siswa — MURNI (tanpa DOM, tanpa Firebase).
 * Dipisah dari tab agar bisa diuji unit dengan `node --test`.
 *
 * Perbaikan dibanding versi di dalam tabSiswa.js:
 *   - Parser RFC 4180: sel ber-kutip yang berisi pemisah/baris baru terbaca benar
 *     (mis. "Fauzi, Ahmad" atau sel Excel dengan Alt+Enter).
 *   - Pemisah dideteksi dari jumlah kemunculan terbanyak di luar kutip,
 *     bukan sekadar "ada tab → tab".
 *   - Kepala kolom dikenali dengan urutan bebas (No, Nama, NISN, L/P, …).
 *   - NISN "1234567890.0" (hasil ekspor Excel) tidak lagi menjadi 11 digit;
 *     "1.234.567.890" (pemisah ribuan) ditandai "Periksa".
 *   - "Pria" dibaca L (sebelumnya salah terbaca P karena diawali huruf "p").
 */

/** Huruf kecil tanpa aksen & spasi ganda — untuk pencarian & deteksi duplikat. */
export const normal = (s) => String(s ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/\s+/g, ' ')
  .trim();

/** Pembersih bawaan (dipakai bila pemanggil tidak menyuntikkan `bersih` miliknya). */
export const rapikan = (s, maks = 100) => String(s ?? '')
  // eslint-disable-next-line no-control-regex
  .replace(/[\u0000-\u001f\u007f]/g, ' ')
  .replace(/\s+/g, ' ')
  .trim()
  .slice(0, maks);

/** '' | 'L' | 'P' dari berbagai penulisan (L, Lk, Laki-laki, Pria, P, Pr, Perempuan, Wanita, …). */
export function normJK(nilai) {
  const s = normal(nilai);
  if (!s) return '';
  if (/^(?:[lm]|lk)(?![a-z])/.test(s) || /^(?:laki|lelaki|pria|male|cowok)/.test(s)) return 'L';
  if (/^(?:[pwf]|pr)(?![a-z])/.test(s) || /^(?:perempuan|wanita|female|cewek|putri)/.test(s)) return 'P';
  return '';
}

/* ---------------------------------------------------------------------
 * Pemisah & tabel
 * ------------------------------------------------------------------- */

/** Pilih tab / titik koma / koma menurut jumlah terbanyak (di luar tanda kutip). */
export function tentukanPemisah(teks) {
  const jumlah = { '\t': 0, ';': 0, ',': 0 };
  const sampel = String(teks ?? '')
    .replace(/^\uFEFF/, '')
    .split(/\r?\n/)
    .filter((b) => b.trim())
    .slice(0, 10);

  for (const baris of sampel) {
    let kutip = false;
    for (const c of baris) {
      if (c === '"') kutip = !kutip;
      else if (!kutip && c in jumlah) jumlah[c] += 1;
    }
  }
  // Seri → tab (hasil salin dari Excel).
  return ['\t', ';', ','].reduce((baik, k) => (jumlah[k] > jumlah[baik] ? k : baik), '\t');
}

/**
 * Urai teks terpisah menjadi larik baris-sel (RFC 4180).
 * @returns {{ baris: string[][], kutipTerbuka: boolean }}
 *   `kutipTerbuka` true bila ada tanda kutip pembuka tanpa penutup.
 */
export function uraiTabel(teks, pemisah, { kutip: pakaiKutip = true } = {}) {
  const s = String(teks ?? '').replace(/^\uFEFF/, '');
  const hasil = [];
  let baris = [];
  let sel = '';
  let dalamKutip = false;

  for (let i = 0; i < s.length; i += 1) {
    const c = s[i];
    if (dalamKutip) {
      if (c === '"') {
        if (s[i + 1] === '"') { sel += '"'; i += 1; } else dalamKutip = false;
      } else {
        sel += c;
      }
    } else if (pakaiKutip && c === '"' && sel.trim() === '') {
      sel = '';
      dalamKutip = true;
    } else if (c === pemisah) {
      baris.push(sel);
      sel = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && s[i + 1] === '\n') i += 1;
      baris.push(sel);
      hasil.push(baris);
      baris = [];
      sel = '';
    } else {
      sel += c;
    }
  }
  baris.push(sel);
  hasil.push(baris);

  return {
    baris: hasil
      .map((b) => b.map((x) => x.trim()))
      .filter((b) => b.some((x) => x !== '')),
    kutipTerbuka: dalamKutip,
  };
}

/* ---------------------------------------------------------------------
 * NISN
 * ------------------------------------------------------------------- */

/**
 * Normalkan satu sel NISN.
 * @returns {{ nisn?: string, galat?: string, periksa?: string }}
 */
export function bacaNisn(mentah) {
  let t = String(mentah ?? '').trim().replace(/^'/, '').replace(/\s+/g, '');
  if (!t) return { nisn: '' };

  // Excel mengubah angka panjang menjadi 1,23457E+09 — digit sudah hilang.
  if (/^\d+(?:[.,]\d+)?e[+-]?\d+$/i.test(t)) {
    return { galat: 'NISN rusak oleh Excel (notasi ilmiah). Format kolom NISN sebagai Teks lalu salin ulang.' };
  }

  let periksa;
  const desimal = t.match(/^(\d+)[.,]0+$/);          // 1234567890.0
  const ribuan = /^\d{1,3}(?:\.\d{3})+$/.test(t);    // 1.234.567.890
  if (desimal) {
    t = desimal[1];
  } else if (ribuan) {
    t = t.replace(/\./g, '');
    periksa = 'Pemisah ribuan pada NISN dihapus.';
  }

  if (!/^\d+$/.test(t)) return { galat: 'NISN harus berupa angka saja.' };
  if (t.length > 20) return { galat: 'NISN lebih dari 20 digit.' };
  return periksa ? { nisn: t, periksa } : { nisn: t };
}

/* ---------------------------------------------------------------------
 * Impor
 * ------------------------------------------------------------------- */

const ALIAS_JK = new Set(['l/p', 'l p', 'lp', 'jk', 'j/k', 'jenis kelamin', 'kelamin', 'gender', 'sex']);

/**
 * Urai teks tempelan menjadi baris dengan status:
 *   'ok'      → siap diimpor
 *   'periksa' → tetap diimpor, tetapi sebaiknya diperiksa
 *   'lewati'  → tidak diimpor (alasan di `catatan`)
 *
 * Tanpa kepala kolom, urutan yang dipakai: Nama, NISN, L/P.
 *
 * @param {string} teks
 * @param {{
 *   kelas: string,
 *   nisnAda?: Map<string, {nama: string, kelas?: string}>,
 *   namaDiKelas?: Set<string>,
 *   bersih?: (s: string, maks: number) => string,
 * }} konteks
 */
export function uraiImpor(teks, {
  kelas,
  nisnAda = new Map(),
  namaDiKelas = new Set(),
  bersih = rapikan,
} = {}) {
  const sumber = String(teks ?? '').replace(/^\uFEFF/, '');
  const pemisah = tentukanPemisah(sumber);

  let { baris, kutipTerbuka } = uraiTabel(sumber, pemisah);
  if (kutipTerbuka) {
    // Tanda kutip liar: jangan biarkan ia menelan seluruh data.
    ({ baris } = uraiTabel(sumber, pemisah, { kutip: false }));
    baris = baris.map((b) => b.map((x) => x.replace(/^"(.*)"$/, '$1').trim()));
  }

  let kolom = { nama: 0, nisn: 1, jk: 2 };
  if (baris.length) {
    const kepala = baris[0].map(normal);
    const iNama = kepala.findIndex((h) => /^nama(?: |$)/.test(h));
    if (iNama >= 0) {
      kolom = {
        nama: iNama,
        nisn: kepala.findIndex((h) => h === 'nisn'),
        jk: kepala.findIndex((h) => ALIAS_JK.has(h)),
      };
      baris = baris.slice(1);
    }
  }

  const ambil = (b, i) => (i >= 0 ? (b[i] ?? '') : '');
  const nisnBaru = new Set();
  const namaBaru = new Set();

  return baris.map((b, i) => {
    const namaMentah = ambil(b, kolom.nama);
    const nisnMentah = ambil(b, kolom.nisn);
    const jkMentah = ambil(b, kolom.jk);

    const nama = bersih(namaMentah, 100);
    const jk = normJK(jkMentah);
    const catatan = [];
    let status = 'ok';

    const lewati = (alasan) => { status = 'lewati'; catatan.push(alasan); };
    const periksa = (alasan) => { if (status === 'ok') status = 'periksa'; catatan.push(alasan); };

    if (!nama) lewati('Nama kosong.');
    else if (String(namaMentah).replace(/\s+/g, ' ').trim().length > 100) {
      periksa('Nama dipotong menjadi 100 karakter.');
    }

    const hasilNisn = bacaNisn(nisnMentah);
    const nisn = hasilNisn.nisn ?? '';
    if (hasilNisn.galat) {
      lewati(hasilNisn.galat);
    } else if (nisn) {
      const sudah = nisnAda.get(nisn);
      if (sudah) lewati(`NISN sudah terdaftar atas nama ${sudah.nama} (${sudah.kelas || '-'}).`);
      else if (nisnBaru.has(nisn)) lewati('NISN ganda di data yang ditempel.');
      else {
        if (hasilNisn.periksa) periksa(hasilNisn.periksa);
        if (nisn.length !== 10) periksa(`NISN ${nisn.length} digit — biasanya 10 (nol di depan hilang?).`);
      }
    }

    if (jkMentah && !jk) periksa('L/P tidak dikenali, dikosongkan.');

    const kunciNama = normal(nama);
    if (nama && status !== 'lewati') {
      if (namaDiKelas.has(kunciNama)) periksa(`Nama sama sudah ada di kelas ${kelas}.`);
      else if (namaBaru.has(kunciNama)) periksa('Nama sama muncul dua kali di data yang ditempel.');
    }

    if (status !== 'lewati') {
      if (nisn) nisnBaru.add(nisn);
      if (kunciNama) namaBaru.add(kunciNama);
    }

    return { no: i + 1, nama, nisn, jk, status, catatan: catatan.join(' ') };
  });
}

/** Ringkasan jumlah baris per status. */
export function hitungStatus(baris) {
  const hasil = { siap: 0, periksa: 0, lewati: 0 };
  for (const b of baris) {
    if (b.status === 'lewati') hasil.lewati += 1;
    else { hasil.siap += 1; if (b.status === 'periksa') hasil.periksa += 1; }
  }
  return hasil;
}
