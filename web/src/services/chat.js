// web/src/services/chat.js
/**
 * chat.js — Layanan chat realtime (Realtime Database) + lampiran (Storage).
 *
 * Aturan emas: semua fungsi pantau… dan mulaiPantau… SINKRON dan langsung
 * mengembalikan fungsi berhenti. (Versi lama berstatus `async`, sehingga
 * yang dikembalikan adalah Promise dan cleanup di view gagal diam-diam →
 * listener realtime tetap hidup setelah pindah halaman.)
 *
 * Lampiran diproses oleh Cloud Function dengan autentikasi Firebase dan validasi anggota chat.
 * `rtdb` bernilai null bila VITE_FIREBASE_DATABASE_URL kosong → halaman chat
 * menampilkan pesan, dan chatSync tidak memulai listener.
 */
import {
  ref, push, get, set, update, onValue, onChildAdded, query,
  limitToLast, orderByKey, endBefore, serverTimestamp, increment
} from 'firebase/database';
import { rtdb } from '../firebase/index.js';
import { ambilUrlLampiran, unggahLampiran } from './protectedMedia.js';
import { setState } from '../state.js';
import {
  MAKS_BERKAS, MAKS_JUDUL, MAKS_ANGGOTA_GRUP, MAKS_TEKS,
  idPribadi, idValid, jalurLampiranValid, periksaBerkas, ringkas
} from '../utils/chatUtil.js';

export { MAKS_BERKAS, idPribadi, urlAman } from '../utils/chatUtil.js';

/* ---------- MEMBUAT PERCAKAPAN ---------- */

/**
 * Mulai/buka chat pribadi. Rules mensyaratkan kontak berstatus 'accepted'.
 * saya & teman = { uid, nama }
 */
export async function mulaiChatPribadi(saya, teman) {
  const chatId = idPribadi(saya.uid, teman.uid);

  // Entri milik sendiri selalu boleh dibaca.
  const sudahAda = await get(ref(rtdb, `userChats/${saya.uid}/${chatId}`));
  if (sudahAda.exists()) return chatId;

  try {
    await set(ref(rtdb, `chats/${chatId}/meta`), {
      type: 'direct',
      members: { [saya.uid]: true, [teman.uid]: true },
      names: { [saya.uid]: ringkas(saya.nama, 80), [teman.uid]: ringkas(teman.nama, 80) },
      createdBy: saya.uid,
      createdAt: serverTimestamp()
    });
  } catch {
    // Meta sudah dibuat pihak lain (rules menolak menimpa) → lanjut ke langkah 2.
  }

  await update(ref(rtdb), {
    [`userChats/${saya.uid}/${chatId}`]: {
      type: 'direct', name: ringkas(teman.nama, 80), peerUid: teman.uid,
      lastText: '', lastTs: serverTimestamp(), unread: 0
    },
    [`userChats/${teman.uid}/${chatId}`]: {
      type: 'direct', name: ringkas(saya.nama, 80), peerUid: saya.uid,
      lastText: '', lastTs: serverTimestamp(), unread: 0
    }
  });
  return chatId;
}

/** Buat grup. anggota = [{ uid, nama }] (tanpa diri sendiri). */
export async function buatGrup(saya, nama, anggota) {
  const judul = ringkas(nama, MAKS_JUDUL);
  if (!judul) throw new Error('Nama grup wajib diisi.');
  const lain = anggota.filter((a) => a.uid !== saya.uid);
  if (lain.length < 1) throw new Error('Pilih minimal satu anggota.');
  if (lain.length + 1 > MAKS_ANGGOTA_GRUP) throw new Error(`Grup maksimal ${MAKS_ANGGOTA_GRUP} anggota.`);

  const chatId = push(ref(rtdb, 'chats')).key;
  const members = { [saya.uid]: true };
  const names = { [saya.uid]: ringkas(saya.nama, 80) };
  lain.forEach((a) => { members[a.uid] = true; names[a.uid] = ringkas(a.nama, 80); });

  await set(ref(rtdb, `chats/${chatId}/meta`), {
    type: 'group', name: judul, members, names,
    createdBy: saya.uid, createdAt: serverTimestamp()
  });

  const tulis = {};
  Object.keys(members).forEach((uid) => {
    tulis[`userChats/${uid}/${chatId}`] = {
      type: 'group', name: judul, lastText: '', lastTs: serverTimestamp(), unread: 0
    };
  });
  await update(ref(rtdb), tulis);
  return chatId;
}

export async function ambilMeta(chatId) {
  if (!idValid(chatId)) return null;
  const snap = await get(ref(rtdb, `chats/${chatId}/meta`));
  return snap.exists() ? snap.val() : null;
}

/* ---------- MENGIRIM ---------- */

/**
 * Kirim pesan. `meta` (opsional) dipakai agar entri daftar yang hilang
 * pulih sendiri (type/name/peerUid ikut ditulis ulang).
 * isi = { type:'text', text } | { type:'image'|'file', filePath, fileName, fileSize? }
 */
