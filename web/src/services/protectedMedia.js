import { auth, rtdb, ambilStorage } from '../firebase/index.js';
import { firebaseEnv } from '../firebase/core/app.js';
import {
  get as getDatabaseValue,
  push,
  ref as databaseRef,
  remove,
  serverTimestamp,
  set,
} from 'firebase/database';
import { getBytes, ref as storageRef } from 'firebase/storage';
import {
  jalurLampiranValid, MAKS_BERKAS, namaBerkasAman,
} from '../utils/chatUtil.js';

const cleanupFoto = new WeakMap();
const MAKS_FOTO_PROFIL = 128 * 1024;

function base64DariBuffer(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary);
}

function bytesDariBase64(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let offset = 0; offset < binary.length; offset += 1) {
    bytes[offset] = binary.charCodeAt(offset);
  }
  return bytes;
}

function cekDibatalkan(signal) {
  if (signal?.aborted) throw new DOMException('Permintaan dibatalkan.', 'AbortError');
}

export function urlFotoProfil(uid) {
  const object = encodeURIComponent(`fotoProfil/${uid}.jpg`);
  return `https://firebasestorage.googleapis.com/v0/b/${firebaseEnv.storageBucket}/o/${object}`;
}

export function uidDariUrlFotoProfil(url) {
  if (typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    const cloudStorage = parsed.hostname === 'firebasestorage.googleapis.com';
    const emulatorStorage = (parsed.hostname === '127.0.0.1' || parsed.hostname === 'localhost') &&
      parsed.port === '9199';
    if (!cloudStorage && !emulatorStorage) return null;
    const objectPath = /^\/v0\/b\/[^/]+\/o\/(.+)$/.exec(parsed.pathname);
    if (!objectPath) return null;
    const path = decodeURIComponent(objectPath[1]);
    const match = /^fotoProfil\/([A-Za-z0-9_-]{1,128})\.jpg$/.exec(path);
    return match?.[1] || null;
  } catch {
    return null;
  }
}

export function pasangFotoTerlindung(image, photoUrl = image?.dataset.fotoUrl) {
  const uid = uidDariUrlFotoProfil(photoUrl);
  if (!image || !uid) return () => {};
  cleanupFoto.get(image)?.();

  const controller = new AbortController();
  let objectUrl = null;
  let active = true;
  if (!auth.currentUser) {
    image.remove();
    return () => {};
  }

  Promise.all([ambilStorage(), Promise.resolve(getBytes), Promise.resolve(storageRef)])
    .then(([storage, readBytes, makeRef]) => readBytes(
      makeRef(storage, `fotoProfil/${uid}.jpg`),
      MAKS_FOTO_PROFIL,
    ))
    .then((bytes) => {
      if (controller.signal.aborted) throw new DOMException('Permintaan dibatalkan.', 'AbortError');
      return new Blob([bytes], { type: 'image/jpeg' });
    })
    .then((blob) => {
      if (!active) return;
      objectUrl = URL.createObjectURL(blob);
      image.src = objectUrl;
    })
    .catch((error) => {
      if (active && error?.name !== 'AbortError') {
        console.error('[profil] Foto Firebase terlindung gagal dimuat:', error);
        image.remove();
      }
    });

  const cleanup = () => {
    active = false;
    controller.abort();
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    if (cleanupFoto.get(image) === cleanup) cleanupFoto.delete(image);
  };
  cleanupFoto.set(image, cleanup);
  return cleanup;
}

export async function ambilUrlLampiran(filePath, chatId, signal) {
  if (!auth.currentUser) throw Object.assign(new Error('Sesi berakhir.'), { code: 'unauthenticated' });
  if (!rtdb) throw new Error('Firebase Realtime Database belum dikonfigurasi.');
  if (!jalurLampiranValid(filePath, chatId)) throw new Error('Jalur lampiran tidak valid.');
  cekDibatalkan(signal);

  const [ownerUid, , fileId] = filePath.split('/');
  const snapshot = await getDatabaseValue(databaseRef(rtdb, `chatAttachments/${chatId}/${fileId}`));
  cekDibatalkan(signal);
  if (!snapshot.exists()) throw new Error('Lampiran tidak ditemukan di Firebase.');
  const data = snapshot.val();
  if (data.ownerUid !== ownerUid || !Number.isSafeInteger(data.fileSize) ||
      data.fileSize <= 0 || data.fileSize > MAKS_BERKAS ||
      typeof data.contentType !== 'string' || typeof data.data !== 'string') {
    throw new Error('Data lampiran Firebase tidak valid.');
  }

  const bytes = bytesDariBase64(data.data);
  if (bytes.byteLength !== data.fileSize) throw new Error('Ukuran lampiran Firebase tidak cocok.');
  return URL.createObjectURL(new Blob([bytes], { type: data.contentType }));
}

export async function unggahLampiran(file, chatId) {
  const user = auth.currentUser;
  if (!user) throw Object.assign(new Error('Sesi berakhir.'), { code: 'unauthenticated' });
  if (!rtdb) throw new Error('Firebase Realtime Database belum dikonfigurasi.');
  if (!/^[A-Za-z0-9_-]{1,160}$/.test(chatId)) throw new Error('Percakapan tidak valid.');
  if (!file || file.size <= 0 || file.size > MAKS_BERKAS) {
    throw new Error('Lampiran harus berukuran maksimal 2 MiB.');
  }

  const contentType = String(file.type || '').toLowerCase();
  const nama = namaBerkasAman(file.name);
  const attachmentRef = push(databaseRef(rtdb, `chatAttachments/${chatId}`));
  if (!attachmentRef.key) throw new Error('ID lampiran Firebase tidak dapat dibuat.');

  const filePath = `chat/${user.uid}/${chatId}/${attachmentRef.key}`;
  const data = base64DariBuffer(await file.arrayBuffer());
  await set(attachmentRef, {
    ownerUid: user.uid,
    fileName: nama,
    fileSize: file.size,
    contentType,
    data,
    createdAt: serverTimestamp(),
  });

  return {
    filePath,
    fileName: nama,
    fileSize: file.size,
    type: contentType.startsWith('image/') ? 'image' : 'file',
  };
}

export async function hapusLampiran(filePath, chatId) {
  const user = auth.currentUser;
  if (!user) throw Object.assign(new Error('Sesi berakhir.'), { code: 'unauthenticated' });
  if (!rtdb) throw new Error('Firebase Realtime Database belum dikonfigurasi.');
  if (!jalurLampiranValid(filePath, chatId, user.uid)) throw new Error('Jalur lampiran tidak valid.');
  const fileId = filePath.split('/')[3];
  await remove(databaseRef(rtdb, `chatAttachments/${chatId}/${fileId}`));
}
