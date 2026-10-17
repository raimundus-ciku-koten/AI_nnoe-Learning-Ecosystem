/**
 * @file Lapisan data Firestore untuk Perencanaan Pembelajaran.
 *
 * Model data:
 *   perencanaan/{uid}/paket/{paketId}               ← konteks (mapel, kelas, kalender, identitas)
 *   perencanaan/{uid}/paket/{paketId}/dokumen/{jenis}  ← rpe | atp | prota | prosem | kktp
 *   perencanaan/{uid}/paket/{paketId}/modul/{noUnit}   ← satu Modul Ajar per unit (hindari batas 1 MiB)
 *
 * Konkurensi: setiap dokumen punya `rev` (bilangan bulat naik 1 tiap tulis). Klien menulis
 * lewat transaksi yang membandingkan `revDasar`; Security Rules menegakkan aturan yang sama
 * di server (rev baru = rev lama + 1), sehingga dua tab/perangkat tidak saling menimpa diam-diam.
 */

import {
  collection, doc, getDocs, limit, onSnapshot, orderBy, query, where,
  runTransaction, serverTimestamp, writeBatch
} from 'firebase/firestore';
import { db } from '../../../firebase/index.js';
import { BATAS, JENIS, KOLEKSI, SCHEMA_VERSION } from '../constants.js';

export class KonflikVersiError extends Error {
  constructor(pesan = 'Data diubah di tempat lain.') {
    super(pesan);
    this.name = 'KonflikVersiError';
    this.kode = 'KONFLIK_VERSI';
  }
}

export class BatasPaketError extends Error {
  constructor() {
    super('Batas jumlah paket tercapai.');
    this.name = 'BatasPaketError';
    this.kode = 'BATAS_PAKET';
  }
}

/* ------------------------------ Referensi ------------------------------ */

const koleksiPaket = (uid) => collection(db, KOLEKSI.ROOT, uid, KOLEKSI.PAKET);
const refPaket = (uid, paketId) => doc(db, KOLEKSI.ROOT, uid, KOLEKSI.PAKET, paketId);
const koleksiDokumen = (uid, paketId) => collection(refPaket(uid, paketId), KOLEKSI.DOKUMEN);
const refDokumen = (uid, paketId, jenis) => doc(koleksiDokumen(uid, paketId), jenis);
const koleksiModul = (uid, paketId) => collection(refPaket(uid, paketId), KOLEKSI.MODUL);
const refModul = (uid, paketId, noUnit) => doc(koleksiModul(uid, paketId), String(noUnit));

/** Ubah Timestamp Firestore menjadi milidetik agar mudah dipakai UI. */
const ms = (ts) => (ts && typeof ts.toMillis === 'function' ? ts.toMillis() : null);

const dariSnap = (snap) => {
  const d = snap.data({ serverTimestamps: 'estimate' });
  return { ...d, id: snap.id, dibuatPada: ms(d.createdAt), diubahPada: ms(d.updatedAt) };
};

/* -------------------------------- Paket -------------------------------- */

/**
 * Buat paket baru. Mengembalikan id.
 * @param {{uid:string, tenantId:string, konteks:Object, jumlahPaketSaatIni?:number}} p
 */
export async function buatPaket({ uid, tenantId, konteks, jumlahPaketSaatIni = 0 }) {
  if (jumlahPaketSaatIni >= BATAS.PAKET_MAKS_PER_GURU) throw new BatasPaketError();
  const ref = doc(koleksiPaket(uid));
  await runTransaction(db, async (tx) => {
    tx.set(ref, {
      ...konteks,
      ownerUid: uid,
      tenantId,
      schemaVersion: SCHEMA_VERSION,
      rev: 1,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
  });
  return ref.id;
}

/**
 * Perbarui konteks paket dengan pemeriksaan versi.
 * @param {{uid:string, paketId:string, konteks:Object, revDasar:number}} p
 */
export async function perbaruiPaket({ uid, paketId, konteks, revDasar }) {
  const ref = refPaket(uid, paketId);
  await runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    if (!snap.exists()) throw new Error('Paket tidak ditemukan.');
    const lama = snap.data();
    if (lama.rev !== revDasar) throw new KonflikVersiError();
    tx.update(ref, { ...konteks, rev: lama.rev + 1, updatedAt: serverTimestamp() });
  });
}

/** Dengarkan daftar paket milik guru (terbaru dulu, maksimal BATAS.PAKET_MAKS_PER_GURU). */
export function dengarDaftarPaket(uid, tenantId, onData, onError) {
  const q = query(
    koleksiPaket(uid),
    where('tenantId', '==', tenantId),
    orderBy('updatedAt', 'desc'),
    limit(BATAS.PAKET_MAKS_PER_GURU)
  );
  return onSnapshot(q, (snap) => onData(snap.docs.map(dariSnap)), onError);
}

/**
 * Ambil dokumen hasil dari semua paket milik guru untuk halaman arsip.
 * Jumlah paket dibatasi oleh BATAS.PAKET_MAKS_PER_GURU.
 */