export async function kirimPesan(chatId, uidSaya, semuaAnggota, isi, meta = null) {
  const kunci = push(ref(rtdb, `chats/${chatId}/messages`)).key;
  const pesan = { senderId: uidSaya, type: isi.type, ts: serverTimestamp() };
  let ringkasan;

  if (isi.type === 'text') {
    const teks = String(isi.text ?? '').slice(0, MAKS_TEKS);
    if (!teks.trim()) throw new Error('Pesan kosong.');
    pesan.text = teks;
    ringkasan = teks;
  } else {
    if (!jalurLampiranValid(isi.filePath, chatId, uidSaya)) {
      throw new Error('Jalur lampiran tidak valid.');
    }
    pesan.filePath = isi.filePath;
    pesan.fileName = ringkas(isi.fileName, 200);
    if (Number.isFinite(isi.fileSize)) pesan.fileSize = isi.fileSize;
    ringkasan = isi.type === 'image' ? 'Foto' : `Berkas: ${ringkas(isi.fileName, 80)}`;
  }

  const tulis = { [`chats/${chatId}/messages/${kunci}`]: pesan };
  semuaAnggota.forEach((uid) => {
    const dasar = `userChats/${uid}/${chatId}`;
    tulis[`${dasar}/lastText`] = ringkas(ringkasan, 200);
    tulis[`${dasar}/lastTs`] = serverTimestamp();
    tulis[`${dasar}/lastSender`] = uidSaya;
    if (uid !== uidSaya) tulis[`${dasar}/unread`] = increment(1);
    if (meta) {
      tulis[`${dasar}/type`] = meta.type;
      if (meta.type === 'group') {
        tulis[`${dasar}/name`] = ringkas(meta.name || 'Grup', 80);
      } else {
        const lawan = semuaAnggota.find((u) => u !== uid);
        if (lawan) {
          tulis[`${dasar}/peerUid`] = lawan;
          tulis[`${dasar}/name`] = ringkas(meta.names?.[lawan] || 'Pengguna', 80);
        }
      }
    }
  });

  await update(ref(rtdb), tulis); // atomik: semua berhasil atau semua gagal
  return kunci;
}

/** Unggah lampiran ke Storage. Mengembalikan isi pesan siap kirim. */
export async function unggahBerkas(chatId, uid, berkas) {
  const cek = periksaBerkas(berkas);
  if (!cek.ok) throw new Error(cek.alasan);
  const hasil = await unggahLampiran(berkas, chatId);
  if (!jalurLampiranValid(hasil.filePath, chatId, uid)) {
    throw new Error('Server mengembalikan jalur lampiran yang tidak valid.');
  }
  return {
    type: hasil.type,
    filePath: hasil.filePath,
    fileName: hasil.fileName,
    fileSize: hasil.fileSize,
  };
}

export async function ambilLampiran(chatId, filePath, signal) {
  if (!jalurLampiranValid(filePath, chatId)) throw new Error('Jalur lampiran tidak valid.');
  return ambilUrlLampiran(filePath, chatId, signal);
}

/* ---------- MEMBACA & MENDENGARKAN (semua SINKRON → mengembalikan unsubscribe) ---------- */

/** Pantau daftar percakapan pengguna → state.chats / state.unreadChats. */
export function mulaiPantauDaftar(uid) {
  return onValue(
    ref(rtdb, `userChats/${uid}`),
    (snap) => {
      const daftar = [];
      snap.forEach((anak) => { daftar.push({ id: anak.key, ...anak.val() }); });
      daftar.sort((a, b) => (b.lastTs ?? 0) - (a.lastTs ?? 0));
      setState({
        chats: daftar,
        unreadChats: daftar.reduce((n, c) => n + (Number(c.unread) || 0), 0)
      });
    },
    (error) => console.error('[chat] daftar percakapan gagal dimuat:', error)
  );
}

/** N pesan terakhir, lalu setiap pesan baru. */
export function pantauPesan(chatId, onTambah, jumlah = 50) {
  const q = query(ref(rtdb, `chats/${chatId}/messages`), limitToLast(jumlah));
  return onChildAdded(
    q,
    (snap) => onTambah({ id: snap.key, ...snap.val() }),
    (error) => console.error('[chat] pesan gagal dimuat:', error)
  );
}

/** Pesan yang lebih lama dari pesan dengan ID tertentu (urut kronologis). */
export async function muatPesanLama(chatId, sebelumId, jumlah = 30) {
  const q = query(
    ref(rtdb, `chats/${chatId}/messages`),
    orderByKey(), endBefore(sebelumId), limitToLast(jumlah)
  );
  const snap = await get(q);
  const hasil = [];
  snap.forEach((anak) => { hasil.push({ id: anak.key, ...anak.val() }); });
  return hasil;
}

/* ---------- TANDA BACA ---------- */

export function tandaiDibaca(chatId, uid) {
  return update(ref(rtdb), {
    [`reads/${chatId}/${uid}`]: serverTimestamp(),
    [`userChats/${uid}/${chatId}/unread`]: 0
  });
}

export function pantauBacaan(chatId, callback) {
  return onValue(
    ref(rtdb, `reads/${chatId}`),
    (snap) => callback(snap.val() || {}),
    () => callback({})
  );
}
