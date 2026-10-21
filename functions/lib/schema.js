'use strict';
/**
 * Validator skema mini (tanpa dependensi) untuk keluaran AI.
 * Keluaran model TIDAK dipercaya: setiap bidang dicek tipenya, teks dipotong ke batas,
 * karakter kontrol dibuang, bidang tak dikenal dibuang. Gagal → ParseError → coba penyedia berikutnya.
 */

class ParseError extends Error {
  constructor(jalur, pesan) { super(`${jalur}: ${pesan}`); this.name = 'ParseError'; this.jalur = jalur; }
}

// eslint-disable-next-line no-control-regex
const KONTROL = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g;
const bersih = (s, maks) => String(s).replace(KONTROL, ' ').replace(/[ \t]+/g, ' ').trim().slice(0, maks);

const str = (maks, { opsional = false } = {}) => (v, jalur) => {
  if (v === undefined || v === null || v === '') { if (opsional) return ''; throw new ParseError(jalur, 'wajib berupa teks'); }
  if (typeof v !== 'string') throw new ParseError(jalur, 'harus teks');
  const out = bersih(v, maks);
  if (!out && !opsional) throw new ParseError(jalur, 'tidak boleh kosong');
  return out;
};

const int = (min, max) => (v, jalur) => {
  const n = typeof v === 'string' && /^\d+$/.test(v.trim()) ? Number(v) : v;
  if (!Number.isInteger(n) || n < min || n > max) throw new ParseError(jalur, `harus bilangan bulat ${min}-${max}`);
  return n;
};

const pilih = (...nilai) => (v, jalur) => {
  const n = typeof v === 'string' && /^\d+$/.test(v) ? Number(v) : v;
  if (!nilai.includes(n)) throw new ParseError(jalur, `harus salah satu dari ${nilai.join('|')}`);
  return n;
};

const arr = (item, { min = 0, max = 50 } = {}) => (v, jalur) => {
  if (!Array.isArray(v)) throw new ParseError(jalur, 'harus larik');
  if (v.length < min) throw new ParseError(jalur, `minimal ${min} butir`);
  return v.slice(0, max).map((x, i) => item(x, `${jalur}[${i}]`));
};

const obj = (bentuk) => (v, jalur) => {
  if (!v || typeof v !== 'object' || Array.isArray(v)) throw new ParseError(jalur, 'harus objek');
  const out = {};
  for (const [k, fn] of Object.entries(bentuk)) out[k] = fn(v[k], `${jalur}.${k}`);
  return out;
};

/* ------------------------------ Skema per jenis ------------------------------ */

const KODE = /^[A-Za-z0-9][A-Za-z0-9.\-_]{0,19}$/;
const kodeTp = (v, jalur) => {
  const s = str(20)(v, jalur);
  if (!KODE.test(s)) throw new ParseError(jalur, 'format kode TP tidak valid');
  return s;
};

const SKEMA_ATP = obj({
  cp: arr(obj({ elemen: str(120), cp: str(3000) }), { min: 1, max: 12 }),
  unit: arr(obj({
    no: int(1, 30),
    nama: str(120),
    elemen: str(120, { opsional: true }),
    semester: pilih(1, 2),
    tp: arr(obj({ kode: kodeTp, rumusan: str(1200), materi: str(300), jp: int(1, 99) }), { min: 1, max: 20 })
  }), { min: 1, max: 30 })
});

const SKEMA_KKTP = obj({
  ambang: int(1, 100),
  items: arr(obj({
    kode: kodeTp,
    indikator: arr(str(400), { min: 1, max: 8 }),
    rubrik: obj({ perluBimbingan: str(600), cukup: str(600), baik: str(600), sangatBaik: str(600) })
  }), { min: 1, max: 80 })
});

const daftarTeks = (maks = 8, panjang = 600) => arr(str(panjang), { min: 1, max: maks });
const SKEMA_MODUL = obj({
  tujuanKode: arr(kodeTp, { min: 1, max: 20 }),
  model: str(160),
  pemahamanBermakna: daftarTeks(6),
  pertanyaanPemantik: daftarTeks(6),
  dimensiProfil: daftarTeks(8, 160),
  sarpras: daftarTeks(10, 200),
  pertemuan: arr(obj({
    ke: int(1, 20), judul: str(160), tujuan: str(600), menit: int(5, 600),
    pendahuluan: daftarTeks(8), inti: daftarTeks(12), penutup: daftarTeks(8)
  }), { min: 1, max: 12 }),
  asesmen: obj({ diagnostik: str(800), formatif: str(800), sumatif: str(800) }),
  remedial: str(800), pengayaan: str(800),
  refleksiGuru: daftarTeks(6), refleksiSiswa: daftarTeks(6)
});

const SKEMA = Object.freeze({ atp: SKEMA_ATP, kktp: SKEMA_KKTP, modul: SKEMA_MODUL });

/** Normalisasi kode TP (sama dengan normKode di klien): huruf besar, hanya A-Z0-9. */
const nk = (k) => String(k ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

/** Validasi tambahan antar-bidang yang tidak bisa diungkapkan skema datar. */
function periksaSilang(jenis, data, konteks) {
  if (jenis === 'atp') {
    const kode = new Set();
    for (const u of data.unit) for (const t of u.tp) {
      const k = nk(t.kode);
      if (kode.has(k)) throw new ParseError('atp', `kode TP ganda: ${t.kode}`);
      kode.add(k);
    }
    const nomor = data.unit.map((u) => u.no);
    if (new Set(nomor).size !== nomor.length) throw new ParseError('atp.unit', 'nomor unit ganda');
  }
  if (jenis === 'kktp') {
    const valid = new Set(konteks.kodeTp);
    const kode = new Set();
    for (const it of data.items) {
      if (!valid.has(nk(it.kode))) throw new ParseError('kktp', `kode TP asing: ${it.kode}`);
      kode.add(nk(it.kode));
    }
    for (const k of valid) if (!kode.has(k)) throw new ParseError('kktp', `kode TP belum tercakup: ${k}`);
  }
  if (jenis === 'modul') {
    const valid = new Set(konteks.kodeTp);
    for (const k of data.tujuanKode) if (!valid.has(nk(k))) throw new ParseError('modul', `kode TP asing: ${k}`);
  }
}

/**
 * @param {'atp'|'kktp'|'modul'} jenis
 * @param {string} teks keluaran mentah model (JSON)
 * @param {{kodeTp?:string[]}} [konteks]
 */
function urai(jenis, teks, konteks = {}) {
  let json;
  try { json = JSON.parse(String(teks).replace(/^```(?:json)?\s*|\s*```$/g, '')); } catch { throw new ParseError(jenis, 'bukan JSON valid'); }
  const data = SKEMA[jenis](json, jenis);
  periksaSilang(jenis, data, konteks);
  return data;
}

module.exports = { urai, ParseError, SKEMA };
