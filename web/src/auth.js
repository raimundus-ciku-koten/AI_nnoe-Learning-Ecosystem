// web/src/auth.js
/**
 * auth.js — Autentikasi & pembacaan peran (kompatibel paket Spark).
 *
 * Menggabungkan dua versi:
 *   - Versi A (cache-first): claims dibaca tanpa jaringan, profil dari cache
 *     Firestore, timeout guard, refresh di latar belakang.
 *   - Google Sign-In memeriksa profil dan custom claims yang sudah diprovisikan;
 *     proses login tidak dapat menetapkan peran atau tenant dari klien.
 */
import {
  signInWithEmailAndPassword,
  signOut,
  onAuthStateChanged,
  sendPasswordResetEmail,
  updateProfile,
  signInWithPopup,
  GoogleAuthProvider,
  getAdditionalUserInfo,
  linkWithPopup,
  reauthenticateWithPopup,
  unlink,
} from 'firebase/auth';
import {
  doc, getDoc, getDocFromCache, setDoc, updateDoc, serverTimestamp,
} from 'firebase/firestore';
import { auth, persistenceReady } from './firebase/core/auth.js';
import { db } from './firebase/core/firestore.js';
import { setState, getState, tunggu } from './state.js';
import { simpanProfil, hapusProfil } from './ui.js';
import { normalisasiNama } from './utils/nama.js';

const BATAS_LOGIN_MS  = 20000;
const BATAS_PROFIL_MS = 6000;
const BATAS_SESI_MS   = 8000;

const googleProvider = new GoogleAuthProvider();
const workspaceProvider = new GoogleAuthProvider();
workspaceProvider.addScope('https://www.googleapis.com/auth/drive.file');
workspaceProvider.addScope('https://www.googleapis.com/auth/calendar.events.owned');
workspaceProvider.addScope('https://www.googleapis.com/auth/gmail.send');
workspaceProvider.setCustomParameters({ prompt: 'consent', access_type: 'online' });
let workspaceSession = null;

const STATE_KOSONG = Object.freeze({
  user: null, profile: null, role: null, tenantId: null,
  isDemo: false, claims: null, sesiMemuat: false,
});

// ---------------------------------------------------------------------------
// Util
// ---------------------------------------------------------------------------
function denganBatas(janji, ms, buatGalat) {
  let timer;
  const batas = new Promise((_, tolak) => {
    timer = setTimeout(() => tolak(buatGalat ? buatGalat() : new Error('Waktu habis')), ms);
  });
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
  const userOut = {
    uid:         user.uid,
    email:       user.email || '',
    displayName: ringkas.nama || user.displayName || (user.email || '').split('@')[0] || 'Pengguna',
    photoURL:    teks(profil.photoUrl) || user.photoURL || '',
  };

  return {
    user: userOut,
    profile: ringkas,
    role,
    tenantId: claims.tenantId || teks(profil.tenantId) || null,
    isDemo:   role === 'demo' || claims.isDemo === true,
    claims,
    authReady: true,
  };
}

