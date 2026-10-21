// web/src/pages/dataDasar/jadwalUtil.js
// Logika murni Jadwal Mengajar: validasi, deteksi bentrok, normalisasi data, dan
// operasi tambah/ubah/hapus. Tidak menyentuh DOM maupun layanan penyimpanan,
// sehingga dapat diuji langsung di Node dan dipakai ulang di UI.

export const MAKS_ENTRI = 100;
export const MAKS_KELAS = 30;
export const MAKS_MAPEL = 80;
export const HARI_MIN = 1; // Senin
export const HARI_MAKS = 6; // Sabtu
export const POLA_JAM = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Galat domain jadwal. `kode`: TIDAK_VALID | BENTROK | PENUH | TIDAK_ADA | ID_GANDA | OPERASI_TIDAK_DIKENAL */
export class GalatJadwal extends Error {
  constructor(kode, pesan, rincian = null) {
    super(pesan);
    this.name = 'GalatJadwal';
    this.kode = kode;
    this.rincian = rincian;
  }
}

const dua = (n) => String(n).padStart(2, '0');

export const jamValid = (jam) => typeof jam === 'string' && POLA_JAM.test(jam);
export const hariValid = (hari) => Number.isInteger(hari) && hari >= HARI_MIN && hari <= HARI_MAKS;

/** "07:40" -> 460. Mengembalikan NaN bila format jam tidak valid. */
export function menit(jam) {
  if (!jamValid(jam)) return NaN;
  const [h, m] = jam.split(':').map(Number);
  return h * 60 + m;
}

/** 460 -> "07:40" */
export function formatJam(total) {
  return `${dua(Math.floor(total / 60))}:${dua(total % 60)}`;
}

/** 90 -> "1 jam 30 menit" */
export function formatDurasi(total) {
  const t = Math.max(0, Math.round(total) || 0);
  const j = Math.floor(t / 60);
  const m = t % 60;
  return [j ? `${j} jam` : '', m ? `${m} menit` : ''].filter(Boolean).join(' ') || '0 menit';
}

/** Pembersih teks bawaan (dipakai bila pemanggil tidak menyuntikkan `bersih` dari umum.js). */
export function bersihBawaan(nilai, maks) {
  return String(nilai ?? '').replace(/\s+/g, ' ').trim().slice(0, maks);
}

const teks = (v) => (typeof v === 'string' ? v : '');

/**
 * Menyaring data jadwal mentah. Hanya entri yang rusak secara struktur
 * yang dibuang (id kosong/ganda, hari/jam tidak valid, kelas/mapel kosong).
 * Entri yang saling bentrok TIDAK dibuang, dan jumlahnya tidak dipotong.
 * @returns {{ entri: object[], dibuang: number }}
 */
export function normalisasiEntri(mentah, bersih = bersihBawaan) {
  if (!Array.isArray(mentah)) return { entri: [], dibuang: 0 };
  const hasil = [];
  const idTerpakai = new Set();
  let dibuang = 0;

  for (const e of mentah) {
    if (!e || typeof e !== 'object') { dibuang++; continue; }
    const id = typeof e.id === 'string' || typeof e.id === 'number' ? String(e.id).trim() : '';
    const hari = typeof e.hari === 'number' || typeof e.hari === 'string' ? Number(e.hari) : NaN;
    const kelas = bersih(teks(e.kelas), MAKS_KELAS);
    const mapel = bersih(teks(e.mapel), MAKS_MAPEL);

    const rusak = !id || idTerpakai.has(id) || !hariValid(hari)
      || !jamValid(e.mulai) || !jamValid(e.selesai)
      || menit(e.selesai) <= menit(e.mulai) || !kelas || !mapel;
    if (rusak) { dibuang++; continue; }

    idTerpakai.add(id);
    hasil.push({ id, hari, mulai: e.mulai, selesai: e.selesai, kelas, mapel });
  }
  return { entri: hasil, dibuang };
}

/** Hanya mengambil field yang dikenal agar tidak ada properti liar yang tersimpan. */
export const pilihSesi = (s) => ({
  id: s.id, hari: s.hari, mulai: s.mulai, selesai: s.selesai, kelas: s.kelas, mapel: s.mapel,
});

/**
 * Memeriksa satu sesi. Mengembalikan null bila valid, atau { field, pesan }.
 * `field`: 'hari' | 'mulai' | 'selesai' | 'kelas' | 'mapel'
 */
export function validasiSesi(s) {
  if (!s || typeof s !== 'object') return { field: 'hari', pesan: 'Data sesi tidak lengkap.' };
  if (!hariValid(s.hari)) return { field: 'hari', pesan: 'Pilih hari Senin sampai Sabtu.' };
  if (!jamValid(s.mulai)) return { field: 'mulai', pesan: 'Isi jam mulai dengan format 24 jam, misalnya 07:00.' };
  if (!jamValid(s.selesai)) return { field: 'selesai', pesan: 'Isi jam selesai dengan format 24 jam, misalnya 07:40.' };
  if (menit(s.selesai) <= menit(s.mulai)) return { field: 'selesai', pesan: 'Jam selesai harus setelah jam mulai.' };
  if (!teks(s.kelas).trim()) return { field: 'kelas', pesan: 'Isi kelas atau rombel.' };
  if (!teks(s.mapel).trim()) return { field: 'mapel', pesan: 'Isi mata pelajaran.' };
  return null;
}

