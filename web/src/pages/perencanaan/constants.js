/**
 * @file Konstanta modul Perencanaan Pembelajaran.
 * Satu-satunya tempat nilai "ajaib" (batas, nama koleksi, urutan dokumen).
 * Nilai batas HARUS selaras dengan firestore.rules dan functions/lib/schema.js.
 */

export const SCHEMA_VERSION = 1;

/** Nama koleksi Firestore lama, dipertahankan untuk rekonsiliasi data migrasi. */
export const KOLEKSI = Object.freeze({
  ROOT: 'perencanaan',
  PAKET: 'paket',
  DOKUMEN: 'dokumen',
  MODUL: 'modul'
});

/** Jenis dokumen perangkat ajar. */
export const JENIS = Object.freeze({
  RPE: 'rpe',
  ATP: 'atp',
  PROTA: 'prota',
  PROSEM: 'prosem',
  KKTP: 'kktp',
  MODUL: 'modul'
});

/** Urutan alur kerja guru (sama dengan alur menu di aplikasi GAS). */
export const URUTAN_DOKUMEN = Object.freeze([
  JENIS.RPE, JENIS.ATP, JENIS.PROTA, JENIS.PROSEM, JENIS.KKTP, JENIS.MODUL
]);

/** Dokumen yang dihitung di peramban (deterministik, tanpa AI). */
export const DOKUMEN_MESIN = Object.freeze([JENIS.RPE, JENIS.PROTA, JENIS.PROSEM]);

/** Dokumen yang membutuhkan provider AI eksternal. */
export const DOKUMEN_AI = Object.freeze([JENIS.ATP, JENIS.KKTP, JENIS.MODUL]);

/** Prasyarat tiap dokumen. */
export const PRASYARAT = Object.freeze({
  [JENIS.RPE]: [],
  [JENIS.ATP]: [JENIS.RPE],
  [JENIS.PROTA]: [JENIS.ATP],
  [JENIS.PROSEM]: [JENIS.PROTA],
  [JENIS.KKTP]: [JENIS.ATP],
  [JENIS.MODUL]: [JENIS.ATP, JENIS.PROTA]
});

/** Batas validasi (selaras dengan Security Rules). */
export const BATAS = Object.freeze({
  TEKS_PENDEK: 120,
  TEKS_SEDANG: 300,
  JP_PER_PEKAN_MIN: 1,
  JP_PER_PEKAN_MAX: 20,
  TOTAL_JP_MIN: 4,
  TOTAL_JP_MAX: 600,
  LIBUR_MAKS: 120,
  RENTANG_LIBUR_MAKS_HARI: 400,
  RENTANG_SEMESTER_MAKS_HARI: 260,
  TP_MAKS: 80,
  UNIT_MAKS: 30,
  PAKET_MAKS_PER_GURU: 40
});

/** Hari sekolah: 1 = Senin ... 6 = Sabtu (Minggu tidak dipakai, seperti GAS). */
export const NAMA_HARI = Object.freeze(['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu']);

export const INDEKS_HARI = Object.freeze({
  senin: 1, selasa: 2, rabu: 3, kamis: 4, jumat: 5, "jum'at": 5, sabtu: 6,
  mon: 1, tue: 2, wed: 3, thu: 4, fri: 5, sat: 6
});

/** Status dokumen pada antarmuka. */
export const STATUS = Object.freeze({
  BELUM: 'belum',
  SIAP: 'siap',
  USANG: 'usang'
});

/** Sumber isi dokumen. */
export const SUMBER = Object.freeze({ MESIN: 'mesin', AI: 'ai', MANUAL: 'manual' });
