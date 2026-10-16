// web/src/services/contacts.js
/**
 * contacts.js — Kontak: permintaan → persetujuan → baru boleh chat pribadi.
 *
 * Realtime Database:
 *   contacts/{pairId}             → sumber kebenaran (dipakai Security Rules)
 *   userContacts/{uid}/{pairId}   → indeks per pengguna untuk menampilkan daftar
 *   pairId SAMA dengan chatId pribadi: "d_<uidA>_<uidB>" (uid diurutkan).
 *
 * Urutan tulis (JANGAN dibalik; Rules membaca `root` sebelum penulisan):
 *   Kirim → contacts/{id} dulu, baru userContacts kedua pihak.
 *   Hapus → userContacts dulu, baru contacts/{id}.
 *
 * Direktori pengguna (Firestore `directory/{uid}`): SATU-satunya sumber
 * daftar orang untuk "Cari Orang" dan "Buat Grup".
 */
import {
  ref, get, set, update, remove, onValue, serverTimestamp
} from 'firebase/database';
import {
  collection, doc, setDoc, query, where, limit, getDocs, orderBy, startAfter,
  serverTimestamp as tsFs
} from 'firebase/firestore';
import { rtdb, db } from '../firebase/index.js';
import { getState } from '../state.js';
import { idPribadi, ringkas } from '../utils/chatUtil.js';

/** Galat domain — pesannya aman ditampilkan langsung ke pengguna. */
export class GalatKontak extends Error {
  constructor(pesan, kode = 'kontak/galat') {
    super(pesan);
    this.name = 'GalatKontak';
    this.code = kode;
  }
}

export const idPasangan = idPribadi;

const potong = (s) => ringkas(s || 'Pengguna', 80);

function tulisIndeks(id, pemilik, peer, status, arah) {
  return set(ref(rtdb, `userContacts/${pemilik.uid}/${id}`), {
    peerUid: peer.uid, name: potong(peer.nama), status, arah, ts: serverTimestamp()
  });
}

/* ------------------------------------------------------------------ */
/* Mutasi                                                              */
/* ------------------------------------------------------------------ */

/** Kirim permintaan kontak. saya & orang = { uid, nama }. */
export async function kirimPermintaan(saya, orang) {
  if (!saya?.uid || !orang?.uid || saya.uid === orang.uid) throw new GalatKontak('Pengguna tidak valid.');
  const id = idPasangan(saya.uid, orang.uid);

  // Cek lewat indeks milik sendiri (boleh dibaca). Membaca contacts/{id} yang
  // belum ada ditolak Rules, jadi jangan dipakai untuk pengecekan.
  const ada = await get(ref(rtdb, `userContacts/${saya.uid}/${id}`));
  if (ada.exists()) {
    const e = ada.val();
    if (e.status === 'accepted') throw new GalatKontak('Sudah menjadi kontak.');
    if (e.arah === 'keluar') throw new GalatKontak('Permintaan sudah dikirim, menunggu persetujuan.');
    return terimaPermintaan(saya, id); // lawan sudah meminta lebih dulu → langsung setujui
  }

  await set(ref(rtdb, `contacts/${id}`), {
    from: saya.uid, to: orang.uid, status: 'pending',
    names: { [saya.uid]: potong(saya.nama), [orang.uid]: potong(orang.nama) },
    createdAt: serverTimestamp()
  });
  await Promise.all([
    tulisIndeks(id, saya, orang, 'pending', 'keluar'),
    tulisIndeks(id, orang, saya, 'pending', 'masuk')
  ]);
  return id;
}

/** Setujui permintaan masuk (hanya penerima). */
export async function terimaPermintaan(saya, id) {
  const k = (await get(ref(rtdb, `contacts/${id}`))).val();
  if (!k || k.to !== saya.uid || k.status !== 'pending') throw new GalatKontak('Permintaan tidak ditemukan.');
  await update(ref(rtdb, `contacts/${id}`), { status: 'accepted', updatedAt: serverTimestamp() });
  await Promise.all([k.from, k.to].map((uid) =>
    update(ref(rtdb, `userContacts/${uid}/${id}`), { status: 'accepted', ts: serverTimestamp() })
  ));
  return id;
}

