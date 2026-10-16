// web/src/auth.js
/**
 * auth.js — Autentikasi & pembacaan peran (kompatibel paket Spark).
 *
 *  - Cache-first: claims dibaca tanpa jaringan, profil dari cache Firestore,
 *    timeout guard, sinkron server di latar belakang.
 *  - Google Sign-In + auto-buat dokumen users/{uid} (role 'guru', dibatasi
 *    oleh firestore.rules agar tidak bisa eskalasi hak akses).
 *
 * KEAMANAN: peran/tenant/langganan di UI hanya untuk tampilan. Penegakan
 * sebenarnya WAJIB di Firestore Security Rules / Cloud Functions.
 */
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider,
} from 'firebase/auth';
import {
  doc, getDoc, getDocFromCache, setDoc, serverTimestamp,
} from 'firebase/firestore';
import { auth, db } from './firebase.js';
import { setState, getState, tunggu } from './state.js';
import { simpanProfil, hapusProfil } from './ui.js';

const BATAS_LOGIN_MS  = 20000;
const BATAS_PROFIL_MS = 6000;
const BATAS_SESI_MS   = 8000;

const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

// Keadaan saat tidak ada pengguna. authReady=true: sesi SUDAH diperiksa.
const STATE_KOSONG = Object.freeze({
  user: null, profile: null, role: null, tenantId: null,
  isDemo: false, claims: null, authReady: true,
});

// ---------------------------------------------------------------------------
// Util
// ---------------------------------------------------------------------------
function denganBatas(janji, ms, buatGalat) {
  let timer;
  const batas = new Promise((_, tolak) => {
    timer = setTimeout(() => tolak(buatGalat ? buatGalat() : new Error('Waktu habis')), ms);
  });
  // Cegah "unhandled rejection" bila janji asli gagal SETELAH batas waktu lewat.
  Promise.resolve(janji).catch(() => {});
  return Promise.race([janji, batas]).finally(() => clearTimeout(timer));
}

async function bacaClaims(user, paksa = false) {
  try { return (await user.getIdTokenResult(paksa)).claims || {}; }
  catch { return {}; }
}

async function bacaProfilCache(uid) {
  try {
    const snap = await getDocFromCache(doc(db, 'users', uid));
    return snap.exists() ? snap.data() : null;
  } catch { return null; }
}

async function bacaProfilServer(uid) {
  const snap = await getDoc(doc(db, 'users', uid));
  return snap.exists() ? snap.data() : {};
}

const teks = (v) => (typeof v === 'string' ? v.trim() : '');

function ringkasProfil(profil) {
  return {
    nama:        teks(profil.nama),
    sekolah:     teks(profil.sekolah),
    langganan:   profil.langganan === true || profil.langganan === 'aktif',
    logoSekolah: teks(profil.logoSekolah),
  };
}

function rakitState(user, claims, profil) {
  const ringkas = ringkasProfil(profil);
  simpanProfil(user.uid, ringkas);

  const role = claims.role || teks(profil.role) || null;
  return {
    user: {
      uid:         user.uid,
      email:       user.email || '',
      displayName: ringkas.nama || user.displayName || (user.email || '').split('@')[0] || 'Pengguna',
      photoURL:    teks(profil.photoUrl) || user.photoURL || '',
    },
    profile:  ringkas,
    role,
    tenantId: claims.tenantId || teks(profil.tenantId) || null,
    isDemo:   role === 'demo' || claims.isDemo === true,
    claims,
    authReady: true,
  };
}

/** Terjemahkan kode galat Firebase Auth → pesan ramah (Bahasa Indonesia). */
export function pesanGalatAuth(err) {
  switch (err?.code) {
    case 'auth/invalid-email':             return 'Format email tidak valid.';
    case 'auth/missing-password':          return 'Kata sandi belum diisi.';
    case 'auth/user-disabled':             return 'Akun ini dinonaktifkan. Hubungi administrator.';
    case 'auth/user-not-found':
    case 'auth/wrong-password':
    case 'auth/invalid-credential':
    case 'auth/invalid-login-credentials': return 'Email atau kata sandi salah.';
    case 'auth/too-many-requests':         return 'Terlalu banyak percobaan. Tunggu beberapa menit lalu coba lagi.';
    case 'auth/network-request-failed':    return 'Koneksi bermasalah. Periksa internet Anda lalu coba lagi.';
    case 'auth/popup-blocked':             return 'Pop-up diblokir browser. Izinkan pop-up untuk situs ini.';
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':   return '';  // dibatalkan pengguna — bukan galat
    case 'auth/unauthorized-domain':       return 'Domain ini belum diizinkan di Firebase Authentication.';
    case 'auth/operation-not-allowed':     return 'Metode masuk ini belum diaktifkan di Firebase Console.';
    case 'permission-denied':              return 'Akses ditolak oleh aturan keamanan.';
    default:                               return 'Terjadi kesalahan. Silakan coba lagi.';
  }
}

// ---------------------------------------------------------------------------
// Versi sesi — membuang hasil async yang sudah usang (race condition)
// ---------------------------------------------------------------------------
let versiSesi = 0;

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
export async function login(email, sandi) {
  const cred = await denganBatas(
    signInWithEmailAndPassword(auth, teks(email).toLowerCase(), sandi),
    BATAS_LOGIN_MS,
    () => Object.assign(
      new Error('Koneksi ke server autentikasi terlalu lama.'),
      { code: 'auth/network-request-failed' }
    )
  );

  try { await cred.user.getIdTokenResult(true); } catch { /* abaikan */ }
  try { await tunggu((s) => s.user?.uid === cred.user.uid, BATAS_SESI_MS); } catch { /* abaikan */ }
  return cred.user;
}

