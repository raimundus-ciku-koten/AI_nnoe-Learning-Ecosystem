const { applicationDefault, getApps, initializeApp } = require('firebase-admin/app');
const { getDatabase } = require('firebase-admin/database');
const { getStorage } = require('firebase-admin/storage');

const projectId = process.env.FIREBASE_PROJECT_ID;
const databaseURL = process.env.FIREBASE_DATABASE_URL;
const bucketName = process.env.FIREBASE_STORAGE_BUCKET;
const chatId = process.argv.find((arg) => !arg.startsWith('--'));
const apply = process.argv.includes('--apply');

if (!projectId || !databaseURL || !bucketName) {
  throw new Error('Tetapkan FIREBASE_PROJECT_ID, FIREBASE_DATABASE_URL, dan FIREBASE_STORAGE_BUCKET.');
}
if (!chatId || !/^[A-Za-z0-9_-]{1,160}$/.test(chatId)) {
  throw new Error('Gunakan: node scripts/secureChatAttachments.js <chatId> [--apply]');
}

if (!getApps().length) {
  initializeApp({
    credential: applicationDefault(),
    projectId,
    databaseURL,
    storageBucket: bucketName,
  });
}

function jalurDariUrl(url) {
  if (typeof url !== 'string' || url.length > 1200) return null;
  try {
    const parsed = new URL(url);
    if (parsed.hostname !== 'firebasestorage.googleapis.com') return null;
    const match = /^\/v0\/b\/([^/]+)\/o\/(.+)$/.exec(parsed.pathname);
    if (!match || decodeURIComponent(match[1]) !== bucketName) return null;
    const path = decodeURIComponent(match[2]);
    return new RegExp(`^chat/[A-Za-z0-9_-]{1,128}/${chatId}/[A-Za-z0-9_.-]{1,120}$`).test(path)
      ? path
      : null;
  } catch {
    return null;
  }
}

async function main() {
  const messagesRef = getDatabase().ref(`chats/${chatId}/messages`);
  const snapshot = await messagesRef.get();
  const migrated = [];
  const skipped = [];

  snapshot.forEach((child) => {
    const message = child.val();
    if (message?.filePath && !message.fileUrl) return;
    const filePath = jalurDariUrl(message?.fileUrl);
    if (!filePath) {
      if (message?.fileUrl) skipped.push(child.key);
      return;
    }
    migrated.push({ id: child.key, filePath });
  });

  console.log(`${apply ? 'Menerapkan' : 'Simulasi'}: ${migrated.length} lampiran lama; ${skipped.length} URL tidak dikenali.`);
  if (skipped.length) {
    console.error('Periksa pesan berikut secara manual:', skipped.join(', '));
  }
  if (!apply) {
    console.log('Tidak ada perubahan. Tambahkan --apply untuk mencabut token download dan memperbarui pesan.');
    if (skipped.length) process.exitCode = 1;
    return;
  }

  const bucket = getStorage().bucket(bucketName);
  const gagal = [];
  for (const item of migrated) {
    try {
      const file = bucket.file(item.filePath);
      const [metadata] = await file.getMetadata();
      if (metadata.metadata?.firebaseStorageDownloadTokens) {
        await file.setMetadata({ metadata: { firebaseStorageDownloadTokens: null } });
      }
      await messagesRef.child(item.id).update({
        filePath: item.filePath,
        fileUrl: null,
      });
    } catch (error) {
      console.error(`Gagal mengamankan pesan ${item.id}:`, error?.code || error?.message || error);
      gagal.push(item.id);
    }
  }

  console.log(`Selesai: ${migrated.length - gagal.length} lampiran diamankan; ${gagal.length} gagal.`);
  if (gagal.length || skipped.length) process.exitCode = 1;
}

main().catch((error) => {
  console.error('Migrasi lampiran gagal:', error);
  process.exitCode = 1;
});
