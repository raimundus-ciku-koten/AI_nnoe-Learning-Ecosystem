/**
 * seed.js — Bootstrap awal Ainnoe.
 *
 * Membuat:
 *   1. Tenant "sekolah-demo"
 *   2. Super admin + admin sekolah + 1 guru demo
 *   3. Beberapa kelas & mapel sample
 *   4. Set custom claims untuk setiap user
 *
 * Prasyarat:
 *   gcloud auth application-default login
 *   atau set GOOGLE_APPLICATION_CREDENTIALS
 *
 * Usage:
 *   node scripts/seed.js
 *   node scripts/seed.js --reset    (hapus data lama terlebih dahulu)
 */
const { applicationDefault, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { getDatabase } = require('firebase-admin/database');
const readline = require('readline');

const projectId = process.env.FIREBASE_PROJECT_ID || 'ainnoe-learning-ecosyste-f7432';
if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId,
    databaseURL: process.env.FIREBASE_DATABASE_URL || `https://${projectId}-default-rtdb.firebaseio.com`,
  });
}

const auth = getAuth();
const db = getFirestore('default');
const rtdb = getDatabase();

const SEED_USERS = [
  {
    email: 'superadmin@ainnoe.id',
    password: 'Ainnoe!Super2026',
    role: 'superadmin',
    nama: 'Super Admin',
    tenantId: null
  },
  {
    email: 'admin@sekolah-demo.sch.id',
    password: 'Ainnoe!Admin2026',
    role: 'admin_sekolah',
    nama: 'Admin Sekolah Demo',
    tenantId: 'sekolah-demo'
  },
  {
    email: 'guru@sekolah-demo.sch.id',
    password: 'Ainnoe!Guru2026',
    role: 'guru',
    nama: 'Bu Maria (Guru Demo)',
    tenantId: 'sekolah-demo'
  }
];

const TENANT_DEMO = {
  id: 'sekolah-demo',
  data: {
    nama: 'SMA Demo Nusantara',
    npsn: '99990001',
    jenjang: 'SMA',
    alamat: 'Jl. Pendidikan No. 1, Kota Demo',
    kepalaSekolah: 'Drs. Ahmad Wijaya, M.Pd.',
    nipKepalaSekolah: '197001011990031001',
    tahunAjaranAktif: '2026/2027',
    kurikulum: 'Merdeka',
    createdAt: FieldValue.serverTimestamp()
  }
};

const CLASSES_DEMO = [
  { id: 'x-1',   nama: 'X-1',   fase: 'E', jenjang: 'SMA', tingkat: 10 },
  { id: 'x-2',   nama: 'X-2',   fase: 'E', jenjang: 'SMA', tingkat: 10 },
  { id: 'xi-f1', nama: 'XI Fase F-1', fase: 'F', jenjang: 'SMA', tingkat: 11 },
  { id: 'xi-f2', nama: 'XI Fase F-2', fase: 'F', jenjang: 'SMA', tingkat: 11 },
  { id: 'xii-1', nama: 'XII-1', fase: 'F', jenjang: 'SMA', tingkat: 12 }
];

const SUBJECTS_DEMO = [
  { id: 'matematika',    nama: 'Matematika' },
  { id: 'b-indonesia',   nama: 'Bahasa Indonesia' },
  { id: 'b-inggris',     nama: 'Bahasa Inggris' },
  { id: 'ipa-fisika',    nama: 'Fisika' },
  { id: 'ipa-biologi',   nama: 'Biologi' },
  { id: 'ips-sejarah',   nama: 'Sejarah' }
];