/**
 * Keluar. State dikosongkan SINKRON di sini (tidak menunggu listener) karena
 * signOut() resolve lebih cepat daripada onAuthStateChanged; tanpa ini router
 * bisa me-redirect balik ke #/dashboard. Idempoten dengan listener.
 */
export async function logout() {
  const uid = getState().user?.uid;
  versiSesi++; // batalkan pemuatan profil yang sedang berjalan

  try {
    await signOut(auth);
  } catch (err) {
    console.warn('[auth] signOut gagal, state tetap dikosongkan:', err?.code || err?.message);
  }

  setState({ ...STATE_KOSONG });
  if (uid) { try { hapusProfil(uid); } catch { /* abaikan */ } }
}

export function resetPassword(email) {
  return sendPasswordResetEmail(auth, teks(email).toLowerCase());
}

// ---------------------------------------------------------------------------
// Login Google + auto-buat users/{uid}
// ---------------------------------------------------------------------------
export async function masukGoogle() {
  const cred = await signInWithPopup(auth, googleProvider);
  const user = cred.user;
  const userRef = doc(db, 'users', user.uid);

  try {
    const snap = await getDoc(userRef);
    if (!snap.exists()) {
      // Field & nilai harus persis sesuai firestore.rules (allow create).
      await setDoc(userRef, {
        uid:       user.uid,
        email:     (user.email || '').toLowerCase(),
        nama:      user.displayName || (user.email || '').split('@')[0] || '',
        photoUrl:  user.photoURL || '',
        role:      'guru',
        aktif:     true,
        createdAt: serverTimestamp(),
        lastLogin: serverTimestamp(),
      });
    } else {
      try { await setDoc(userRef, { lastLogin: serverTimestamp() }, { merge: true }); }
      catch { /* tidak boleh menulis lastLogin — abaikan */ }
    }
  } catch (err) {
    // Login Auth sudah berhasil; kegagalan dokumen profil tidak boleh menggagalkan masuk.
    console.warn('[auth] sinkron dokumen users gagal:', err?.code || err?.message);
  }

  try { await user.getIdTokenResult(true); } catch { /* abaikan */ }
  try { await tunggu((s) => s.user?.uid === user.uid, BATAS_SESI_MS); } catch { /* abaikan */ }
  return user;
}

// ---------------------------------------------------------------------------
// Listener utama
// ---------------------------------------------------------------------------
/**
 * @param {(user: import('firebase/auth').User|null) => void} [onReady]
 * @param {() => void} [onUbah] dipanggil bila peran/tenant berubah setelah sinkron server.
 * @returns {() => void} fungsi berhenti berlangganan
 */
export function pantauLogin(onReady, onUbah) {
  return onAuthStateChanged(auth, async (user) => {
    const saya = ++versiSesi;

    try {
      if (!user) {
        setState({ ...STATE_KOSONG });
        onReady?.(null);
        return;
      }

      const [claims, profilCache] = await Promise.all([
        bacaClaims(user), bacaProfilCache(user.uid),
      ]);
      if (saya !== versiSesi) return;

      let profil = profilCache;
      let dariServer = false;

      if (!profil) {
        try {
          profil = await denganBatas(bacaProfilServer(user.uid), BATAS_PROFIL_MS);
          dariServer = true;
        } catch (e) {
          console.warn('[auth] profil users/{uid} belum terbaca:', e?.code || e?.message);
          profil = {};
        }
        if (saya !== versiSesi) return;
      }

      setState(rakitState(user, claims, profil));
      onReady?.(user);

      if (!dariServer) segarkanProfil(user, claims, saya, onUbah);
    } catch (e) {
      // Jangan biarkan UI menggantung di layar "memuat".
      console.error('[auth] gagal memproses sesi:', e);
      if (saya === versiSesi) setState({ authReady: true });
    }
  });
}
/** Alias kompatibilitas nama lama. */
export const pantaulogin = pantauLogin;

async function segarkanProfil(user, claims, saya, onUbah) {
  try {
    const profil = await bacaProfilServer(user.uid);
    if (saya !== versiSesi) return;

    const lama = getState();
    const baru = rakitState(user, claims, profil);
    const penting = baru.role !== lama.role || baru.tenantId !== lama.tenantId;

    setState(baru);
    if (penting) onUbah?.();
  } catch (e) {
    console.warn('[auth] sinkron profil dari server gagal:', e?.code || e?.message);
  }
}

// ---------------------------------------------------------------------------
// Perbarui profil (nama, foto) — profil Firebase Auth
// ---------------------------------------------------------------------------
export async function updateProfil({ nama, photoURL } = {}) {
  const user = auth.currentUser;
  if (!user) throw new Error('Belum login.');

  await updateProfile(user, {
    displayName: nama || user.displayName,
    photoURL:    photoURL || user.photoURL,
  });

  const sekarang = getState().user;
  if (!sekarang) return;
  setState({
    user: {
      ...sekarang,
      displayName: nama || sekarang.displayName,
      photoURL:    photoURL || sekarang.photoURL,
    },
  });
}
