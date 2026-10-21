'use strict';
/** Pembatas laju per pengguna dengan jendela tetap (jam & hari) di Firestore (transaksi atomik). */

async function ambilSlot(db, uid, { perJam, perHari }, sekarang = Date.now()) {
  const ref = db.doc(`rateLimits/${uid}`);
  const JAM = 3_600_000; const HARI = 86_400_000;
  return db.runTransaction(async (tx) => {
    const s = await tx.get(ref);
    const d = s.exists ? s.data() : {};
    const jam = d.jamMulai && sekarang - d.jamMulai < JAM ? { mulai: d.jamMulai, n: d.jamN } : { mulai: sekarang, n: 0 };
    const hari = d.hariMulai && sekarang - d.hariMulai < HARI ? { mulai: d.hariMulai, n: d.hariN } : { mulai: sekarang, n: 0 };
    if (jam.n >= perJam || hari.n >= perHari) return false;
    tx.set(ref, { jamMulai: jam.mulai, jamN: jam.n + 1, hariMulai: hari.mulai, hariN: hari.n + 1 });
    return true;
  });
}

module.exports = { ambilSlot };
