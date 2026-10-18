// web/src/firebase/siswaKodeRepo.js
/**
 * Menyimpan `kodeUnik` ke dokumen siswa (satu-satunya penulisan dari tab Barcode).
 * ---------------------------------------------------------------------------
 *  - writeBatch bertahap (≤ 400 operasi/batch; batas Firestore 500).
 *  - Hanya `update` → tidak pernah membuat dokumen siswa "hantu".
 *  - Aturan keamanan (firestore.rules) membuat kode set-sekali: setelah terisi,
 *    kode tidak dapat diubah sehingga kartu yang sudah dicetak tetap berlaku.
 *  - Kegagalan di tengah jalan melaporkan berapa yang sudah tersimpan.
 */
import { getFirestore, writeBatch, doc, serverTimestamp } from 'firebase/firestore';

export const KOLEKSI_SISWA = 'siswa';
const UKURAN_BATCH = 400;

/**
 * @param {{id:string, kode:string}[]} rencana
 * @param {{db?:import('firebase/firestore').Firestore, ukuranBatch?:number,
 *          onProgress?:(selesai:number,total:number)=>void}} [opsi]
 *        db tidak diisi → getFirestore() (app default, mis. dari firebase/app.js).
 * @returns {Promise<{tersimpan:number, galat:Error|null}>}
 */
export async function simpanKodeSiswa(rencana, { db, ukuranBatch = UKURAN_BATCH, onProgress } = {}) {
  const firestore = db ?? getFirestore();
  const valid = rencana.filter((r) => r && r.id && /^[A-Za-z0-9._-]{4,64}$/.test(r.kode));
  const ukuran = Math.min(Math.max(1, ukuranBatch), 500);

  let tersimpan = 0;
  for (let i = 0; i < valid.length; i += ukuran) {
    const potongan = valid.slice(i, i + ukuran);
    const batch = writeBatch(firestore);
    potongan.forEach((r) => {
      batch.update(doc(firestore, KOLEKSI_SISWA, String(r.id)), {
        kodeUnik: r.kode,
        kodeDibuatPada: serverTimestamp(),
      });
    });
    try {
      await batch.commit();
    } catch (err) {
      return { tersimpan, galat: err };
    }
    tersimpan += potongan.length;
    onProgress?.(tersimpan, valid.length);
  }
  return { tersimpan, galat: null };
}
