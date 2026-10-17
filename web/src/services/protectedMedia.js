import { supabase } from '../lib/supabase.ts';
import { getState } from '../state.js';

const cleanupFoto = new WeakMap();
const MAKS_FOTO_PROFIL = 128 * 1024;
const POLA_FOTO = /^\/([^/]+)\/([A-Za-z0-9_-]{1,128})\/avatar\.jpg$/;

function infoFotoProfil(url) {
  if (typeof url !== 'string') return null;
  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'supabase:' || parsed.hostname !== 'profile-media') return null;
    const match = POLA_FOTO.exec(parsed.pathname);
    if (!match) return null;
    return {
      tenantId: decodeURIComponent(match[1]),
      uid: match[2],
      path: `profiles/${decodeURIComponent(match[1])}/${match[2]}/avatar.jpg`,
    };
  } catch {
    return null;
  }
}

export function urlFotoProfil(uid) {
  const tenantId = getState().tenantId || 'platform';
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(uid) || !/^[A-Za-z0-9_-]{1,128}$/.test(tenantId)) {
    throw new Error('Identitas tenant atau pengguna tidak valid untuk foto profil.');
  }
  return `supabase://profile-media/${encodeURIComponent(tenantId)}/${uid}/avatar.jpg`;
}

export function uidDariUrlFotoProfil(url) {
  return infoFotoProfil(url)?.uid || null;
}

export function pasangFotoTerlindung(image, photoUrl = image?.dataset.fotoUrl) {
  const foto = infoFotoProfil(photoUrl);
  if (!image || !foto) return () => {};
  cleanupFoto.get(image)?.();

  let objectUrl = null;
  let active = true;
  const cleanup = () => {
    active = false;
    if (objectUrl) URL.revokeObjectURL(objectUrl);
    if (cleanupFoto.get(image) === cleanup) cleanupFoto.delete(image);
  };
  cleanupFoto.set(image, cleanup);

  supabase.storage.from('profile-media').download(foto.path)
    .then(({ data, error }) => {
      if (error) throw error;
      if (!data) throw new Error('Foto profil tidak ditemukan di Supabase Storage.');
      if (data.size > MAKS_FOTO_PROFIL) throw new Error('Ukuran foto profil melampaui batas.');
      if (!active) return;
      objectUrl = URL.createObjectURL(data);
      image.src = objectUrl;
    })
    .catch((error) => {
      if (active) {
        console.error('[profil] Foto profil Supabase gagal dimuat:', error);
        image.remove();
      }
    });

  return cleanup;
}

export async function unggahFotoProfil(uid, blob) {
  if (blob.size <= 0 || blob.size > MAKS_FOTO_PROFIL || blob.type !== 'image/jpeg') {
    throw new Error('Foto profil harus berupa JPEG dengan ukuran maksimal 128 KiB.');
  }
  const path = infoFotoProfil(urlFotoProfil(uid)).path;
  const { error } = await supabase.storage.from('profile-media').upload(path, blob, {
    upsert: true,
    contentType: 'image/jpeg',
    cacheControl: '0',
  });
  if (error) throw error;
  return urlFotoProfil(uid);
}

export async function hapusFotoProfil(uid) {
  const path = infoFotoProfil(urlFotoProfil(uid)).path;
  const { error } = await supabase.storage.from('profile-media').remove([path]);
  if (error) throw error;
}

function mediaChatBelumDimigrasikan() {
  return Object.assign(
    new Error('Lampiran chat belum tersedia sampai penyimpanan dan akses anggota chat dimigrasikan ke Supabase.'),
    { code: 'ale/chat-media-not-migrated' },
  );
}

export async function unggahLampiran() {
  throw mediaChatBelumDimigrasikan();
}

export async function ambilUrlLampiran() {
  throw mediaChatBelumDimigrasikan();
}
