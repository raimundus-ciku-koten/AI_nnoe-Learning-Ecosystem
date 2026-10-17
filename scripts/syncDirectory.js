/**
 * Backfill direktori Cari Orang untuk semua akun Authentication terprovisi.
 *
 * Prasyarat:
 *   gcloud auth application-default login
 *   atau set GOOGLE_APPLICATION_CREDENTIALS
 *
 * Usage:
 *   node scripts/syncDirectory.js
 *   FIREBASE_PROJECT_ID=project-id node scripts/syncDirectory.js
 */
const { applicationDefault, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { FieldValue, getFirestore } = require('firebase-admin/firestore');
const { getDatabase } = require('firebase-admin/database');

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
const PAGE_SIZE = 300;
const PERAN_VALID = new Set(['superadmin', 'admin_sekolah', 'operator', 'guru', 'siswa', 'ortu', 'orang_tua']);

async function main() {
  let pageToken;
  let diperbarui = 0;
  let dilewati = 0;

  do {
    const page = await auth.listUsers(PAGE_SIZE, pageToken);
    const profil = await db.getAll(...page.users.map((user) => db.doc(`users/${user.uid}`)));
    const batch = db.batch();
    const mirror = {};
    let jumlahPerubahan = 0;

    page.users.forEach((user, index) => {
      const claims = user.customClaims || {};
      const role = claims.role;
      const tenantId = role === 'superadmin' ? '' : claims.tenantId;
      const dataProfil = profil[index].data() || {};
      const ref = db.doc(`directory/${user.uid}`);
      if (user.disabled || dataProfil.aktif === false || !PERAN_VALID.has(role) ||
          (role !== 'superadmin' && !tenantId)) {
        batch.delete(ref);
        mirror[`chatDirectory/${user.uid}`] = null;
        jumlahPerubahan += 1;
        dilewati += 1;
        return;
      }

      batch.set(ref, {
        uid: user.uid,
        nama: String(dataProfil.nama || user.displayName || user.email || 'Pengguna').slice(0, 120),
        role,
        tenantId,
        ...(user.photoURL && /^https:\/\//i.test(user.photoURL) && user.photoURL.length <= 600
          ? { photoUrl: user.photoURL }
          : {}),
        updatedAt: FieldValue.serverTimestamp(),
      });
      mirror[`chatDirectory/${user.uid}`] = {
        role,
        tenantId,
        updatedAt: Date.now(),
      };
      jumlahPerubahan += 1;
      diperbarui += 1;
    });

    if (jumlahPerubahan) {
      await batch.commit();
      await rtdb.ref().update(mirror);
    }
    pageToken = page.pageToken;
  } while (pageToken);

  console.log(`Direktori Firestore dan indeks chat selesai disinkronkan: ${diperbarui} akun aktif, ${dilewati} akun tidak aktif/tidak terprovisi dihapus.`);
}

main().catch((error) => {
  console.error('Gagal menyinkronkan direktori:', error);
  process.exitCode = 1;
});
