// web/src/hooks/useProfilGuru.js
import { useEffect, useState } from 'react';
import { doc, onSnapshot } from 'firebase/firestore';
import { onAuthStateChanged } from 'firebase/auth';
import { db, auth } from '../firebase'; // Sesuaikan path jika perlu

/**
 * Hook untuk mengambil data profil Guru secara real-time dari Firestore.
 * 
 * PENTING: Pastikan di Firebase Console, Anda memiliki koleksi bernama 'users' 
 * (atau 'teachers') di mana ID dokumennya sama dengan UID user yang login.
 */
export function useProfilGuru() {
  const [profil, setProfil] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let aktif = true;
    let berhentiSnapshot = null;

    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      berhentiSnapshot?.();
      berhentiSnapshot = null;

      if (!user) {
        setProfil(null);
        setError(null);
        setLoading(false);
        return;
      }

      setLoading(true);
      setError(null);

      // ⚠️ SESUAIKAN NAMA KOLEKSI DI SINI
      // Jika di Firebase Console koleksi Anda bernama 'teachers', ganti 'users' menjadi 'teachers'.
      const docRef = doc(db, 'users', user.uid);

      berhentiSnapshot = onSnapshot(
        docRef,
        (docSnap) => {
          if (!aktif) return;

          if (docSnap.exists()) {
            const data = docSnap.data();
            setProfil({
              // Prioritaskan data dari Firestore Console
              nama: data.nama || data.name || user.displayName || 'Tanpa Nama',
              email: data.email || user.email,
              peran: data.role || data.peran || 'Guru',
              ...data, // Sertakan field lain seperti NIP, Instansi, dll.
            });
          } else {
            // Fallback jika dokumen belum dibuat di Firestore
            console.warn(`[Firestore] Dokumen user ${user.uid} tidak ditemukan di koleksi 'users'.`);
            setProfil({
              nama: user.displayName || 'Tanpa Nama',
              email: user.email,
              peran: 'Guru',
            });
          }
          setLoading(false);
        },
        (err) => {
          if (!aktif) return;

          console.error('[Firestore] Error listening to profile:', err);
          setError(err.message);
          setLoading(false);
        }
      );
    });

    return () => {
      aktif = false;
      berhentiSnapshot?.();
      unsubscribeAuth();
    };
  }, []);

  return { profil, loading, error };
}