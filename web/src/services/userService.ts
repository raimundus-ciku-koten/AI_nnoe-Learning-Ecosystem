// Contoh di file: src/services/userService.ts
import { doc, getDoc } from 'firebase/firestore';
import { db } from '../lib/firebase';
import { UserDoc } from '../types/schema'; // Import interface yang telah dibuat

export async function getUserProfile(uid: string): Promise<UserDoc | null> {
  const userRef = doc(db, 'users', uid);
  const snapshot = await getDoc(userRef);

  if (snapshot.exists()) {
    // VS Code akan otomatis mengenali semua atribut (nama, role, sekolahId, dll.)
    return snapshot.data() as UserDoc; 
  }
  return null;
}