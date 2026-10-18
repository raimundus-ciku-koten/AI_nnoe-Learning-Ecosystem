// web/src/lib/kodeSiswa.js
/**
 * Kode unik siswa untuk barcode absensi.
 * ---------------------------------------------------------------------------
 * Urutan sumber kode (sama dengan versi sebelumnya, jadi kartu lama tetap valid):
 *   1. `kodeUnik` yang sudah tersimpan di dokumen siswa  (otoritatif, tak berubah)
 *   2. pembuat kode aplikasi (mis. UMUM.buatKodeSiswa), bila ada
 *   3. cadangan deterministik FNV-1a  →  ALE-<KELAS>-<HASH6>-<IDENT4>
 */

/** Hash FNV-1a 32-bit → base36 huruf besar, 6 karakter. */
function fnv(teks) {
  let h = 0x811c9dc5;
  for (let i = 0; i < teks.length; i++) {
    h ^= teks.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return (h >>> 0).toString(36).toUpperCase().padStart(6, '0').slice(0, 6);
}

export const kelasDari = (s) => String(s?.kelas ?? '').trim();

/** Kode deterministik — hanya dipakai bila aplikasi tak punya pembuat kode sendiri. */
export function kodeCadangan(s) {
  const kelas = kelasDari(s).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 6) || 'KLS';
  const hash = fnv(`${s?.nama ?? ''}|${s?.nisn ?? ''}|${s?.kelas ?? ''}`);
  const ident = String(s?.nisn ?? '').replace(/\D/g, '').slice(-4) || fnv(String(s?.nama ?? '')).slice(0, 4);
  return `ALE-${kelas}-${hash}-${ident}`;
}

export const kodeTersimpan = (s) => String(s?.kodeUnik ?? '').trim();

/** Format yang boleh disimpan ke tabel siswa Supabase. */
export const kodeLayakSimpan = (k) => /^[A-Za-z0-9._-]{4,64}$/.test(String(k ?? ''));

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
    for (let n = 2; dipakai.has(kode); n++) kode = `${dasar}-${n.toString(36).toUpperCase()}`;
    dipakai.add(kode);
    rencana.push({ id: String(s.id), kode, nama: String(s.nama ?? '') });
  });

  return { rencana, tanpaId };
}