// ---------------------------------------------------------------------------
async function main() {
  const reset = process.argv.includes('--reset');

  console.log('🌱 Ainnoe Seed Script');
  console.log('   Project :', process.env.FIREBASE_PROJECT_ID || 'ainnoe-learning-ecosyste-f7432');
  console.log('');

  if (reset) {
    const ok = await confirm('Anda menjalankan --reset. Semua user & data demo akan dihapus. Lanjutkan?');
    if (!ok) { console.log('Dibatalkan.'); process.exit(0); }
  }

  // ---------------------------------------------------------------------
  // 1. Tenant
  // ---------------------------------------------------------------------
  console.log('📦 Membuat tenant...');
  const tenantRef = db.collection('tenants').doc(TENANT_DEMO.id);
  await tenantRef.set(TENANT_DEMO.data, { merge: true });
  console.log('   ✅ tenant:', TENANT_DEMO.id);

  // ---------------------------------------------------------------------
  // 2. Kelas & Mapel
  // ---------------------------------------------------------------------
  console.log('📚 Membuat kelas & mapel...');
  const batch = db.batch();
  for (const k of CLASSES_DEMO) {
    batch.set(tenantRef.collection('classes').doc(k.id), {
      ...k, createdAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }
  for (const m of SUBJECTS_DEMO) {
    batch.set(tenantRef.collection('subjects').doc(m.id), {
      ...m, createdAt: FieldValue.serverTimestamp()
    }, { merge: true });
  }
  await batch.commit();
  console.log(`   ✅ ${CLASSES_DEMO.length} kelas, ${SUBJECTS_DEMO.length} mapel`);

  // ---------------------------------------------------------------------
  // 3. Users
  // ---------------------------------------------------------------------
  console.log('👥 Membuat users...');
  const credentialsOutput = [];

  for (const u of SEED_USERS) {
    let userRecord;
    try {
      userRecord = await auth.getUserByEmail(u.email);
      console.log(`   ⟳ ${u.email} sudah ada (uid=${userRecord.uid})`);
    } catch (e) {
      if (e.code === 'auth/user-not-found') {
        userRecord = await auth.createUser({
          email: u.email,
          password: u.password,
          displayName: u.nama,
          emailVerified: true
        });
        console.log(`   ✅ ${u.email} dibuat (uid=${userRecord.uid})`);
      } else {
        throw e;
      }
    }

    // Set custom claims
    const claims = { role: u.role };
    if (u.tenantId) claims.tenantId = u.tenantId;
    await auth.setCustomUserClaims(userRecord.uid, claims);

    // Profil Firestore
    await db.collection('users').doc(userRecord.uid).set({
      uid: userRecord.uid,
      email: u.email,
      nama: u.nama,
      role: u.role,
      tenantId: u.tenantId || null,
      createdAt: FieldValue.serverTimestamp()
    }, { merge: true });
    await db.collection('directory').doc(userRecord.uid).set({
      uid: userRecord.uid,
      nama: u.nama,
      role: u.role,
      tenantId: u.tenantId || '',
      ...(userRecord.photoURL && /^https:\/\//i.test(userRecord.photoURL) && userRecord.photoURL.length <= 600
        ? { photoUrl: userRecord.photoURL }
        : {}),
      updatedAt: FieldValue.serverTimestamp()
    }, { merge: true });
    await rtdb.ref(`chatDirectory/${userRecord.uid}`).set({
      role: u.role,
      tenantId: u.tenantId || '',
      updatedAt: Date.now(),
    });

    credentialsOutput.push({
      Email: u.email,
      Password: u.password,
      Role: u.role,
      Tenant: u.tenantId || '-'
    });
  }

  // ---------------------------------------------------------------------
  // 4. Ringkasan
  // ---------------------------------------------------------------------
  console.log('');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('  ✅ SEED SELESAI');
  console.log('═══════════════════════════════════════════════════════════════');
  console.log('');
  console.log('  Kredensial login (SIMPAN & GANTI SEGERA di production):');
  console.log('');
  console.table(credentialsOutput);
  console.log('');
  console.log('  Langkah berikutnya:');
  console.log('   1. cd web && npm run dev');
  console.log('   2. Buka http://localhost:5173');
  console.log('   3. Login dengan kredensial di atas');
  console.log('   4. ⚠️  Ganti kata sandi default sebelum deploy ke production');
  console.log('');
}

function confirm(question) {
  return new Promise((resolve) => {
    const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
    rl.question(question + ' (y/N): ', (ans) => {
      rl.close();
      resolve(ans.trim().toLowerCase() === 'y');
    });
  });
}

main().catch((e) => {
  console.error('❌ Gagal:', e.message || e);
  process.exit(1);
});