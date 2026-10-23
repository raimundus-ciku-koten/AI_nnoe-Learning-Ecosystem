// web/src/sesi.js
/**
 * sesi.js — Layanan sesi: Firebase Auth + peran (custom claims) + profil Firestore.
 *
 * Mengisi state.js:
 *   user, role, tenantId, claims, profile, sesiMemuat, authReady, akses, online.
 *
 * Model peran:
 *   - Peran & tenant dibaca dari custom claims ({ role, tenantId, kv }). Claims
 *     hanya bisa diubah server (Admin SDK) — lihat scripts/set-role.mjs.
 *   - Akun tanpa claims valid → akses = 'menunggu' (sudah login, belum diaktifkan).
 *   - Saat admin mengubah claims, dokumen users/{uid}.klaimVersi ikut berubah;
 *     sesi ini menyadarinya lewat onSnapshot dan menyegarkan token otomatis,
 *     tanpa pengguna perlu keluar-masuk.
 *
 * Catatan integrasi: modul ini sengaja diberi nama baru (bukan auth.js) agar
 * tidak menimpa auth.js yang sudah ada. auth.js cukup mendelegasikan ke sini.
 */
import {
  onAuthStateChanged, GoogleAuthProvider, signInWithPopup, signInWithRedirect,
  getRedirectResult, signInWithEmailAndPassword, signOut,
  sendEmailVerification, sendPasswordResetEmail,
} from 'firebase/auth';
import { doc, onSnapshot, setDoc, serverTimestamp } from 'firebase/firestore';

import { auth, db, bersihkanCacheLokal } from './firebase.js';
import { getState, setState, resetSesi, tunggu } from './state.js';
import { ambilProfil, simpanProfil, hapusProfil, namaDariUser } from './ui.js';
import { ubahGalat, galatDibatalkan, kodeGalat } from './galat.js';

export { pesanGalat, galatDibatalkan } from './galat.js';

const PERAN_VALID = new Set(['superadmin', 'admin_sekolah', 'operator', 'guru', 'siswa', 'ortu']);

/* ============================================================
   KEADAAN INTERNAL
   ============================================================ */
let urutan = 0;                 // membatalkan pemrosesan usang bila auth berganti cepat
let janji = null;               // promise mulaiSesi (idempotent)
let hentikanAuth = null;
let pantauUser = null;
let pantauTenant = null;
let tenantDipantau = null;
let dataUser = null;
let dataTenant = null;
let membuatDokumen = false;
let kvDicoba = null;            // cegah loop segarkan-klaim bila kv tidak cocok
let perluSegarkan = false;      // token gagal dibaca (mis. offline) → ulangi saat online
let jaringanTerpasang = false;

/* ============================================================
   UTILITAS
   ============================================================ */
function bacaKlaim(claims) {
  const role = PERAN_VALID.has(claims?.role) ? claims.role : null;
  const tenantId = typeof claims?.tenantId === 'string' && claims.tenantId ? claims.tenantId : null;
  // Semua peran selain superadmin wajib terikat ke satu sekolah.
  const lengkap = role === 'superadmin' || (!!role && !!tenantId);
  return { role: lengkap ? role : null, tenantId: lengkap ? tenantId : null, aktif: lengkap };
}

const infoUser = (u) => ({
  uid: u.uid,
  email: u.email || '',
  displayName: u.displayName || '',
  photoURL: u.photoURL || '',
  emailVerified: !!u.emailVerified,
});

function perbaruiProfil(u) {
  const profil = {
    nama: dataUser?.nama || u.displayName || namaDariUser({ email: u.email }),
    sekolah: dataTenant?.nama || '',
    logoSekolah: dataTenant?.logoSekolah || '',
  };
  if (JSON.stringify(profil) === JSON.stringify(getState().profile)) return;
  simpanProfil(u.uid, profil);
  setState({ profile: profil });
}

function lepasPantauan() {
  pantauUser?.(); pantauTenant?.();
  pantauUser = pantauTenant = null;
  tenantDipantau = null;
  dataUser = dataTenant = null;
  membuatDokumen = false;
  kvDicoba = null;
}

/* ============================================================
   PEMANTAUAN FIRESTORE
   ============================================================ */