/**
 * Tolak, batalkan permintaan terkirim, atau hapus kontak.
 * Riwayat chat tetap ada; pesan baru ditolak Rules sampai terhubung lagi.
 */
export async function hapusKontak(saya, id) {
  let k = null;
  try { k = (await get(ref(rtdb, `contacts/${id}`))).val(); } catch { /* sudah tidak ada */ }

  if (k && k.from !== saya.uid && k.to !== saya.uid) throw new GalatKontak('Anda bukan pihak dalam kontak ini.');
  const uids = k ? [k.from, k.to] : [saya.uid];

  await Promise.all(uids.map((uid) => remove(ref(rtdb, `userContacts/${uid}/${id}`))));
  if (k) await remove(ref(rtdb, `contacts/${id}`));
}

/* ------------------------------------------------------------------ */
/* Pantau                                                              */
/* ------------------------------------------------------------------ */

/**
 * cb([{ id, peerUid, name, status:'pending'|'accepted', arah:'masuk'|'keluar', ts }])
 * Mengembalikan fungsi berhenti (sinkron).
 */
export function pantauKontak(uid, cb) {
  return onValue(
    ref(rtdb, `userContacts/${uid}`),
    (snap) => {
      const v = snap.val() || {};
      cb(Object.entries(v).map(([id, e]) => ({ id, ...e })));
    },
    (error) => { console.error('[contacts] pantauKontak gagal:', error); cb([]); }
  );
}

/* ------------------------------------------------------------------ */
/* Direktori pengguna (Firestore)                                      */
/* ------------------------------------------------------------------ */

const BATAS = 300;
const TTL_MS = 5 * 60 * 1000;
let tembolok = null; // { kunci, waktu, data }

/** Daftarkan/perbarui entri direktori milik sendiri (sekali per login). */
export async function sinkronkanDirektoriSaya() {
  const { user, role, tenantId } = getState();
  if (!user || !role || (role !== 'superadmin' && !tenantId)) return;
  const data = {
    uid: user.uid,
    nama: String(user.displayName || getState().profile?.nama || user.email || 'Pengguna').slice(0, 120),
    role,
    tenantId: tenantId || '',
    updatedAt: tsFs()
  };
  if (user.photoURL && /^https:\/\//i.test(user.photoURL) && user.photoURL.length <= 600) data.photoUrl = user.photoURL;
  await setDoc(doc(db, 'directory', user.uid), data);
  try {
    if (rtdb) {
      await set(ref(rtdb, `chatDirectory/${user.uid}`), {
        role,
        tenantId: tenantId || '',
        updatedAt: serverTimestamp(),
      });
    }
  } catch (e) {
    console.warn('[contacts] direktori realtime chat tidak dapat diperbarui:', e?.code || e);
  }
}

/** Daftar semua pengguna terdaftar yang dapat diajak chat. Cache 5 menit. */
export async function muatDirektori({ paksa = false } = {}) {
  const { user, role, tenantId } = getState();
  if (!user?.uid || !role || (role !== 'superadmin' && !tenantId)) {
    throw new GalatKontak('Akun belum terhubung ke sekolah sehingga direktori tidak dapat dimuat.', 'kontak/tenant-required');
  }
  const kunci = `${user?.uid}|${tenantId}|${role}`;
  if (!paksa && tembolok && tembolok.kunci === kunci && Date.now() - tembolok.waktu < TTL_MS) return tembolok.data;
  await sinkronkanDirektoriSaya();

  const dasar = collection(db, 'directory');
  const data = [];
  let cursor = null;
  while (true) {
    const filters = role === 'superadmin' ? [] : [where('tenantId', '==', tenantId)];
    const constraints = [...filters, orderBy('nama'), limit(BATAS)];
    if (cursor) constraints.push(startAfter(cursor));
    const snap = await getDocs(query(dasar, ...constraints));
    data.push(...snap.docs
      .map((d) => ({ ...d.data(), uid: d.id }))
      .filter((o) => o.uid !== user.uid && o.role !== 'demo' && typeof o.nama === 'string' && o.nama));
    if (snap.size < BATAS) break;
    cursor = snap.docs[snap.docs.length - 1];
  }
  tembolok = { kunci, waktu: Date.now(), data };
  return data;
}

export const hapusTembolokDirektori = () => { tembolok = null; };
