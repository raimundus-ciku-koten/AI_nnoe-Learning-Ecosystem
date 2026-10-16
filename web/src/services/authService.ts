// src/services/authService.ts
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged,
  User as FirebaseUser
} from 'firebase/auth';
import { doc, getDoc, setDoc, updateDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from '../lib/firebase';
import { UserDoc, UserRole } from '../types/schema';

const googleProvider = new GoogleAuthProvider();

/**
 * Melakukan proses login dengan Google Sign-In dan memvalidasi Allowlist
 */
export async function loginWithGoogle(): Promise<UserDoc> {
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const firebaseUser = result.user;
    const email = firebaseUser.email;

    if (!email) {
      throw new Error('Akun Google tidak memiliki alamat email yang valid.');
    }

    const userRef = doc(db, 'users', firebaseUser.uid);
    const userSnap = await getDoc(userRef);

    // Skenario 1: Pengguna sudah memiliki profil di Firestore
    if (userSnap.exists()) {
      await updateDoc(userRef, {
        lastLogin: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      return userSnap.data() as UserDoc;
    }

    // Skenario 2: Pengguna baru, wajib periksa Allowlist di Firestore
    const allowlistRef = doc(db, 'allowlist', email);
    const allowlistSnap = await getDoc(allowlistRef);

    if (!allowlistSnap.exists()) {
      // Tolak akses dan keluar dari sesi Auth jika tidak ada di allowlist
      await signOut(auth);
      throw new Error('Akses ditolak: Email Anda belum terdaftar dalam Allowlist instansi. Hubungi Superadmin.');
    }

    const allowData = allowlistSnap.data();
    const sekolahId = allowData?.sekolahId || 'skl_001';
    const role: UserRole = allowData?.role || 'guru';

    // Buat profil dokumen baru secara otomatis untuk pengguna sah pertama kali
    const newUserProfile: UserDoc = {
      uid: firebaseUser.uid,
      email: email,
      nama: firebaseUser.displayName || 'Guru Pengguna',
      role: role,
      sekolahId: sekolahId,
      mapelIds: [],
      kelasIds: [],
      fotoUrl: firebaseUser.photoURL || null,
      telepon: firebaseUser.phoneNumber || null,
      aktif: true,
      lastLogin: serverTimestamp(),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
      deletedAt: null
    };

    await setDoc(userRef, newUserProfile);
    return newUserProfile;

  } catch (error: any) {
    console.error('Gagal melakukan autentikasi Google:', error);
    throw error;
  }
}

/**
 * Keluar dari sesi aplikasi
 */
export async function logoutUser(): Promise<void> {
  try {
    await signOut(auth);
  } catch (error) {
    console.error('Gagal keluar sesi:', error);
    throw error;
  }
}

/**
 * Listener status perubahan sesi login
 */
export function subscribeAuthChanges(callback: (user: FirebaseUser | null) => void) {
  return onAuthStateChanged(auth, callback);
}