function pasangTenant(u, tenantId) {
  if (tenantDipantau === tenantId) return;
  pantauTenant?.();
  pantauTenant = null;
  dataTenant = null;
  tenantDipantau = tenantId;
  if (!tenantId) return;
  pantauTenant = onSnapshot(
    doc(db, 'tenants', tenantId),
    (snap) => {
      const d = snap.data() || {};
      dataTenant = { nama: d.nama, logoSekolah: d.logoSekolah };
      perbaruiProfil(u);
    },
    (e) => console.warn('[sesi] pantau sekolah:', kodeGalat(e)),
  );
}

function pasangUser(u) {
  if (pantauUser) return;
  const ref = doc(db, 'users', u.uid);
  pantauUser = onSnapshot(
    ref,
    (snap) => {
      if (!snap.exists()) {
        // Pertama kali masuk: buat dokumen dasar agar admin melihat akun yang menunggu.
        if (!membuatDokumen) {
          membuatDokumen = true;
          setDoc(ref, { nama: namaDariUser(u), email: u.email || '', dibuat: serverTimestamp() })
            .catch((e) => { membuatDokumen = false; console.warn('[sesi] buat dokumen pengguna:', kodeGalat(e)); });
        }
        return;
      }
      dataUser = snap.data();
      perbaruiProfil(u);

      // Admin menaikkan klaimVersi → token di sini sudah usang, segarkan.
      const kv = dataUser.klaimVersi ?? 0;
      const kvToken = getState().claims?.kv ?? 0;
      if (kv !== kvToken && kv !== kvDicoba) {
        kvDicoba = kv;
        segarkanKlaim().catch((e) => console.warn('[sesi] segarkan klaim:', kodeGalat(e)));
      }
    },
    (e) => console.warn('[sesi] pantau pengguna:', kodeGalat(e)),
  );
}

function terapkan(u, claims) {
  const k = bacaKlaim(claims);
  setState({
    user: infoUser(u),
    claims,
    role: k.role,
    tenantId: k.tenantId,
    akses: k.aktif ? 'aktif' : 'menunggu',
    profile: getState().profile ?? ambilProfil(u.uid),   // tampil cepat dari cache
  });
  pasangTenant(u, k.tenantId);
}

/* ============================================================
   SIKLUS SESI
   ============================================================ */
async function tanganiAuth(u) {
  const giliran = ++urutan;
  lepasPantauan();

  if (!u) {
    resetSesi();
    setState({ sesiMemuat: false, authReady: true });
    return;
  }

  setState({ sesiMemuat: true });
  let claims = null;
  try {
    claims = (await u.getIdTokenResult()).claims;
  } catch (e) {
    console.warn('[sesi] token belum terbaca:', kodeGalat(e));
  }
  if (giliran !== urutan) return;

  if (claims) {
    terapkan(u, claims);
  } else {
    // Mis. offline dengan token kedaluwarsa: jangan salah menyimpulkan "menunggu".
    perluSegarkan = true;
    setState({ user: infoUser(u), akses: 'memuat', profile: getState().profile ?? ambilProfil(u.uid) });
  }
  pasangUser(u);
  setState({ sesiMemuat: false, authReady: true });
}

async function pulihkanToken() {
  const u = auth.currentUser;
  if (!perluSegarkan || !u) return;
  try {
    const hasil = await u.getIdTokenResult(true);
    perluSegarkan = false;
    terapkan(u, hasil.claims);
  } catch { /* coba lagi pada peristiwa online berikutnya */ }
}

function pantauJaringan() {
  if (jaringanTerpasang || typeof window === 'undefined') return;
  jaringanTerpasang = true;
  const set = () => setState({ online: navigator.onLine !== false });
  window.addEventListener('online', () => { set(); pulihkanToken(); });
  window.addEventListener('offline', set);
}

/**
 * Mulai memantau sesi. Aman dipanggil berkali-kali (idempotent).
 * Resolve dengan state setelah pemeriksaan sesi pertama selesai.
 */
export function mulaiSesi() {
  if (janji) return janji;
  janji = new Promise((selesai) => {
    pantauJaringan();

    // Hasil login Google via redirect (dipakai bila pop-up diblokir).
    getRedirectResult(auth).catch((e) => {
      if (galatDibatalkan(e)) return;
      window.dispatchEvent(new CustomEvent('sesi:galat', { detail: ubahGalat(e) }));
    });

    hentikanAuth = onAuthStateChanged(auth, (u) => {
      tanganiAuth(u).catch((e) => {
        console.error('[sesi]', e);
        setState({ sesiMemuat: false, authReady: true });
      });
    });

    tunggu((s) => s.authReady, 15000)
      .then(() => selesai(getState()))
      .catch(() => { setState({ sesiMemuat: false, authReady: true }); selesai(getState()); });
  });
  return janji;
}

