// web/src/lib/kodeSiswa.js
/**
 * Kode unik siswa untuk barcode absensi.
 * ---------------------------------------------------------------------------
 * Urutan sumber kode (sama dengan versi sebelumnya, jadi kartu lama tetap valid):
 *   1. `kodeUnik` yang sudah tersimpan di dokumen siswa (otoritatif, tak berubah)
 *   2. pembuat kode aplikasi (mis. UMUM.buatKodeSiswa), bila ada
 *   3. token acak kriptografis ALE-<UUID> untuk kartu baru/legacy tanpa kode
 */

const KODE_LAMA = /^ALE-[A-Z0-9]{1,6}-[A-Z0-9]{6}-[0-9]{4}$/;
const KODE_ACAK = /^ALE-[0-9A-F]{32}$/;

export function buatKodeAcak() {
  const id = globalThis.crypto?.randomUUID?.();
  if (!id) throw new Error('Peramban tidak mendukung pembuatan token absensi yang aman.');
  return `ALE-${id.replaceAll('-', '').toUpperCase()}`;
}

export const kelasDari = (s) => String(s?.kelas ?? '').trim();

/** Kode baru berupa token acak; tidak diturunkan dari identitas atau kelas. */
export const kodeCadangan = () => buatKodeAcak();

export const kodeTersimpan = (s) => String(s?.kodeUnik ?? '').trim();

/** Format yang boleh disimpan ke tabel siswa Supabase. */
export const kodeLayakSimpan = (k) => {
  const kode = String(k ?? '').toUpperCase();
  return KODE_ACAK.test(kode) || KODE_LAMA.test(kode);
};

/**
 * @param {object} s siswa
 * @param {((s:object)=>string)|null} [pembuat] pembuat kode milik aplikasi
 */
export function kodeUntuk(s, pembuat = null) {
  const simpan = kodeTersimpan(s);
  if (simpan) return simpan;
  if (typeof pembuat === 'function') {
    try {
      const k = String(pembuat(s) ?? '').trim();
      if (k) return k;
    } catch { /* pakai cadangan */ }
  }
  return kodeCadangan(s);
}

/** URL tujuan saat barcode/QR dipindai. */
export function urlScan(kode, pembuat = null) {
  if (typeof pembuat === 'function') {
    try {
      const u = String(pembuat(kode) ?? '');
      if (u) return u;
    } catch { /* pakai cadangan */ }
  }
  return `${location.origin}${location.pathname}#/scan/${encodeURIComponent(kode)}`;
}

/** Himpunan kode yang dipakai lebih dari satu siswa (membuat absensi salah sasaran). */
export function cariKodeGanda(daftarKode) {
  const lihat = new Set();
  const ganda = new Set();
  daftarKode.forEach((k) => { (lihat.has(k) ? ganda : lihat).add(k); });
  return ganda;
}

/**
 * Rencana penyimpanan kode untuk siswa `target` yang belum punya `kodeUnik`.
 * Kode dijamin unik terhadap seluruh `semua` (kode tersimpan maupun rencana lain).
 * @returns {{rencana:{id:string,kode:string,nama:string}[], tanpaId:object[]}}
 */
export function rencanaKodeBaru(semua, target, pembuat = null) {
  const dipakai = new Set(semua.map(kodeTersimpan).filter(Boolean));
  const rencana = [];
  const tanpaId = [];

  target.filter((s) => !kodeTersimpan(s)).forEach((s) => {
    if (s.id == null || s.id === '') { tanpaId.push(s); return; }

    let dasar = kodeUntuk(s, pembuat);
    if (!kodeLayakSimpan(dasar)) dasar = kodeCadangan(s);

    let kode = dasar;
    while (dipakai.has(kode)) kode = kodeCadangan(s);
    dipakai.add(kode);
    rencana.push({ id: String(s.id), kode, nama: String(s.nama ?? '') });
  });

  return { rencana, tanpaId };
}
