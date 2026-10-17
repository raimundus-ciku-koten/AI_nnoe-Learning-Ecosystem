import { collection, getDocs, query, where } from 'firebase/firestore';
import { db } from '../../../firebase/index.js';

export async function daftarGuruPerencanaan(tenantId = '') {
  const syarat = [where('role', '==', 'guru')];
  if (tenantId) syarat.push(where('tenantId', '==', tenantId));

  const snapshot = await getDocs(query(collection(db, 'directory'), ...syarat));
  return snapshot.docs
    .map((akun) => ({ uid: akun.id, ...akun.data() }))
    .sort((a, b) => String(a.nama || '').localeCompare(String(b.nama || ''), 'id'));
}
