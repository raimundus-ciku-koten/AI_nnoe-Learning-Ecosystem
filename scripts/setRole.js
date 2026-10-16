/**
 * setRole.js — Set custom claims (role + tenantId) untuk user.
 *
 * Sama seperti: admin.auth().setCustomUserClaims(uid, { role, tenantId })
 * di GAS lama, tapi dijalankan dari mesin lokal.
 *
 * Prasyarat:
 *   - firebase login --reauth
 *   - GOOGLE_APPLICATION_CREDENTIALS=/path/to/service-account.json
 *     atau jalankan: gcloud auth application-default login
 *
 * Usage:
 *   node scripts/setRole.js <UID> <role> [tenantId]
 *   node scripts/setRole.js <UID> <role> [tenantId] --list
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
const VALID_ROLES = ['superadmin', 'admin_sekolah', 'guru', 'siswa', 'ortu'];

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--list')) {
    const list = await auth.listUsers(1000);
    console.table(list.users.map(u => ({
      uid: u.uid,
      email: u.email,
      role: u.customClaims?.role || '-',
      tenantId: u.customClaims?.tenantId || '-'
    })));
    process.exit(0);
  }

  const [uid, role, tenantId] = args;

  if (!uid || !role) {
    console.error('Usage: node setRole.js <UID> <role> [tenantId]');
    console.error('Roles :', VALID_ROLES.join(' | '));
    process.exit(1);
  }
  if (!VALID_ROLES.includes(role)) {
    console.error(`Role "${role}" tidak valid. Pilih: ${VALID_ROLES.join(' | ')}`);
    process.exit(1);
  }

  const claims = { role };
  if (role !== 'superadmin') {
    if (!tenantId) {
      console.error('Role selain superadmin wajib menyertakan tenantId.');
      process.exit(1);
    }
    claims.tenantId = tenantId;
  }

  try {
    // Pastikan user ada
    const user = await auth.getUser(uid);
    await auth.setCustomUserClaims(uid, claims);
    await db.collection('directory').doc(uid).set({
      uid,
      nama: String(user.displayName || user.email || 'Pengguna').slice(0, 120),
      role,
      tenantId: tenantId || '',
      ...(user.photoURL && /^https:\/\//i.test(user.photoURL) && user.photoURL.length <= 600
        ? { photoUrl: user.photoURL }
        : {}),
      updatedAt: FieldValue.serverTimestamp(),
    });
    await rtdb.ref(`chatDirectory/${uid}`).set({
      role,
      tenantId: tenantId || '',
      updatedAt: Date.now(),
    });

    console.log('✅ Claim terpasang');
    console.log('   UID      :', uid);
    console.log('   Email    :', user.email || '-');
    console.log('   Claims   :', JSON.stringify(claims));
    console.log('   Direktori: disinkronkan untuk fitur Cari Orang');
    console.log('');
    console.log('⚠️  User harus logout & login ulang agar claim baru terbaca.');
    process.exit(0);
  } catch (e) {
    console.error('❌ Gagal:', e.message);
    process.exit(1);
  }
}

main();