const { applicationDefault, getApps, initializeApp } = require('firebase-admin/app');
const { getAuth } = require('firebase-admin/auth');
const { getStorage } = require('firebase-admin/storage');

const projectId = process.env.FIREBASE_PROJECT_ID;
const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
const apply = process.argv.includes('--apply');

if (!projectId || !bucketName) {
  throw new Error('Tetapkan FIREBASE_PROJECT_ID dan FIREBASE_STORAGE_BUCKET.');
}
if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId,
    storageBucket: bucketName,
  });
}

async function main() {
  const bucket = getStorage().bucket(bucketName);
  let pageToken;
  let ditemukan = 0;
  let gagal = 0;

  do {
    const page = await getAuth().listUsers(500, pageToken);
    for (const user of page.users) {
      const file = bucket.file(`fotoProfil/${user.uid}.jpg`);
      try {
        const [metadata] = await file.getMetadata();
        if (!metadata.metadata?.firebaseStorageDownloadTokens) continue;
        ditemukan += 1;
        if (apply) {
          await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: null } });
        }
      } catch (error) {
        if (error.code === 404) continue;
        console.error(`Gagal memeriksa foto ${user.uid}:`, error?.code || error?.message || error);
        gagal += 1;
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);

  console.log(`${apply ? 'Dicabut' : 'Akan dicabut'}: ${ditemukan} token foto profil; ${gagal} gagal.`);
  if (!apply) console.log('Tidak ada perubahan. Tambahkan --apply untuk mencabut token download.');
  if (gagal) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Migrasi token foto profil gagal:', error);
  process.exitCode = 1;
});