export async function daftarArsipPerencanaan(uid) {
  const paketSnap = await getDocs(query(
    koleksiPaket(uid),
    orderBy('updatedAt', 'desc'),
    limit(BATAS.PAKET_MAKS_PER_GURU)
  ));

  const daftar = await Promise.all(paketSnap.docs.map(async (snap) => {
    const paket = dariSnap(snap);
    const [dokumenSnap, modulSnap] = await Promise.all([
      getDocs(koleksiDokumen(uid, paket.id)),
      getDocs(koleksiModul(uid, paket.id))
    ]);
    const konteks = {
      paketId: paket.id,
      mapel: paket.mapel,
      kelas: paket.kelas,
      fase: paket.fase,
      tahunAjaran: paket.tahunAjaran
    };

    return [
      ...dokumenSnap.docs.map((dok) => ({
        ...dariSnap(dok),
        ...konteks
      })),
      ...modulSnap.docs.map((dok) => ({
        ...dariSnap(dok),
        ...konteks,
        jenis: JENIS.MODUL,
        noUnit: Number(dok.id)
      }))
    ];
  }));

  return daftar.flat().sort((a, b) => (b.diubahPada ?? b.dibuatPada ?? 0) - (a.diubahPada ?? a.dibuatPada ?? 0));
}

/** Dengarkan satu paket. `onData(null)` bila tidak ada. */
export function dengarPaket(uid, paketId, onData, onError) {
  return onSnapshot(refPaket(uid, paketId), (snap) => onData(snap.exists() ? dariSnap(snap) : null), onError);
}

/** Hapus paket beserta seluruh dokumen dan modulnya (satu batch atomik). */
export async function hapusPaket(uid, tenantId, paketId) {
  const [dok, mod] = await Promise.all([
    getDocs(query(koleksiDokumen(uid, paketId), where('tenantId', '==', tenantId))),
    getDocs(query(koleksiModul(uid, paketId), where('tenantId', '==', tenantId)))
  ]);
  const batch = writeBatch(db);
  dok.forEach((d) => batch.delete(d.ref));
  mod.forEach((d) => batch.delete(d.ref));
  batch.delete(refPaket(uid, paketId));
  await batch.commit();
}

/* ------------------------------ Dokumen ------------------------------- */

/**
 * Dengarkan seluruh dokumen sebuah paket sebagai peta { jenis: dokumen }.
 */
export function dengarDokumen(uid, tenantId, paketId, onData, onError) {
  return onSnapshot(query(koleksiDokumen(uid, paketId), where('tenantId', '==', tenantId)), (snap) => {
    const peta = {};
    snap.forEach((d) => { peta[d.id] = dariSnap(d); });
    onData(peta);
  }, onError);
}

/**
 * Simpan dokumen (buat atau perbarui) dengan kontrol versi.
 * @param {Object} p
 * @param {string} p.uid
 * @param {string} p.tenantId
 * @param {string} p.paketId
 * @param {string} p.jenis rpe|atp|prota|prosem|kktp
 * @param {Object} p.payload
 * @param {'mesin'|'ai'|'manual'} p.sumber
 * @param {Record<string,number>} p.sumberRev rev dependensi saat dokumen ini dibuat
 * @param {number} [p.revDasar] rev yang dilihat pengguna; 0/undefined = dokumen harus belum ada
 * @returns {Promise<number>} rev baru
 */
export async function simpanDokumen({ uid, tenantId, paketId, jenis, payload, sumber, sumberRev, revDasar = 0 }) {
  const ref = refDokumen(uid, paketId, jenis);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const revLama = snap.exists() ? snap.data().rev : 0;
    if (revLama !== revDasar) throw new KonflikVersiError();
    const rev = revLama + 1;
    const data = {
      ownerUid: uid, tenantId, paketId, jenis,
      schemaVersion: SCHEMA_VERSION, rev, sumber, sumberRev, payload,
      updatedAt: serverTimestamp()
    };
    if (snap.exists()) tx.update(ref, data);
    else tx.set(ref, { ...data, createdAt: serverTimestamp() });
    return rev;
  });
}

/* -------------------------------- Modul -------------------------------- */

export function dengarModul(uid, tenantId, paketId, onData, onError) {
  return onSnapshot(query(koleksiModul(uid, paketId), where('tenantId', '==', tenantId)), (snap) => {
    const peta = {};
    snap.forEach((d) => { peta[d.id] = dariSnap(d); });
    onData(peta);
  }, onError);
}

/** Simpan satu Modul Ajar (per unit) dengan kontrol versi. Parameter sama dengan simpanDokumen + noUnit. */
export async function simpanModul({ uid, tenantId, paketId, noUnit, payload, sumber, sumberRev, revDasar = 0 }) {
  const ref = refModul(uid, paketId, noUnit);
  return runTransaction(db, async (tx) => {
    const snap = await tx.get(ref);
    const revLama = snap.exists() ? snap.data().rev : 0;
    if (revLama !== revDasar) throw new KonflikVersiError();
    const rev = revLama + 1;
    const data = {
      ownerUid: uid, tenantId, paketId, jenis: 'modul', noUnit: Number(noUnit),
      schemaVersion: SCHEMA_VERSION, rev, sumber, sumberRev, payload,
      updatedAt: serverTimestamp()
    };
    if (snap.exists()) tx.update(ref, data);
    else tx.set(ref, { ...data, createdAt: serverTimestamp() });
    return rev;
  });
}
