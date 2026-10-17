import {
  addDoc, collection, deleteDoc, doc, getDocs, limit, orderBy, query,
  serverTimestamp, updateDoc,
} from 'firebase/firestore';
import { db } from '../firebase/index.js';

function koleksiSoal(tenantId) {
  if (!tenantId) throw new Error('Akun ini belum terhubung dengan tenant sekolah.');
  return collection(db, 'tenants', tenantId, 'questionBank');
}

export async function muatBankSoal(tenantId) {
  const hasil = await getDocs(query(koleksiSoal(tenantId), orderBy('updatedAt', 'desc'), limit(100)));
  return hasil.docs.map((item) => ({ id: item.id, ...item.data() }));
}

export function tambahSoalBank(tenantId, ownerUid, soal) {
  if (!ownerUid) throw new Error('Sesi pengguna tidak tersedia.');
  return addDoc(koleksiSoal(tenantId), {
    ...soal,
    ownerUid,
    createdAt: serverTimestamp(),
    updatedAt: serverTimestamp(),
  });
}

export function ubahSoalBank(tenantId, questionId, soal) {
  return updateDoc(doc(koleksiSoal(tenantId), questionId), {
    ...soal,
    updatedAt: serverTimestamp(),
  });
}

export function hapusSoalBank(tenantId, questionId) {
  return deleteDoc(doc(koleksiSoal(tenantId), questionId));
}