// ---------------------------------------------------------------------------
// Login
// ---------------------------------------------------------------------------
export async function login(email, sandi) {
  await persistenceReady;
  const cred = await denganBatas(
    signInWithEmailAndPassword(auth, email, sandi),
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
 * Keluar dari sesi Firebase.
 *
 * PENTING — kenapa state dikosongkan di sini, bukan menunggu listener:
 *   `signOut(auth)` resolve lebih cepat daripada `onAuthStateChanged` fire.
 *   Bila pemanggil langsung navigasi ke `#/login` sesudah `await logout()`,
 *   dan `state.user` belum null, router akan redirect balik ke `#/dashboard`.
 *   Kita kosongkan state SINKRON di sini supaya pemanggil boleh langsung
 *   navigasi. `onAuthStateChanged` akan fire user=null setelah ini dan
 *   mengosongkan state sekali lagi — idempoten.
 */
export async function logout() {
  const uid = getState().user?.uid;
  workspaceSession = null;
  try {
    const { clearBrowserAiSession } = await import('./services/browserAi.js');
    clearBrowserAiSession(uid);
  } catch (err) {
    console.error('[auth] Gagal membersihkan kunci AI dari memori sesi:', err);
  }

  // 1. Tutup sesi Firebase (hapus token dari IndexedDB).
  try {
    await signOut(auth);
  } catch (err) {
    console.warn('[auth] signOut gagal, state tetap dikosongkan:', err?.code || err?.message);
  }

  // 2. Kosongkan state segera — tidak menunggu onAuthStateChanged.
  setState({ ...STATE_KOSONG });

  // 3. Bersihkan cache profil lokal untuk uid yang keluar.
  if (uid) {
    try { hapusProfil(uid); } catch { /* abaikan */ }
  }
}

export function resetPassword(email) {
  return sendPasswordResetEmail(auth, email);
}

// ---------------------------------------------------------------------------
// Login Google hanya untuk akun yang sudah diprovisikan server.
// ---------------------------------------------------------------------------
export async function masukGoogle() {
  await persistenceReady;
  const cred = await signInWithPopup(auth, googleProvider);
  const user = cred.user;
  try {
    let token;
    try {
      token = await user.getIdTokenResult(true);
    } catch (cause) {
      throw Object.assign(
        new Error('Google berhasil mengautentikasi akun, tetapi klaim akses Firebase tidak dapat diperiksa.'),
        { code: 'auth/claims-verification-failed', cause },
      );
    }
    const claims = token.claims || {};
    if (!claims.role || (claims.role !== 'superadmin' && !claims.tenantId)) {
      throw Object.assign(
        new Error('Akun Google belum memiliki peran dan sekolah yang ditetapkan administrator.'),
        { code: 'auth/workspace-account-not-provisioned' },
      );
    }

    let snap;
    try {
      snap = await getDoc(doc(db, 'users', user.uid));
    } catch (cause) {
      throw Object.assign(
        new Error('Google berhasil mengautentikasi akun, tetapi profil Firestore tidak dapat diverifikasi. Periksa Firestore Rules, App Check, dan koneksi Firebase.'),
        { code: 'auth/profile-verification-failed', cause, firebaseCode: cause?.code },
      );
    }
    const emailProfil = String(snap.data()?.email || '').trim().toLowerCase();
    const emailGoogle = String(user.email || '').trim().toLowerCase();
    if (!snap.exists() || !emailGoogle || emailProfil !== emailGoogle || snap.data()?.aktif === false) {
      throw Object.assign(
        new Error('Akun Google ini belum terdaftar aktif di sekolah Anda. Hubungi administrator.'),
        { code: 'auth/workspace-account-not-provisioned' },
      );
    }

    try { await tunggu((s) => s.user?.uid === user.uid, BATAS_SESI_MS); } catch { /* UI memakai listener auth */ }
    return user;
  } catch (error) {
    try {
      await signOut(auth);
    } catch (signOutError) {
      console.error('[auth] Tidak dapat membersihkan sesi Google yang belum tervalidasi:', signOutError);
    }
    setState({ ...STATE_KOSONG });
    throw error;
  }
}

/**
 * Minta izin layanan Google untuk akun yang sama dengan identitas aplikasi.
 * Access token hanya dikembalikan ke pemanggil dan tidak disimpan di disk.
 */
export async function hubungkanGoogleWorkspace() {
  const user = auth.currentUser;
  if (!user) throw Object.assign(new Error('Masuk terlebih dahulu.'), { code: 'auth/not-authenticated' });

  const sudahTerhubung = user.providerData.some((provider) => provider.providerId === 'google.com');
  const hasil = sudahTerhubung
    ? await reauthenticateWithPopup(user, workspaceProvider)
    : await linkWithPopup(user, workspaceProvider);
  const info = getAdditionalUserInfo(hasil);
  const akunGoogle = String(
    info?.profile?.email ||
    hasil.user.providerData.find((provider) => provider.providerId === 'google.com')?.email ||
    '',
  ).trim().toLowerCase();
  const akunAplikasi = String(user.email || '').trim().toLowerCase();

  if (!akunGoogle || akunGoogle !== akunAplikasi) {
    if (!sudahTerhubung) {
      try {
        await unlink(hasil.user, 'google.com');
      } catch (error) {
        console.error('[workspace] Gagal membatalkan tautan akun Google yang tidak cocok:', error);
      }
    }
    throw Object.assign(
      new Error('Gunakan akun Google Workspace dengan alamat email yang sama seperti akun AI_nnoe.'),
      { code: 'ale/google-email-mismatch' },
    );
  }

  const credential = GoogleAuthProvider.credentialFromResult(hasil);
  if (!credential?.accessToken) {
    throw Object.assign(
      new Error('Google tidak memberikan izin layanan. Coba hubungkan ulang dan setujui akses yang diminta.'),
      { code: 'ale/google-token-missing' },
    );
  }
  workspaceSession = {
    accessToken: credential.accessToken,
    email: akunGoogle,
    expiresAt: Date.now() + 45 * 60 * 1000,
    uid: user.uid,
  };
  return workspaceSession;
}

export function tokenGoogleWorkspaceAktif() {
  const user = auth.currentUser;
  if (!user || workspaceSession?.uid !== user.uid || workspaceSession.expiresAt <= Date.now()) {
    workspaceSession = null;
    return '';
  }
  return workspaceSession.accessToken;
}

// ---------------------------------------------------------------------------
// Listener utama
// ---------------------------------------------------------------------------
let versiSesi = 0;

export function pantaulogin(onReady, onUbah) {
  return onAuthStateChanged(auth, async (user) => {
    const saya = ++versiSesi;

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

    setState({ ...rakitState(user, claims, profil), sesiMemuat: false });
    onReady?.(user);

    if (!dariServer) segarkanProfil(user, claims, saya, onUbah);
  });
}

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
// Perbarui profil (nama, foto)
// ---------------------------------------------------------------------------
export async function updateProfil({ nama, photoURL }) {
  const user = auth.currentUser;
  if (!user) throw new Error('Belum login.');
  const namaBaru = nama ? normalisasiNama(nama) : '';
  if (namaBaru) {
    const profileRef = doc(db, 'users', user.uid);
    const profile = await getDoc(profileRef);
    if (profile.exists()) {
      await updateDoc(profileRef, { nama: namaBaru });
    } else {
      await setDoc(profileRef, {
        nama: namaBaru,
        email: user.email || '',
        dibuat: serverTimestamp(),
      });
    }
  }
  await updateProfile(user, {
    displayName: namaBaru || user.displayName,
    photoURL:    photoURL || user.photoURL,
  });
  const sekarang = getState().user;
  setState({
    user: {
      ...sekarang,
      displayName: namaBaru || sekarang.displayName,
      photoURL:    photoURL || sekarang.photoURL,
    },
    ...(namaBaru ? { profile: { ...getState().profile, nama: namaBaru } } : {}),
  });
}