/** Hentikan pemantauan (untuk pengujian / hot-reload). */
export function hentikanSesi() {
  hentikanAuth?.();
  hentikanAuth = null;
  lepasPantauan();
  janji = null;
}

/** Paksa baca ulang claims dari server (mis. setelah admin mengubah peran). */
export async function segarkanKlaim() {
  const u = auth.currentUser;
  if (!u) return getState();
  const hasil = await u.getIdTokenResult(true);
  perluSegarkan = false;
  terapkan(u, hasil.claims);
  return getState();
}

/* ============================================================
   AKSI MASUK / KELUAR
   ============================================================ */
const tungguSiap = () => tunggu((s) => s.authReady && !s.sesiMemuat && !!s.user, 10000)
  .catch(() => { throw ubahGalat({ code: 'sesi/waktu-habis' }); });

const POLA_EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** Masuk dengan email + kata sandi. Resolve setelah state siap dipakai halaman berikutnya. */
export async function masukEmail(email, sandi) {
  const surel = String(email || '').trim();
  if (!POLA_EMAIL.test(surel) || !sandi) throw ubahGalat({ code: 'sesi/input-kosong' });
  try {
    await signInWithEmailAndPassword(auth, surel, String(sandi));
  } catch (e) {
    throw ubahGalat(e);
  }
  await tungguSiap();
  return getState();
}

/**
 * Masuk dengan Google. Return:
 *   state  → berhasil;  null → pengguna menutup jendela;
 *   { redirect: true } → browser memblokir pop-up, halaman dialihkan ke Google.
 */
export async function masukGoogle() {
  const penyedia = new GoogleAuthProvider();
  penyedia.setCustomParameters({ prompt: 'select_account' });
  try {
    await signInWithPopup(auth, penyedia);
  } catch (e) {
    const k = kodeGalat(e);
    if (galatDibatalkan(e)) return null;
    if (k === 'auth/popup-blocked' || k === 'auth/operation-not-supported-in-this-environment') {
      await signInWithRedirect(auth, penyedia);
      return { redirect: true };
    }
    throw ubahGalat(e);
  }
  await tungguSiap();
  return getState();
}

/**
 * Keluar. Secara bawaan juga menghapus cache Firestore di perangkat lalu memuat
 * ulang halaman — penting untuk komputer sekolah yang dipakai bergantian.
 *   keluar({ bersihkan: false }) untuk melewati langkah itu.
 *   keluar({ ke: '#/' }) mengatur tujuan setelah keluar.
 */
export async function keluar({ bersihkan = true, ke = '#/' } = {}) {
  const uid = getState().user?.uid;
  lepasPantauan();
  try { await signOut(auth); } catch (e) { throw ubahGalat(e); }
  if (uid) hapusProfil(uid);
  resetSesi();
  if (bersihkan) {
    await bersihkanCacheLokal();
    if (typeof location !== 'undefined') {
      location.hash = ke;
      location.reload();
    }
  }
}

/** Kirim ulang email verifikasi ke akun yang sedang masuk. */
export async function kirimUlangVerifikasi() {
  const u = auth.currentUser;
  if (!u) throw ubahGalat({ code: 'unauthenticated' });
  try { await sendEmailVerification(u); } catch (e) { throw ubahGalat(e); }
}

/** Kirim email atur-ulang kata sandi. Selalu tampak berhasil agar akun tidak bisa ditebak. */
export async function kirimResetSandi(email) {
  const surel = String(email || '').trim();
  if (!POLA_EMAIL.test(surel)) throw ubahGalat({ code: 'auth/invalid-email' });
  try {
    await sendPasswordResetEmail(auth, surel);
  } catch (e) {
    const k = kodeGalat(e);
    if (k === 'auth/user-not-found') return;
    throw ubahGalat(e);
  }
}

/** Pembantu untuk router: true bila akun boleh membuka area aplikasi. */
export const aksesAktif = () => getState().akses === 'aktif';
