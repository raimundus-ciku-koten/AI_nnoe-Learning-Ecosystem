'use strict';
/**
 * Logika inti `generatePerangkat`, dipisah dari pembungkus Firebase agar dapat diuji tanpa emulator.
 * Prinsip keamanan:
 *  - identitas dari token (req.auth), BUKAN dari data kiriman klien;
 *  - konteks paket dibaca dari Firestore di jalur milik uid pemanggil, lalu dicek tenant;
 *  - prasyarat dicek "segar" (rev) sama seperti di klien;
 *  - kuota per pengguna sebelum memanggil model; keluaran divalidasi ketat sebelum dikembalikan.
 */

const { urai } = require('./schema');
const { promptAtp, promptKktp, promptModul } = require('./prompts');
const { hasilDariModel, SemuaPenyediaGagal } = require('./providers');
const { ambilSlot } = require('./ratelimit');

class GalatLayanan extends Error {
  /** @param {'unauthenticated'|'permission-denied'|'invalid-argument'|'failed-precondition'|'resource-exhausted'|'unavailable'|'internal'|'not-found'} kode */
  constructor(kode, pesan) { super(pesan); this.kode = kode; }
}

const JENIS_AI = new Set(['atp', 'kktp', 'modul']);
const ID_PAKET = /^[A-Za-z0-9]{20}$/;

const normKode = (k) => String(k ?? '').toUpperCase().replace(/[^A-Z0-9]/g, '');

async function bacaDokumen(db, uid, paketId, jenis) {
  const s = await db.doc(`perencanaan/${uid}/paket/${paketId}/dokumen/${jenis}`).get();
  return s.exists ? s.data() : null;
}

/** Periksa rantai kesegaran: rpe ← paket, atp ← rpe, prota ← atp. */
function periksaPrasyarat(jenis, paket, { rpe, atp, prota }) {
  const rpeSegar = !!rpe && rpe.sumberRev?.paket === paket.rev;
  const atpSegar = !!atp && rpeSegar && atp.sumberRev?.rpe === rpe.rev;
  const protaSegar = !!prota && atpSegar && prota.sumberRev?.atp === atp.rev;
  const perlu = { atp: rpeSegar, kktp: atpSegar, modul: atpSegar && protaSegar }[jenis];
  if (!perlu) throw new GalatLayanan('failed-precondition', 'Dokumen prasyarat belum siap atau usang.');
}

/**
 * @param {Object} o
 * @param {{auth?:{uid:string, token:Object}, data:any}} o.req
 * @param {FirebaseFirestore.Firestore} o.db
 * @param {Object} o.config {geminiKeys, geminiModel, deepseekKey, deepseekModel, anthropicKey, anthropicModel, perJam, perHari}
 * @param {typeof fetch} [o.fetchFn]
 * @param {(m:string)=>void} [o.log]
 */
async function tangani({ req, db, config, fetchFn, log }) {
  const auth = req.auth;
  if (!auth) throw new GalatLayanan('unauthenticated', 'Harus login.');
  const { uid, token } = auth;
  if (token.role !== 'guru' || typeof token.tenantId !== 'string' || !token.tenantId) {
    throw new GalatLayanan('permission-denied', 'Hanya guru yang terhubung ke sekolah.');
  }

  const { paketId, jenis, noUnit } = req.data ?? {};
  if (typeof paketId !== 'string' || !ID_PAKET.test(paketId)) throw new GalatLayanan('invalid-argument', 'paketId tidak valid.');
  if (!JENIS_AI.has(jenis)) throw new GalatLayanan('invalid-argument', 'jenis tidak valid.');
  if (jenis === 'modul' && !(Number.isInteger(noUnit) && noUnit >= 1 && noUnit <= 30)) throw new GalatLayanan('invalid-argument', 'noUnit tidak valid.');

  const snapPaket = await db.doc(`perencanaan/${uid}/paket/${paketId}`).get();
  if (!snapPaket.exists) throw new GalatLayanan('not-found', 'Paket tidak ditemukan.');
  const paket = snapPaket.data();
  if (paket.ownerUid !== uid || paket.tenantId !== token.tenantId) throw new GalatLayanan('permission-denied', 'Akses ditolak.');

  const [rpe, atp, prota] = await Promise.all(['rpe', 'atp', 'prota'].map((j) => bacaDokumen(db, uid, paketId, j)));
  periksaPrasyarat(jenis, paket, { rpe, atp, prota });

  /* Susun prompt + konteks validasi dari data tepercaya di Firestore. */
  const dasar = { mapel: paket.mapel, kelas: paket.kelas, fase: paket.fase };
  let prompt;
  let kodeTp = [];
  if (jenis === 'atp') {
    const totalJP = rpe.payload?.totalJP;
    if (!Number.isInteger(totalJP) || totalJP < 4) throw new GalatLayanan('failed-precondition', 'Total JP RPE tidak valid.');
    prompt = promptAtp({ ...dasar, totalJP, jpPerPekan: rpe.payload.jpPerPekan });
  } else {
    const unitAtp = (atp.payload?.unit ?? []).filter((u) => u.tp?.length);
    kodeTp = unitAtp.flatMap((u) => u.tp.map((t) => normKode(t.kode)));
    if (jenis === 'kktp') {
      prompt = promptKktp({ ...dasar, tps: unitAtp.flatMap((u) => u.tp) });
    } else {
      const unit = unitAtp.find((u) => u.no === noUnit);
      if (!unit) throw new GalatLayanan('invalid-argument', 'Unit tidak ada pada ATP.');
      const idx = unitAtp.indexOf(unit);
      const m = prota.payload?.program && [1, 2].flatMap((s) => prota.payload.program[s].modul).find((x) => x.no === idx + 1);
      const jpUnit = m ? m.jpTP : unit.tp.reduce((s, t) => s + t.jp, 0);
      prompt = promptModul({ ...dasar, unit, jpUnit, jpPerPertemuan: Math.max(1, rpe.payload.jpPerPekan / Math.max(1, rpe.payload.hari.length)) });
      kodeTp = unit.tp.map((t) => normKode(t.kode));
    }
  }

  const slotOk = await ambilSlot(db, uid, { perJam: config.perJam, perHari: config.perHari });
  if (!slotOk) throw new GalatLayanan('resource-exhausted', 'Batas penggunaan AI tercapai.');

  try {
    const hasil = await hasilDariModel({
      prompt,
      urai: (teks) => {
        const data = urai(jenis, teks, { kodeTp });
        if (jenis === 'atp') data.unit.forEach((u, i) => { u.no = i + 1; }); // nomor unit berurutan 1..n
        return data;
      },
      config, fetchFn, log
    });
    return hasil;
  } catch (e) {
    if (e instanceof SemuaPenyediaGagal) {
      log?.(`gagal: ${e.rincian.join(',')}`);
      const sementara = e.rincian.some((r) => /status_(429|5\d\d|jaringan)/.test(r));
      throw new GalatLayanan(sementara ? 'unavailable' : 'internal', 'Layanan AI gagal menghasilkan dokumen.');
    }
    throw new GalatLayanan('internal', 'Kesalahan tak terduga.');
  }
}

module.exports = { tangani, GalatLayanan };