/**
 * Mencari sesi lain di hari yang sama yang waktunya beririsan.
 * Sesi yang hanya bersambung (selesai 07:40 dan mulai 07:40) tidak dianggap bentrok.
 */
export function cariBentrok(entri, { hari, mulai, selesai }, abaikanId = null) {
  const a = menit(mulai);
  const b = menit(selesai);
  if (!hariValid(hari) || Number.isNaN(a) || Number.isNaN(b) || b <= a) return null;
  return entri.find((x) => x.id !== abaikanId && x.hari === hari
    && a < menit(x.selesai) && menit(x.mulai) < b) ?? null;
}

export const pesanBentrok = (b) => `Bentrok dengan ${b.mapel} ${b.kelas} (${b.mulai}–${b.selesai}).`;

/**
 * Menerapkan satu operasi ke daftar entri dan mengembalikan daftar baru
 * (tidak mengubah argumen). Melempar GalatJadwal bila operasi ditolak.
 * op: { jenis: 'tambah' | 'ubah', sesi } atau { jenis: 'hapus', id }
 */
export function terapkanOperasi(entri, op) {
  switch (op?.jenis) {
    case 'tambah':
    case 'ubah': {
      const sesi = pilihSesi(op.sesi ?? {});
      const salah = validasiSesi(sesi);
      if (salah) throw new GalatJadwal('TIDAK_VALID', salah.pesan, salah);
      if (!sesi.id) throw new GalatJadwal('TIDAK_VALID', 'ID sesi tidak ada.', { field: 'hari', pesan: 'ID sesi tidak ada.' });

      if (op.jenis === 'tambah') {
        if (entri.some((x) => x.id === sesi.id)) throw new GalatJadwal('ID_GANDA', 'Sesi dengan ID tersebut sudah ada.');
        if (entri.length >= MAKS_ENTRI) throw new GalatJadwal('PENUH', `Maksimal ${MAKS_ENTRI} sesi jadwal.`);
      } else if (!entri.some((x) => x.id === sesi.id)) {
        throw new GalatJadwal('TIDAK_ADA', 'Sesi tidak ditemukan. Mungkin sudah dihapus dari perangkat lain.');
      }

      const bentrok = cariBentrok(entri, sesi, sesi.id);
      if (bentrok) throw new GalatJadwal('BENTROK', pesanBentrok(bentrok), bentrok);

      return op.jenis === 'tambah' ? [...entri, sesi] : entri.map((x) => (x.id === sesi.id ? sesi : x));
    }
    case 'hapus':
      // Idempoten: bila sesi sudah terhapus di tempat lain, hasilnya tetap konsisten.
      return entri.filter((x) => x.id !== op.id);
    default:
      throw new GalatJadwal('OPERASI_TIDAK_DIKENAL', 'Operasi jadwal tidak dikenal.');
  }
}

/** Mengelompokkan per hari (Map 1..6) dan mengurutkan menurut jam mulai, lalu jam selesai. */
export function kelompokPerHari(entri) {
  const peta = new Map();
  for (let h = HARI_MIN; h <= HARI_MAKS; h++) peta.set(h, []);
  for (const e of entri) peta.get(e.hari)?.push(e);
  for (const daftar of peta.values()) {
    daftar.sort((a, b) => menit(a.mulai) - menit(b.mulai) || menit(a.selesai) - menit(b.selesai));
  }
  return peta;
}

/** Total menit mengajar per pekan. */
export function totalMenit(entri) {
  return entri.reduce((jumlah, e) => jumlah + (menit(e.selesai) - menit(e.mulai)), 0);
}

export function sesiUntukHari(entri, hari) {
  if (!Array.isArray(entri) || !hariValid(hari)) return [];
  return entri
    .filter((sesi) => sesi?.hari === hari)
    .slice()
    .sort((a, b) => menit(a.mulai) - menit(b.mulai));
}

/**
 * Himpunan id sesi yang beririsan dengan sesi lain di hari yang sama.
 * `sesiTerurut` harus sudah diurutkan menurut jam mulai (hasil kelompokPerHari).
 */
export function idBentrokDalamHari(sesiTerurut) {
  const ids = new Set();
  let akhirMaks = -1;
  let idAkhirMaks = null;
  for (const s of sesiTerurut) {
    const mulai = menit(s.mulai);
    const selesai = menit(s.selesai);
    if (mulai < akhirMaks) { ids.add(s.id); ids.add(idAkhirMaks); }
    if (selesai > akhirMaks) { akhirMaks = selesai; idAkhirMaks = s.id; }
  }
  return ids;
}

/**
 * Usulan jam untuk sesi berikutnya: mulai = selesai sesi ini, durasi sama.
 * Mengembalikan null bila hasilnya melewati 23:59.
 */
export function sarankanJamBerikutnya(mulai, selesai) {
  const a = menit(mulai);
  const b = menit(selesai);
  if (Number.isNaN(a) || Number.isNaN(b) || b <= a) return null;
  const akhir = Math.min(b + (b - a), 23 * 60 + 59);
  if (akhir <= b) return null;
  return { mulai: selesai, selesai: formatJam(akhir) };
}
