// scripts/bootstrap.ts
import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';
import * as fs from 'fs';

// Pastikan file serviceAccountKey.json ada di folder root proyek
if (!fs.existsSync('./serviceAccountKey.json')) {
  console.error('Error: File serviceAccountKey.json tidak ditemukan!');
  process.exit(1);
}

initializeApp({
  credential: cert('./serviceAccountKey.json')
});

const db = getFirestore('default');

async function runBootstrap() {
  const sekolahId = 'skl_001';
  const superadminUid = 'uid_superadmin_01';

  console.log('--- MEMULAI INI SIALISASI DATA ASTANSE ---');

  // 1. Dokumen Sekolah Utama
  await db.collection('sekolah').doc(sekolahId).set({
    sekolahId: sekolahId,
    nama: 'SMAN 1 Tanjung Bunga',
    npsn: '20101001',
    alamat: 'Jl. Lintas Tanjung Bunga',
    kota: 'Flores Timur',
    provinsi: 'Nusa Tenggara Timur',
    kepsekUid: superadminUid,
    logoUrl: null,
    tahunAjaranAktif: '2026/2027',
    semesterAktif: 'ganjil',
    paket: 'free',
    aktif: true,
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp()
  });

  // 2. Dokumen Superadmin
  await db.collection('users').doc(superadminUid).set({
    uid: superadminUid,
    email: 'admin@sekolah.sch.id',
    nama: 'Raimundus Ciku Koten',
    role: 'superadmin',
    nip: '198501012010011001',
    sekolahId: sekolahId,
    mapelIds: ['mtk'],
    kelasIds: [],
    fotoUrl: null,
    telepon: '081234567890',
    aktif: true,
    lastLogin: FieldValue.serverTimestamp(),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
    deletedAt: null
  });

  // 3. Tahun Ajaran
  await db.collection('sekolah').doc(sekolahId).collection('tahunAjaran').doc('2026-2027').set({
    tahunId: '2026-2027',
    nama: '2026/2027',
    tanggalMulai: '2026-07-15',
    tanggalSelesai: '2027-06-30',
    semesterAktif: 'ganjil',
    jumlahPekanEfektif: 18,
    aktif: true
  });

  console.log('✅ BOOTSTRAP SUKSES: Struktur awal Firestore berhasil dibentuk!');
}

runBootstrap().catch(console.error);